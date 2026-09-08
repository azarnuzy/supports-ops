import { loggerConfig, redisConfig } from "./config";
import { createLogger } from "@repo/logger";
import { Queue, QueueEvents, Worker, type ConnectionOptions, type Job } from "bullmq";
import { processKnowledgeIngestJob, type KnowledgeIngestJob } from "./knowledge-ingest";
import { processAttachmentJob, type AttachmentProcessJob } from "./attachment-process";
import type { ExampleJob } from "./types";
import { sendSessionLinkEmail, type SessionEmailJob } from "./session-email";
import { processAutoResolveJob, processFollowUpJob } from "./follow-up";
import type { AutoResolveJob, FollowUpJob } from "./follow-up";
import { processTicketKnowledgeIndexJob, type TicketKnowledgeIndexJob } from "./ticket-knowledge-index";

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

export function startFollowUpWorker() {
  return new Worker<FollowUpJob | AutoResolveJob>("ticket-follow-up", async (job) => {
    if (job.name === "follow-up") return processFollowUpJob({ data: job.data as FollowUpJob });
    return processAutoResolveJob({ data: job.data as AutoResolveJob });
  }, { connection });
}

export function startTicketKnowledgeIndexWorker() {
  return new Worker<TicketKnowledgeIndexJob>(
    "ticket-knowledge-index",
    processTicketKnowledgeIndexJob,
    { connection },
  );
}

export function runWorker() {
  const worker = startExampleWorker();
  const sessionEmailWorker = startSessionEmailWorker();
  const knowledgeIngestWorker = startKnowledgeIngestWorker();
  const attachmentProcessWorker = startAttachmentProcessWorker();
  const followUpWorker = startFollowUpWorker();
  const ticketKnowledgeIndexWorker = startTicketKnowledgeIndexWorker();

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
  followUpWorker.on("failed", (job, error) => {
    logger.error({ error, jobId: job?.id }, "Ticket Follow-Up failed");
  });
  ticketKnowledgeIndexWorker.on("failed", (job, error) => {
    logger.error({ error, jobId: job?.id }, "Ticket Knowledge indexing failed");
  });

  return {
    attachmentProcessWorker,
    followUpWorker,
    knowledgeIngestWorker,
    sessionEmailWorker,
    ticketKnowledgeIndexWorker,
    worker,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWorker();
}
