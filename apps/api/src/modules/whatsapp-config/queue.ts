import { Queue, type ConnectionOptions } from "bullmq";

export type WhatsAppTurnJob = { sessionId: string; workspaceId: string };

const connection: ConnectionOptions = {
  maxRetriesPerRequest: null,
  url: process.env.REDIS_URL ?? "redis://localhost:16379",
};
let queue: Queue<WhatsAppTurnJob> | undefined;

export async function enqueueWhatsAppTurn(job: WhatsAppTurnJob) {
  queue ??= new Queue<WhatsAppTurnJob>("whatsapp-turn", { connection });
  const jobId = `whatsapp:${job.sessionId}`;
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
