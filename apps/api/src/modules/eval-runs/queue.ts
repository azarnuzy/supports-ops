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
