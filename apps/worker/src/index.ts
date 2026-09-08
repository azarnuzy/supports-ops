import { loggerConfig, redisConfig } from "./config";
import { createLogger } from "@repo/logger";
import { Queue, QueueEvents, Worker, type ConnectionOptions, type Job } from "bullmq";
import { processKnowledgeIngestJob, type KnowledgeIngestJob } from "./knowledge-ingest";
import { processAttachmentJob, type AttachmentProcessJob } from "./attachment-process";
import type { ExampleJob } from "./types";
import { sendSessionLinkEmail, type SessionEmailJob } from "./session-email";

export type { ExampleJob } from "./types";

export const logger = createLogger({
  ...loggerConfig,
  service: "worker",
});

export const connection: ConnectionOptions = {
  url: redisConfig.url,
  maxRetriesPerRequest: null,
};

let exampleQueue: Queue<ExampleJob> | null = null;
let exampleQueueEvents: QueueEvents | null = null;

export function getExampleQueue() {
  exampleQueue ??= new Queue<ExampleJob>("example", {
    connection,
  });

  return exampleQueue;
}

export function getExampleQueueEvents() {
  exampleQueueEvents ??= new QueueEvents("example", {
    connection,
  });

  return exampleQueueEvents;
}

export async function processExampleJob(job: Pick<Job<ExampleJob>, "data" | "id">) {
  logger.info({ jobId: job.id, message: job.data.message }, "Processing job");

  return { processedAt: new Date().toISOString() };
}

export function startExampleWorker() {
  return new Worker<ExampleJob>("example", processExampleJob, { connection });
}

export function startSessionEmailWorker() {
  return new Worker<SessionEmailJob>(
    "session-email",
    async (job) => {
      await sendSessionLinkEmail(job.data);
    },
    { connection },
  );
}

export function startKnowledgeIngestWorker() {
  return new Worker<KnowledgeIngestJob>("knowledge-ingest", processKnowledgeIngestJob, {
    connection,
  });
}

export function startAttachmentProcessWorker() {
  return new Worker<AttachmentProcessJob>("attachment-process", processAttachmentJob, {
    connection,
  });
}

export function runWorker() {
  const worker = startExampleWorker();
  const sessionEmailWorker = startSessionEmailWorker();
  const knowledgeIngestWorker = startKnowledgeIngestWorker();
  const attachmentProcessWorker = startAttachmentProcessWorker();

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Job completed");
  });

  worker.on("failed", (job, error) => {
    logger.error({ error, jobId: job?.id }, "Job failed");
  });
  sessionEmailWorker.on("failed", (job, error) => {
    logger.error({ error, jobId: job?.id }, "Session Link email failed");
  });
  knowledgeIngestWorker.on("failed", (job, error) => {
    logger.error({ error, jobId: job?.id }, "Knowledge ingest failed");
  });
  attachmentProcessWorker.on("failed", (job, error) => {
    logger.error({ error, jobId: job?.id }, "Attachment processing failed");
  });

  return { attachmentProcessWorker, knowledgeIngestWorker, sessionEmailWorker, worker };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWorker();
}
