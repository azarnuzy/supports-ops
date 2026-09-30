import { Queue, type ConnectionOptions } from "bullmq";
import { injectTraceContext } from "@repo/logger/telemetry";

export type EvalRunJob = {
  runId: string;
  traceContext?: Record<string, string>;
  workspaceId: string;
};

const connection: ConnectionOptions = {
  maxRetriesPerRequest: null,
  url: process.env.REDIS_URL ?? "redis://localhost:16379",
};
let queue: Queue<EvalRunJob> | undefined;

/** One job per Run, with a single attempt: a failed job must never re-run paid model work. A
 * delivery that arrives twice resumes only Cases that never started (see `processEvalRun`). */
export async function enqueueEvalRun(job: Omit<EvalRunJob, "traceContext">) {
  queue ??= new Queue<EvalRunJob>("eval-run", { connection });
  await queue.add(
    "run",
    { ...job, traceContext: injectTraceContext() },
    { attempts: 1, jobId: `eval-run-${job.runId}`, removeOnComplete: 100, removeOnFail: 500 },
  );
}

export type EvalDeliveryJob = {
  runId: string;
  target: "CENTRAL" | "WORKSPACE";
  traceContext?: Record<string, string>;
  workspaceId: string;
};

/** Redelivers a Run's retained export evidence to one destination. Bounded: five attempts with
 * exponential backoff, then the evidence is marked failed. The fixed job id makes a double click
 * a no-op; the job is removed when it ends, so a later Admin retry can queue again. */
export async function enqueueEvalDelivery(job: Omit<EvalDeliveryJob, "traceContext">) {
  queue ??= new Queue<EvalRunJob>("eval-run", { connection });
  await queue.add(
    "deliver",
    { ...job, traceContext: injectTraceContext() } as never,
    {
      attempts: deliveryAttempts,
      backoff: { delay: 30_000, type: "exponential" },
      jobId: `eval-delivery-${job.runId}-${job.target}`,
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
}

export const deliveryAttempts = 5;
