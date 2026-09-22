import { Queue, type ConnectionOptions } from "bullmq";

export type CreditAlertEmailJob = {
  kind: "LOW_BALANCE" | "CREDIT_EXHAUSTED";
  workspaceId: string;
};

const connection: ConnectionOptions = {
  maxRetriesPerRequest: null,
  url: process.env.REDIS_URL ?? "redis://localhost:16379",
};

let creditAlertEmailQueue: Queue<CreditAlertEmailJob> | null = null;

export function getCreditAlertEmailQueue() {
  creditAlertEmailQueue ??= new Queue<CreditAlertEmailJob>("credit-alert-email", { connection });
  return creditAlertEmailQueue;
}

export async function enqueueCreditAlertEmail(job: CreditAlertEmailJob) {
  await getCreditAlertEmailQueue().add("send", job, {
    attempts: 3,
    backoff: { delay: 1_000, type: "exponential" },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}
