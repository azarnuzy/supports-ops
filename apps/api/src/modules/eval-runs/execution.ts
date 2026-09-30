import { runEvalSuite, type EvalCase } from "@anvia/core/evals";
import { createOtelEvalReporter, createOtelObserver } from "@anvia/otel";
import { captureMode, withAgentObserver } from "@repo/ai-agent";
import {
  createIsolatedTelemetry,
  type TelemetryExportFailure,
  type TelemetrySink,
} from "@repo/logger/isolated-telemetry";
import { createHash, randomUUID } from "node:crypto";
import { deterministicMetrics, isDeterministicMetric } from "../../evals/deterministic";
import { evalReporterOptions } from "../../evals/reporter";
import { createEvalTarget, type EvalTurnInput, type EvalTurnOutput } from "../../evals/target";
import { unscopedPrisma as db } from "../../utils/prisma";
import { creditBalance, hasActiveUnlimitedPeriod } from "../credits/services";
import type { EvalRunJob } from "./queue";
import { centralSink, workspaceSink } from "./sinks";

const interrupted =
  "Interrupted before completion. Not run again: the model call may already have been made and charged.";

const message = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, 500);

/** Executes one queued Eval Run, serially and at most once per Case, and reports it to SupportOps'
 * central telemetry and to the Workspace's own destination. Safe to call twice for the same Run:
 * a finished Run is left alone, and a Case that has already started is never started again. */
export async function processEvalRun({ data }: { data: EvalRunJob }) {
  const { runId, workspaceId } = data;
  const run = await db.evalRun.findFirst({ where: { id: runId, workspaceId } });
  if (!run || run.status === "FINISHED" || run.status === "ERROR") return;

  // QUEUED -> RUNNING is claimed atomically. Losing the claim means this is a redelivery of a Run
  // that already began; any Case it left RUNNING has an unknown outcome and is closed, not replayed.
  const claimed = await db.evalRun.updateMany({
    data: { startedAt: new Date(), status: "RUNNING" },
    where: { id: runId, status: "QUEUED" },
  });
  if (claimed.count === 0) {
    await db.evalRunCase.updateMany({
      data: { error: interrupted, finishedAt: new Date(), status: "EXECUTION_ERROR" },
      where: { runId, status: "RUNNING" },
    });
  }

  const sinks: TelemetrySink[] = [];
  const central = centralSink();
  if (central) sinks.push(central);
  sinks.push(
    workspaceSink({
      credentialsEncrypted: run.destinationCredentialsEncrypted,
      endpoint: run.destinationEndpoint,
    }),
  );
  const telemetry = createIsolatedTelemetry({
    onFailure: (failure) => retainEvidence(runId, workspaceId, failure),
    serviceName: "supportops-evals",
    sinks,
  });
  const observer = createOtelObserver({ captureMode, tracer: telemetry.tracer });
  const reporter = createOtelEvalReporter<EvalTurnInput, EvalTurnOutput, string>({
    ...evalReporterOptions,
    logger: telemetry.logger,
  });

  let currentCaseKey = "";
  const target = createEvalTarget({
    evalRunId: runId,
    // Groups a Run's traces as one Session and names the Case each came from.
    telemetry: () => ({ sessionId: `eval-run-${runId}`, userId: `eval-case-${currentCaseKey}` }),
    toolPolicy: "web",
    workspaceId,
  });

  let failure: string | undefined;
  try {
    await target.setup();
    const cases = await db.evalRunCase.findMany({
      orderBy: { position: "asc" },
      where: { runId, status: "PENDING" },
    });
    for (const item of cases) {
      if (await creditsExhausted(workspaceId)) {
        await db.evalRun.update({ data: { creditExhausted: true }, where: { id: runId } });
        break;
      }
      // Claimed atomically, so two deliveries can never both start the same Case.
      const started = await db.evalRunCase.updateMany({
        data: { startedAt: new Date(), status: "RUNNING" },
        where: { id: item.id, status: "PENDING" },
      });
      if (started.count === 0) continue;
      currentCaseKey = item.caseKey;

      const outcome = await executeCase({
        item,
        observer,
        reporter,
        run,
        target,
        telemetryRunId: runId,
      });
      await db.evalRunCase.update({
        data: { ...outcome, finishedAt: new Date() },
        where: { id: item.id },
      });
    }
  } catch (error) {
    failure = message(error);
  } finally {
    // Whatever is still open is closed truthfully: never started, or started with no result.
    await db.evalRunCase.updateMany({
      data: { finishedAt: new Date(), status: "UNEXECUTED" },
      where: { runId, status: "PENDING" },
    });
    await db.evalRunCase.updateMany({
      data: { error: failure ?? interrupted, finishedAt: new Date(), status: "EXECUTION_ERROR" },
      where: { runId, status: "RUNNING" },
    });
    await target.teardown().catch(() => undefined);
    await telemetry.flush().catch(() => undefined);
    await telemetry.shutdown().catch(() => undefined);
    const failed = await db.evalRunEvidence.findMany({
      distinct: ["target"],
      select: { target: true },
      where: { runId },
    });
    const delivery = (name: "CENTRAL" | "WORKSPACE", configured: boolean) =>
      !configured
        ? "NOT_CONFIGURED"
        : failed.some((row) => row.target === name)
          ? "ERROR"
          : "DELIVERED";
    await db.evalRun.update({
      data: {
        centralDelivery: delivery("CENTRAL", central !== null),
        error: failure ?? null,
        finishedAt: new Date(),
        status: failure ? "ERROR" : "FINISHED",
        workspaceDelivery: delivery("WORKSPACE", true),
      },
      where: { id: runId },
    });
  }
}

async function creditsExhausted(workspaceId: string) {
  return (await creditBalance(workspaceId)) <= 0 && !(await hasActiveUnlimitedPeriod(workspaceId));
}

async function executeCase(params: {
  item: Awaited<ReturnType<typeof db.evalRunCase.findMany>>[number];
  observer: ReturnType<typeof createOtelObserver>;
  reporter: ReturnType<typeof createOtelEvalReporter<EvalTurnInput, EvalTurnOutput, string>>;
  run: NonNullable<Awaited<ReturnType<typeof db.evalRun.findFirst>>>;
  target: ReturnType<typeof createEvalTarget>;
  telemetryRunId: string;
}) {
  const { item, run } = params;
  const metric = item.metric;
  if (!isDeterministicMetric(metric)) {
    return { error: "This metric cannot be run yet.", status: "EXECUTION_ERROR" as const };
  }
  const evalCase: EvalCase<EvalTurnInput, string> = {
    expected: item.expected,
    id: item.caseKey,
    input: {
      attachments: item.attachments as EvalTurnInput["attachments"],
      clarificationCount: item.clarificationCount,
      history: item.history as EvalTurnInput["history"],
      message: item.message,
    },
    metadata: { category: item.category, metric, ...(item.metadata as object) },
  };
  let output: EvalTurnOutput | undefined;
  try {
    // One suite per Case, all sharing the Run's id, so a Case can be started, skipped or stopped
    // on its own terms while the report still groups under the Run.
    const suite = await withAgentObserver(params.observer, () =>
      runEvalSuite({
        cases: [evalCase],
        concurrency: 1,
        metrics: deterministicMetrics[metric]() as never,
        name: run.datasetName,
        reporters: [params.reporter as never],
        run: {
          datasetName: run.datasetName,
          datasetVersion: params.telemetryRunId,
          id: params.telemetryRunId,
          metadata: {
            agentModel: run.agentModel,
            aiAgentId: run.aiAgentId,
            datasetId: run.datasetId,
            embeddingModel: run.embeddingModel,
            instructionsSha256: run.instructionsSha256,
            runId: run.id,
            workspaceId: run.workspaceId,
          },
        },
        target: async (input) => {
          output = await params.target.runTurn(input);
          return output;
        },
      }),
    );
    const result = suite.results[0];
    const base = {
      limitations: output?.limitations ?? [],
      traceId: output?.trace?.traceId ?? null,
    };
    if (!result || result.targetStatus === "failed") {
      return {
        ...base,
        error: message(result?.targetError ?? "The turn did not complete."),
        status: "EXECUTION_ERROR" as const,
      };
    }
    if (result.outcome === "invalid") {
      return {
        ...base,
        error: "The result could not be graded.",
        status: "EXECUTION_ERROR" as const,
      };
    }
    return { ...base, passed: result.outcome === "pass", status: "EVALUATED" as const };
  } catch (error) {
    return {
      error: message(error),
      limitations: output?.limitations ?? [],
      status: "EXECUTION_ERROR" as const,
    };
  }
}

/** Keeps a request a destination refused, keyed by a hash of its body so replaying it later cannot
 * create a second copy. Uses no model and spends no Credits. */
async function retainEvidence(runId: string, workspaceId: string, failure: TelemetryExportFailure) {
  await db.evalRunEvidence.createMany({
    data: [
      {
        body: failure.body,
        eventId: createHash("sha256").update(failure.body).digest("hex"),
        id: randomUUID(),
        lastError: failure.error,
        runId,
        signal: failure.signal,
        target: failure.sink === "central" ? "CENTRAL" : "WORKSPACE",
        workspaceId,
      },
    ],
    skipDuplicates: true,
  });
}

/** Called when the queue gives up on a Run's job, so a dead job cannot hold the Workspace's one
 * active slot forever. */
export async function failEvalRun(runId: string, reason: string) {
  await db.evalRunCase.updateMany({
    data: { finishedAt: new Date(), status: "UNEXECUTED" },
    where: { runId, status: "PENDING" },
  });
  await db.evalRunCase.updateMany({
    data: { error: interrupted, finishedAt: new Date(), status: "EXECUTION_ERROR" },
    where: { runId, status: "RUNNING" },
  });
  await db.evalRun.updateMany({
    data: { error: reason.slice(0, 500), finishedAt: new Date(), status: "ERROR" },
    where: { id: runId, status: { in: ["QUEUED", "RUNNING"] } },
  });
}
