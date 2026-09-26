import { Queue, type ConnectionOptions } from "bullmq";

export type SessionEmailJob = {
  customerName: string;
  email: string;
  sessionLink: string;
};

const connection: ConnectionOptions = {
  connectTimeout: 5_000,
  enableOfflineQueue: false,
  maxRetriesPerRequest: null,
  url: process.env.REDIS_URL ?? "redis://localhost:16379",
};

let sessionEmailQueue: Queue<SessionEmailJob> | null = null;

export function getSessionEmailQueue() {
  sessionEmailQueue ??= new Queue<SessionEmailJob>("session-email", { connection });
  return sessionEmailQueue;
}

export async function enqueueSessionEmail(job: SessionEmailJob) {
  await getSessionEmailQueue().add("send", job, {
    attempts: 3,
    backoff: { delay: 1_000, type: "exponential" },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}
