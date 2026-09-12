import { Queue, type ConnectionOptions } from "bullmq";

export type WhatsAppTurnJob = { sessionId: string; workspaceId: string };

const connection: ConnectionOptions = {
  maxRetriesPerRequest: null,
  url: process.env.REDIS_URL ?? "redis://localhost:16379",
};
export type WhatsAppDeliveryJob = { messageId: string };
let queue: Queue<WhatsAppTurnJob | WhatsAppDeliveryJob> | undefined;

function getQueue() {
  queue ??= new Queue<WhatsAppTurnJob | WhatsAppDeliveryJob>("whatsapp-turn", { connection });
  return queue;
}

/** One job per outbound Message, so a permanent failure on one never blocks
 * the next and transient failures back off independently. */
export async function enqueueWhatsAppDelivery(messageId: string) {
  const queue = getQueue();
  const jobId = `whatsapp-deliver-${messageId}`;
  // A finished job would swallow a manual Retry under the same id.
  await queue.remove(jobId).catch(() => undefined);
  await queue.add(
    "deliver",
    { messageId },
    {
      attempts: 6,
      backoff: { delay: 2_000, type: "exponential" },
      jobId,
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  );
}

export async function enqueueWhatsAppTurn(job: WhatsAppTurnJob) {
  const queue = getQueue();
  const jobId = `whatsapp-${job.sessionId}`;
  await queue.remove(jobId).catch(() => undefined);
  await queue.add("reply", job, {
    attempts: 5,
    backoff: { delay: 1_000, type: "exponential" },
    delay: 3_000,
    jobId,
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}
