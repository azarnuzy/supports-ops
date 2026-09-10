import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { prisma } from "./prisma";
import { Queue, type ConnectionOptions } from "bullmq";

export type FollowUpJob = { ticketId: string; workspaceId: string; aiMessageId: string };
export type AutoResolveJob = { ticketId: string; workspaceId: string; followUpMessageId: string };
const connection: ConnectionOptions = {
  maxRetriesPerRequest: null,
  url: process.env.REDIS_URL ?? "redis://localhost:16379",
};
let followUpQueue: Queue<AutoResolveJob> | undefined;

async function scheduleAutoResolve(job: AutoResolveJob, delaySeconds: number) {
  followUpQueue ??= new Queue<AutoResolveJob>("ticket-follow-up", { connection });
  await followUpQueue.remove(`auto-resolve:${job.ticketId}`).catch(() => undefined);
  await followUpQueue.add("auto-resolve", job, {
    delay: delaySeconds * 1_000,
    jobId: `auto-resolve:${job.ticketId}`,
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}

let publisher: Redis | undefined;

async function publish(ticketId: string, event: unknown) {
  publisher ??= new Redis(process.env.REDIS_URL ?? "redis://localhost:16379", {
    maxRetriesPerRequest: null,
  });
  await publisher.publish(`supportops:ticket:${ticketId}`, JSON.stringify(event));
}

async function publishQueue(workspaceId: string) {
  publisher ??= new Redis(process.env.REDIS_URL ?? "redis://localhost:16379", {
    maxRetriesPerRequest: null,
  });
  await publisher.publish(
    `supportops:ticket-queue:${workspaceId}`,
    JSON.stringify({ type: "ticket.queue.changed" }),
  );
}

/** A delayed job rechecks the last message inside its transaction. This makes
 * a Customer reply, takeover, Claim, or a newer AI reply win any race with a
 * timer that had just become due. */
export async function processFollowUpJob(job: { data: FollowUpJob }) {
  const result = await prisma.$transaction(async (tx) => {
    const [ticket, settings] = await Promise.all([
      tx.ticket.findFirst({
        include: {
          conversation: true,
          messages: { orderBy: { position: "desc" }, take: 1 },
        },
        where: { id: job.data.ticketId, status: "AI_HANDLING", workspaceId: job.data.workspaceId },
      }),
      tx.aiSettings.findUnique({ where: { workspaceId: job.data.workspaceId } }),
    ]);
    const last = ticket?.messages[0];
    if (
      !ticket?.conversation ||
      !last ||
      last.id !== job.data.aiMessageId ||
      last.senderType !== "AI_AGENT"
    ) {
      return null;
    }

    const updated = await tx.ticket.update({
      data: { messageSeq: { increment: 1 } },
      where: { id: ticket.id },
      select: { messageSeq: true },
    });
    const content = `I’m following up on ${ticket.title}. Did my previous answer resolve this for you?`;
    const message = await tx.message.create({
      data: {
        content,
        deliveryStatus: "PENDING",
        externalMessageId: `follow-up:${ticket.id}`,
        id: randomUUID(),
        memorySessionId: ticket.conversation.id,
        message: { content },
        position: updated.messageSeq,
        role: "assistant",
        runId: randomUUID(),
        senderType: "AI_AGENT",
        ticketId: ticket.id,
        turn: updated.messageSeq,
        webSessionId: ticket.webSessionId,
        workspaceId: ticket.workspaceId,
      },
    });
    await tx.aiActivity.create({
      data: {
        eventType: "FOLLOW_UP_SENT",
        id: randomUUID(),
        metadata: {},
        ticketId: ticket.id,
        workspaceId: ticket.workspaceId,
      },
    });
    return {
      autoResolveAfterSeconds: settings?.autoResolveAfterSeconds ?? 3600,
      autoResolveEnabled: settings?.autoResolveEnabled ?? true,
      message,
    };
  });
  if (!result) return;
  await publish(job.data.ticketId, { type: "message.created", data: result.message });
  if (result.autoResolveEnabled) {
    await scheduleAutoResolve(
      {
        followUpMessageId: result.message.id,
        ticketId: job.data.ticketId,
        workspaceId: job.data.workspaceId,
      },
      result.autoResolveAfterSeconds,
    );
  }
}

export async function processAutoResolveJob(job: { data: AutoResolveJob }) {
  const closing = await prisma.$transaction(async (tx) => {
    const [ticket, settings] = await Promise.all([
      tx.ticket.findFirst({
        include: {
          conversation: true,
          messages: { orderBy: { position: "desc" }, take: 1 },
          workspace: { select: { closingMessage: true } },
        },
        where: { id: job.data.ticketId, status: "AI_HANDLING", workspaceId: job.data.workspaceId },
      }),
      tx.aiSettings.findUnique({ where: { workspaceId: job.data.workspaceId } }),
    ]);
    const last = ticket?.messages[0];
    if (
      !ticket?.conversation ||
      !settings?.autoResolveEnabled ||
      !last ||
      last.id !== job.data.followUpMessageId
    )
      return null;
    const updated = await tx.ticket.update({
      data: {
        messageSeq: { increment: 1 },
        resolvedAt: new Date(),
        resolvedBy: "AI_AGENT",
        resolutionReason: "CUSTOMER_INACTIVE",
        status: "RESOLVED",
      },
      where: { id: ticket.id },
      select: { messageSeq: true },
    });
    await tx.webSession.update({ data: { status: "CLOSED" }, where: { id: ticket.webSessionId } });
    const content = ticket.workspace.closingMessage ?? "This conversation has been resolved.";
    const message = await tx.message.create({
      data: {
        content,
        deliveryStatus: "PENDING",
        externalMessageId: `auto-resolution:${ticket.id}`,
        id: randomUUID(),
        memorySessionId: ticket.conversation.id,
        message: { content },
        position: updated.messageSeq,
        role: "system",
        runId: randomUUID(),
        senderType: "SYSTEM",
        turn: updated.messageSeq,
        webSessionId: ticket.webSessionId,
        workspaceId: ticket.workspaceId,
      },
    });
    await tx.aiActivity.create({
      data: {
        eventType: "RESOLVED",
        id: randomUUID(),
        metadata: { reason: "CUSTOMER_INACTIVE" },
        ticketId: ticket.id,
        workspaceId: ticket.workspaceId,
      },
    });
    return message;
  });
  if (!closing) return;
  await publish(job.data.ticketId, { type: "message.created", data: closing });
  await publish(job.data.ticketId, { type: "ticket.status", data: { status: "resolved" } });
  await publishQueue(closing.workspaceId);
}
