import { Queue, type ConnectionOptions } from "bullmq";
import { injectTraceContext } from "@repo/logger/telemetry";

export type AttachmentProcessJob = {
  attachmentId: string;
  ticketId: string;
  workspaceId: string;
  traceContext?: Record<string, string>;
};

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
  await getAttachmentProcessQueue().add(
    "process",
    { ...job, traceContext: injectTraceContext() },
    {
      attempts: 3,
      backoff: { delay: 2_000, type: "exponential" },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  );
}
