import { Queue, type ConnectionOptions } from "bullmq";

export type AttachmentProcessJob = { attachmentId: string; ticketId: string; workspaceId: string };

const connection: ConnectionOptions = {
  maxRetriesPerRequest: null,
  url: process.env.REDIS_URL ?? "redis://localhost:16379",
};
let attachmentProcessQueue: Queue<AttachmentProcessJob> | null = null;

export function getAttachmentProcessQueue() {
  attachmentProcessQueue ??= new Queue<AttachmentProcessJob>("attachment-process", { connection });
  return attachmentProcessQueue;
}

export async function enqueueAttachmentProcess(job: AttachmentProcessJob) {
  await getAttachmentProcessQueue().add("process", job, {
    attempts: 3,
    backoff: { delay: 2_000, type: "exponential" },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}
