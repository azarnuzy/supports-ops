import { loggerConfig, redisConfig } from "./config";
import { createLogger } from "@repo/logger";
import { Queue, QueueEvents, Worker, type ConnectionOptions, type Job } from "bullmq";
import type { ExampleJob } from "./types";

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

export function runWorker() {
  const worker = startExampleWorker();

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Job completed");
  });

  worker.on("failed", (job, error) => {
    logger.error({ error, jobId: job?.id }, "Job failed");
  });

  return worker;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWorker();
}
