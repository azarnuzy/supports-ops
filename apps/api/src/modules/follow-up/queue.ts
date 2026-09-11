import { Queue, type ConnectionOptions } from "bullmq";
import { whatsAppTimerDelayMs } from "@repo/channels";
import { unscopedPrisma } from "../../utils/prisma";

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
const queueName = "ticket-follow-up";
let queue: Queue<FollowUpJob | AutoResolveJob | IdleClosureJob> | null = null;

function getQueue() {
  queue ??= new Queue<FollowUpJob | AutoResolveJob | IdleClosureJob>(queueName, { connection });
  return queue;
}

export async function scheduleFollowUp(job: FollowUpJob, delaySeconds: number) {
  const jobs = getQueue();
  const ticket = await unscopedPrisma.ticket.findFirst({
    select: {
      channel: { select: { type: true } },
      session: { select: { customerLastMessageAt: true } },
    },
    where: { id: job.ticketId, workspaceId: job.workspaceId },
  });
  const delay =
    ticket?.channel.type === "WHATSAPP" && ticket.session.customerLastMessageAt
      ? whatsAppTimerDelayMs(ticket.session.customerLastMessageAt, delaySeconds * 1_000, new Date())
      : delaySeconds * 1_000;
  await jobs.remove(`follow-up-${job.ticketId}`).catch(() => undefined);
  await jobs.add("follow-up", job, {
    delay,
    jobId: `follow-up-${job.ticketId}`,
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}

export async function scheduleAutoResolve(job: AutoResolveJob, delaySeconds: number) {
  const jobs = getQueue();
  await jobs.remove(`auto-resolve-${job.ticketId}`).catch(() => undefined);
  await jobs.add("auto-resolve", job, {
    delay: delaySeconds * 1_000,
    jobId: `auto-resolve-${job.ticketId}`,
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}

export async function scheduleIdleClosure(job: IdleClosureJob, idleCloseAfterSeconds: number) {
  const jobs = getQueue();
  const customerLastMessageAt = new Date(job.customerLastMessageAt);
  await jobs.add("idle-close", job, {
    delay:
      job.channelType === "WHATSAPP"
        ? whatsAppTimerDelayMs(customerLastMessageAt, idleCloseAfterSeconds * 1_000, new Date())
        : Math.max(0, customerLastMessageAt.getTime() + idleCloseAfterSeconds * 1_000 - Date.now()),
    jobId: [
      "idle-close",
      job.ticketId,
      job.status,
      job.assignedHumanAgentId ?? "queue",
      new Date(job.customerLastMessageAt).getTime(),
    ].join("-"),
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}

export async function scheduleIdleClosureForTicket(ticketId: string, workspaceId: string) {
  const [ticket, settings] = await Promise.all([
    unscopedPrisma.ticket.findFirst({
      select: {
        assignedHumanAgentId: true,
        channel: { select: { type: true } },
        session: { select: { customerLastMessageAt: true } },
        status: true,
      },
      where: { id: ticketId, workspaceId },
    }),
    unscopedPrisma.aiSettings.findUnique({ where: { workspaceId } }),
  ]);
  if (
    !ticket?.session.customerLastMessageAt ||
    (ticket.status !== "ESCALATED" && ticket.status !== "HUMAN_HANDLING")
  )
    return;
  await scheduleIdleClosure(
    {
      assignedHumanAgentId: ticket.assignedHumanAgentId,
      channelType: ticket.channel.type,
      customerLastMessageAt: ticket.session.customerLastMessageAt.toISOString(),
      status: ticket.status,
      ticketId,
      workspaceId,
    },
    settings?.idleCloseAfterSeconds ?? 28_800,
  );
}

export async function rescheduleIdleClosures(workspaceId: string) {
  const tickets = await unscopedPrisma.ticket.findMany({
    select: { id: true },
    where: { status: { in: ["ESCALATED", "HUMAN_HANDLING"] }, workspaceId },
  });
  await Promise.all(tickets.map((ticket) => scheduleIdleClosureForTicket(ticket.id, workspaceId)));
}

export async function resetTimersAfterCustomerMessage(ticketId: string, workspaceId: string) {
  await cancelFollowUpTimers(ticketId);
  await scheduleIdleClosureForTicket(ticketId, workspaceId);
}

export async function cancelFollowUpTimers(ticketId: string) {
  const jobs = getQueue();
  await Promise.all([
    jobs.remove(`follow-up-${ticketId}`).catch(() => undefined),
    jobs.remove(`auto-resolve-${ticketId}`).catch(() => undefined),
  ]);
}
