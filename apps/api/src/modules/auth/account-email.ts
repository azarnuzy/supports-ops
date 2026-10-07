import { Queue, type ConnectionOptions } from "bullmq";

/** A general transactional email to one account; every account email goes through this job. */
export type AccountEmailJob = {
  html?: string;
  subject: string;
  text: string;
  to: string;
  workspaceId?: string;
};

const connection: ConnectionOptions = {
  connectTimeout: 5_000,
  enableOfflineQueue: false,
  maxRetriesPerRequest: null,
  url: process.env.REDIS_URL ?? "redis://localhost:16379",
};

let accountEmailQueue: Queue<AccountEmailJob> | null = null;

export async function enqueueAccountEmail(job: AccountEmailJob) {
  accountEmailQueue ??= new Queue<AccountEmailJob>("account-email", { connection });
  await accountEmailQueue.add("send", job, {
    attempts: 3,
    backoff: { delay: 1_000, type: "exponential" },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}
