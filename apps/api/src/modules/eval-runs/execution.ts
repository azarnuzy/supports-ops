import type { CompletionModel } from "@anvia/core";
import { runEvalSuite, type EvalCase } from "@anvia/core/evals";
import { createOtelEvalReporter, createOtelObserver } from "@anvia/otel";
import { captureMode, withAgentObserver } from "@repo/ai-agent";
import {
  createIsolatedTelemetry,
  type TelemetryExportFailure,
  type TelemetrySink,
} from "@repo/logger/isolated-telemetry";
import { createHash, randomUUID } from "node:crypto";
import { evalReporterOptions } from "../../evals/reporter";
import { casePlan, isRunnableMetric, judgeThreshold, metricsFor } from "../../evals/run-metrics";
import {
  createEvalTarget,
  runRetriever,
  type EvalTurnInput,
  type EvalTurnOutput,
} from "../../evals/target";
import { unscopedPrisma as db } from "../../utils/prisma";
import { creditBalance, hasActiveUnlimitedPeriod, spendForJudgeCall } from "../credits/services";
import { createJudgeBaseModel, judgeModelId, meterJudge } from "./judge";
import { enqueueEvalDelivery, type EvalRunJob } from "./queue";
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

      const { creditExhausted, ...outcome } = await executeCase({
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
      if (creditExhausted) {
        await db.evalRun.update({ data: { creditExhausted: true }, where: { id: runId } });
      }
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
    const delivery = (
      name: "CENTRAL" | "WORKSPACE",
      configured: boolean,
    ): "DELIVERED" | "ERROR" | "NOT_CONFIGURED" =>
      !configured
        ? "NOT_CONFIGURED"
        : failed.some((row) => row.target === name)
          ? "ERROR"
          : "DELIVERED";
    const settled = {
      centralDelivery: delivery("CENTRAL", central !== null),
      workspaceDelivery: delivery("WORKSPACE", true),
    };
    // A refused destination is retried in the background, on its own job; PENDING until it lands.
    const retry = (["CENTRAL", "WORKSPACE"] as const).filter(
      (name) => settled[name === "CENTRAL" ? "centralDelivery" : "workspaceDelivery"] === "ERROR",
    );
    await db.evalRun.update({
      data: {
        centralDelivery: retry.includes("CENTRAL") ? "PENDING" : settled.centralDelivery,
        error: failure ?? null,
        finishedAt: new Date(),
        status: failure ? "ERROR" : "FINISHED",
        workspaceDelivery: retry.includes("WORKSPACE") ? "PENDING" : settled.workspaceDelivery,
      },
      where: { id: runId },
    });
    for (const target of retry) await enqueueEvalDelivery({ runId, target, workspaceId });
  }
}

async function creditsExhausted(workspaceId: string) {
  return (await creditBalance(workspaceId)) <= 0 && !(await hasActiveUnlimitedPeriod(workspaceId));
}

const emptyOutput: EvalTurnOutput = {
  decision: "REPLY",
  durationMs: 0,
  escalationReason: null,
  limitations: [],
  output: "",
  retrieved: [],
  retrievedChunks: [],
  toolCalls: [],
};

/** Why a metric called the Case invalid (e.g. a retrieval label that no longer resolves). */
const invalidReason = (result: { metrics: Array<{ outcome: unknown }> }) =>
  result.metrics
    .map((metric) => metric.outcome as { outcome: string; reason?: string })
    .find((outcome) => outcome.outcome === "invalid")?.reason;

type CaseOutcome = {
  creditExhausted?: boolean;
  error?: string;
  evaluatorHealth?: boolean;
  judgeCalls?: number;
  limitations?: string[];
  passed?: boolean;
  status: "EVALUATED" | "EXECUTION_ERROR" | "INVALID" | "UNGRADED";
  traceId?: string | null;
};

async function executeCase(params: {
  item: Awaited<ReturnType<typeof db.evalRunCase.findMany>>[number];
  observer: ReturnType<typeof createOtelObserver>;
  reporter: ReturnType<typeof createOtelEvalReporter<EvalTurnInput, EvalTurnOutput, string>>;
  run: NonNullable<Awaited<ReturnType<typeof db.evalRun.findFirst>>>;
  target: ReturnType<typeof createEvalTarget>;
  telemetryRunId: string;
}): Promise<CaseOutcome> {
  const { item, run } = params;
  const metric = item.metric;
  if (!isRunnableMetric(metric)) {
    return { error: "This metric cannot be run.", status: "EXECUTION_ERROR" as const };
  }
  const plan = casePlan(item);
  const evalCase: EvalCase<EvalTurnInput, string> = {
    expected: item.expected,
    id: item.caseKey,
    input: {
      attachments: item.attachments as EvalTurnInput["attachments"],
      clarificationCount: item.clarificationCount,
      history: item.history as EvalTurnInput["history"],
      message: item.message,
    },
    metadata: {
      category: item.category,
      metric,
      ...(item.metadata as object),
      ...(plan.evaluatorHealth ? { evaluatorHealth: true } : {}),
    },
  };
  let output: EvalTurnOutput | undefined;
  let meter: ReturnType<typeof meterJudge>["meter"] | undefined;
  const judgeCaseCalls = () => meter?.calls ?? 0;
  try {
    let judge: { model: CompletionModel; threshold: number } | undefined;
    if (plan.judgeCalls[1] > 0) {
      const metered = meterJudge(createJudgeBaseModel(), {
        // Credit Exhaustion stops Judge work as it stops AI Turns.
        canCall: async () => !(await creditsExhausted(run.workspaceId)),
        charge: (usage) =>
          db.$transaction((tx) =>
            spendForJudgeCall(tx, {
              caseKey: item.caseKey,
              evalRunId: run.id,
              judgeModel: judgeModelId(),
              usage,
              workspaceId: run.workspaceId,
            }),
          ),
      });
      meter = metered.meter;
      judge = { model: metered.model, threshold: judgeThreshold };
    }
    // One suite per Case, all sharing the Run's id, so a Case can be started, skipped or stopped
    // on its own terms while the report still groups under the Run.
    const suite = await withAgentObserver(params.observer, () =>
      runEvalSuite({
        cases: [evalCase],
        concurrency: 1,
        metrics: metricsFor(item, {
          criteria: run.criteria,
          judge,
          workspaceId: run.workspaceId,
        }) as never,
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
            ...(plan.judgeCalls[1] > 0 ? { judgeModel: judgeModelId() } : {}),
            runId: run.id,
            workspaceId: run.workspaceId,
          },
        },
        target: async (input) => {
          output = plan.agentTurn
            ? await params.target.runTurn(input)
            : plan.retriever
              ? await runRetriever(run.workspaceId, input)
              : emptyOutput;
          return output;
        },
      }),
    );
    const result = suite.results[0];
    const base = {
      evaluatorHealth: plan.evaluatorHealth,
      judgeCalls: judgeCaseCalls(),
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
    if (meter?.exhausted) {
      // The AI Agent's answer is kept in the report; only grading is missing, and that is not a failure.
      return {
        ...base,
        creditExhausted: true,
        error: "Credits ran out before this Case was fully graded. The AI Agent's answer is kept.",
        status: "UNGRADED" as const,
      };
    }
    if (result.outcome === "invalid") {
      return meter?.failed
        ? {
            ...base,
            error: "The Judge model call failed. It was not charged.",
            status: "EXECUTION_ERROR" as const,
          }
        : {
            ...base,
            error: message(invalidReason(result) ?? "This Case could not be graded."),
            status: "INVALID" as const,
          };
    }
    // A negative control must fail: `passed` says the evaluator behaved, never a product result.
    const passed = plan.evaluatorHealth ? result.outcome === "fail" : result.outcome === "pass";
    return { ...base, passed, status: "EVALUATED" as const };
  } catch (error) {
    return {
      error: message(error),
      judgeCalls: judgeCaseCalls(),
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
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
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
