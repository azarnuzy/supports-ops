import { randomUUID } from "node:crypto";
import { enqueueWhatsAppDelivery } from "@repo/api/whatsapp-queue";
import { enqueueTicketKnowledgeIndex } from "@repo/api/ticket-queue";
import { whatsAppTimerDelayMs } from "@repo/channels";
import Redis from "ioredis";
import { prisma } from "./prisma";
import { Queue, type ConnectionOptions } from "bullmq";

export type FollowUpJob = { ticketId: string; workspaceId: string; aiMessageId: string };
export type AutoResolveJob = { ticketId: string; workspaceId: string; followUpMessageId: string };
export type IdleClosureJob = {
  assignedHumanAgentId: string | null;
  channelType?: "WEB" | "WHATSAPP";
  customerLastMessageAt: string;
  status: "ESCALATED" | "HUMAN_HANDLING";
  ticketId: string;
  workspaceId: string;
};
const connection: ConnectionOptions = {
  maxRetriesPerRequest: null,
  url: process.env.REDIS_URL ?? "redis://localhost:16379",
};
let followUpQueue: Queue<AutoResolveJob | IdleClosureJob> | undefined;

async function scheduleAutoResolve(job: AutoResolveJob, delaySeconds: number) {
  followUpQueue ??= new Queue<AutoResolveJob | IdleClosureJob>("ticket-follow-up", { connection });
  await followUpQueue.remove(`auto-resolve-${job.ticketId}`).catch(() => undefined);
  await followUpQueue.add("auto-resolve", job, {
    delay: delaySeconds * 1_000,
    jobId: `auto-resolve-${job.ticketId}`,
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}

async function scheduleIdleClosure(job: IdleClosureJob, delayMs: number) {
  followUpQueue ??= new Queue<AutoResolveJob | IdleClosureJob>("ticket-follow-up", { connection });
  await followUpQueue.add("idle-close", job, {
    delay: Math.max(0, delayMs),
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}

/** The worker writes into the same transcript as the API, so it claims its
 * Message position from the same counter on the Session. The API's own copy
 * lives in `apps/api/src/utils/session-messages.ts`. */
export async function claimMessageSlot(
  tx: Pick<typeof prisma, "session">,
  sessionId: string,
  memorySessionId: string,
) {
  const session = await tx.session.update({
    data: { messageSeq: { increment: 1 } },
    select: { messageSeq: true },
    where: { id: sessionId },
  });
  return {
    id: randomUUID(),
    memorySessionId,
    position: session.messageSeq,
    runId: randomUUID(),
    sessionId,
    turn: session.messageSeq,
  };
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
          channel: { select: { type: true } },
          messages: { orderBy: { position: "desc" }, take: 1 },
          session: { include: { conversation: true } },
        },
        where: { id: job.data.ticketId, status: "AI_HANDLING", workspaceId: job.data.workspaceId },
      }),
      tx.aiSettings.findUnique({ where: { workspaceId: job.data.workspaceId } }),
    ]);
    const last = ticket?.messages[0];
    if (
      !ticket?.session.conversation ||
      !last ||
      last.id !== job.data.aiMessageId ||
      last.senderType !== "AI_AGENT"
    ) {
      return null;
    }

    const content = `I’m following up on ${ticket.title}. Did my previous answer resolve this for you?`;
    const message = await tx.message.create({
      data: {
        ...(await claimMessageSlot(tx, ticket.sessionId, ticket.session.conversation.id)),
        content,
        deliveryStatus: "PENDING",
        externalMessageId: `follow-up:${ticket.id}`,
        message: { content },
        role: "assistant",
        senderType: "AI_AGENT",
        ticketId: ticket.id,
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
    const isWhatsApp = ticket.channel.type === "WHATSAPP";
    return {
      autoResolveDelayMs:
        isWhatsApp && ticket.session.customerLastMessageAt
          ? whatsAppTimerDelayMs(
              ticket.session.customerLastMessageAt,
              (settings?.autoResolveAfterSeconds ?? 3600) * 1_000,
              new Date(),
            )
          : (settings?.autoResolveAfterSeconds ?? 3600) * 1_000,
      autoResolveEnabled: isWhatsApp || (settings?.autoResolveEnabled ?? true),
      deliverWhatsApp: ticket.channel.type === "WHATSAPP",
      message,
    };
  });
  if (!result) return;
  await publish(job.data.ticketId, { type: "message.created", data: result.message });
  if (result.deliverWhatsApp) await enqueueWhatsAppDelivery(result.message.id);
  if (result.autoResolveEnabled) {
    await scheduleAutoResolve(
      {
        followUpMessageId: result.message.id,
        ticketId: job.data.ticketId,
        workspaceId: job.data.workspaceId,
      },
      result.autoResolveDelayMs / 1_000,
    );
  }
}

export async function processAutoResolveJob(job: { data: AutoResolveJob }) {
  const closing = await prisma.$transaction(async (tx) => {
    const [ticket, settings] = await Promise.all([
      tx.ticket.findFirst({
        include: {
          channel: { select: { type: true } },
          messages: { orderBy: { position: "desc" }, take: 1 },
          session: { include: { conversation: true } },
          workspace: { select: { closingMessage: true } },
        },
        where: { id: job.data.ticketId, status: "AI_HANDLING", workspaceId: job.data.workspaceId },
      }),
      tx.aiSettings.findUnique({ where: { workspaceId: job.data.workspaceId } }),
    ]);
    const last = ticket?.messages[0];
    if (
      !ticket?.session.conversation ||
      !settings?.autoResolveEnabled ||
      !last ||
      last.id !== job.data.followUpMessageId
    )
      return null;
    await tx.ticket.update({
      data: {
        resolvedAt: new Date(),
        resolvedBy: "AI_AGENT",
        resolutionReason: "CUSTOMER_INACTIVE",
        status: "RESOLVED",
      },
      where: { id: ticket.id },
    });
    const content = ticket.workspace.closingMessage ?? "This conversation has been resolved.";
    const message = await tx.message.create({
      data: {
        ...(await claimMessageSlot(tx, ticket.sessionId, ticket.session.conversation.id)),
        content,
        deliveryStatus: "PENDING",
        externalMessageId: `auto-resolution:${ticket.id}`,
        message: { content },
        role: "system",
        senderType: "SYSTEM",
        workspaceId: ticket.workspaceId,
      },
    });
    await tx.session.update({ data: { status: "CLOSED" }, where: { id: ticket.sessionId } });
    await tx.aiActivity.create({
      data: {
        eventType: "RESOLVED",
        id: randomUUID(),
        metadata: { reason: "CUSTOMER_INACTIVE" },
        ticketId: ticket.id,
        workspaceId: ticket.workspaceId,
      },
    });
    return { deliverWhatsApp: ticket.channel.type === "WHATSAPP", message };
  });
  if (!closing) return;
  await publish(job.data.ticketId, { type: "message.created", data: closing.message });
  if (closing.deliverWhatsApp) await enqueueWhatsAppDelivery(closing.message.id);
  await enqueueTicketKnowledgeIndex({
    ticketId: job.data.ticketId,
    workspaceId: job.data.workspaceId,
  });
  await publish(job.data.ticketId, { type: "ticket.status", data: { status: "resolved" } });
  await publishQueue(closing.message.workspaceId);
}

class IdleClosureRaceLost extends Error {}

export async function processIdleClosureJob(job: { data: IdleClosureJob }) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const settings = await tx.aiSettings.findUnique({
        where: { workspaceId: job.data.workspaceId },
      });
      const idleCloseAfterSeconds = settings?.idleCloseAfterSeconds ?? 28_800;
      const customerLastMessageAt = new Date(job.data.customerLastMessageAt);
      const remainingMs =
        job.data.channelType === "WHATSAPP"
          ? whatsAppTimerDelayMs(customerLastMessageAt, idleCloseAfterSeconds * 1_000, new Date())
          : customerLastMessageAt.getTime() + idleCloseAfterSeconds * 1_000 - Date.now();
      if (remainingMs > 0) return { remainingMs };

      const resolvedAt = new Date();
      const transition = await tx.ticket.updateMany({
        data: {
          resolvedAt,
          resolvedBy: "PLATFORM",
          resolutionReason:
            job.data.status === "ESCALATED"
              ? "CUSTOMER_INACTIVE_SHARED_QUEUE"
              : "CUSTOMER_INACTIVE_HUMAN_HANDLING",
          status: "RESOLVED",
        },
        where: {
          assignedHumanAgentId: job.data.assignedHumanAgentId,
          id: job.data.ticketId,
          status: job.data.status,
          workspaceId: job.data.workspaceId,
        },
      });
      if (!transition.count) return null;

      const session = await tx.session.findFirst({
        select: {
          channel: { select: { type: true } },
          conversation: { select: { id: true } },
          id: true,
        },
        where: {
          customerLastMessageAt,
          status: "ACTIVE",
          ticket: { id: job.data.ticketId },
          workspaceId: job.data.workspaceId,
        },
      });
      if (!session?.conversation) throw new IdleClosureRaceLost();

      const closed = await tx.session.updateMany({
        data: { closedAt: resolvedAt, status: "CLOSED" },
        where: { customerLastMessageAt, id: session.id, status: "ACTIVE" },
      });
      if (!closed.count) throw new IdleClosureRaceLost();

      const workspace = await tx.workspace.findUniqueOrThrow({
        select: { closingMessage: true },
        where: { id: job.data.workspaceId },
      });
      const content = workspace.closingMessage ?? "This conversation has been resolved.";
      const message = await tx.message.create({
        data: {
          ...(await claimMessageSlot(tx, session.id, session.conversation.id)),
          content,
          deliveryStatus: "PENDING",
          externalMessageId: `idle-closure:${job.data.ticketId}`,
          message: { content },
          role: "system",
          senderType: "SYSTEM",
          ticketId: job.data.ticketId,
          workspaceId: job.data.workspaceId,
        },
      });
      await tx.aiActivity.create({
        data: {
          eventType: "RESOLVED",
          id: randomUUID(),
          metadata: {
            reason:
              job.data.status === "ESCALATED"
                ? "CUSTOMER_INACTIVE_SHARED_QUEUE"
                : "CUSTOMER_INACTIVE_HUMAN_HANDLING",
          },
          ticketId: job.data.ticketId,
          workspaceId: job.data.workspaceId,
        },
      });
      return {
        deliverWhatsApp: session.channel.type === "WHATSAPP",
        message,
        remainingMs: null,
      };
    });
    if (!result) return;
    if (result.remainingMs !== null) {
      await scheduleIdleClosure(job.data, result.remainingMs);
      return;
    }
    await publish(job.data.ticketId, { type: "message.created", data: result.message });
    if (result.deliverWhatsApp) await enqueueWhatsAppDelivery(result.message.id);
    await enqueueTicketKnowledgeIndex({
      ticketId: job.data.ticketId,
      workspaceId: job.data.workspaceId,
    });
    await publish(job.data.ticketId, { type: "ticket.status", data: { status: "resolved" } });
    await publishQueue(job.data.workspaceId);
  } catch (error) {
    if (!(error instanceof IdleClosureRaceLost)) throw error;
  }
}
