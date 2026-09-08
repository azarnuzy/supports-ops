import { Queue, type ConnectionOptions } from "bullmq";

export type FollowUpJob = { ticketId: string; workspaceId: string; aiMessageId: string };
export type AutoResolveJob = { ticketId: string; workspaceId: string; followUpMessageId: string };

const connection: ConnectionOptions = {
  maxRetriesPerRequest: null,
  url: process.env.REDIS_URL ?? "redis://localhost:16379",
};
const queueName = "ticket-follow-up";
let queue: Queue<FollowUpJob | AutoResolveJob> | null = null;

function getQueue() {
  queue ??= new Queue<FollowUpJob | AutoResolveJob>(queueName, { connection });
  return queue;
}

export async function scheduleFollowUp(job: FollowUpJob, delaySeconds: number) {
  const jobs = getQueue();
  await jobs.remove(`follow-up-${job.ticketId}`).catch(() => undefined);
  await jobs.add("follow-up", job, {
    delay: delaySeconds * 1_000,
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

export async function cancelFollowUpTimers(ticketId: string) {
  const jobs = getQueue();
  await Promise.all([
    jobs.remove(`follow-up-${ticketId}`).catch(() => undefined),
    jobs.remove(`auto-resolve-${ticketId}`).catch(() => undefined),
  ]);
}
