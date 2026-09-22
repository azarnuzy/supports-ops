#!/usr/bin/env node
import {
  answerRelevancy,
  contains,
  exactMatch,
  gEval,
  runEvalCli,
  type AnyEvalMetric,
} from "@anvia/core/evals";
import { createOtelEvalReporter } from "@anvia/otel";
import { createReplyModel } from "@repo/ai-agent";
import { shutdownTelemetry, startTelemetry } from "@repo/logger/telemetry";
import { aiAgentConfig, embeddingConfig, evalConfig, telemetryConfig } from "../config";
import { resolveAgentModelId } from "../modules/ai-agent/model-catalog";
import { unscopedPrisma } from "../utils/prisma";
import { cases, type MetricName } from "./cases";
import {
  decisionMatches,
  groundedFaithfulness,
  languageMatches,
  normalizeText,
  negativeControl,
  neverLeaksInternal,
  retrievalNdcg,
  retrievalPrecision,
  retrievalRecall,
  retrievalReciprocalRank,
  toolUsage,
} from "./metrics";
import {
  runEvalTurn,
  runRetrieverTurn,
  setupEvalTicket,
  teardownEvalTicket,
  type EvalTurnInput,
  type EvalTurnOutput,
} from "./target";

/**
 * Runs the AI Agent eval suite by hand — not in CI, per ADR-0010.
 *
 *   pnpm eval:ai-agent                      every suite
 *   pnpm eval:ai-agent faithfulness         one metric's suite
 *   pnpm eval:ai-agent staleness            one category
 *   pnpm eval:ai-agent edge-final-sale-damaged
 *   pnpm eval:ai-agent --id=tool-jordan-price
 *
 * Cases run against the Workspace named by EVAL_WORKSPACE_ID: its published
 * Knowledge Sources, its AI Agent instructions, and its assigned MCP Tools.
 * Results report through the same OTLP pipeline as agent telemetry, which
 * lands in Lens in development and Langfuse in production.
 */

const judgeModel = createReplyModel({
  apiKey: aiAgentConfig.apiKey ?? "",
  baseUrl: aiAgentConfig.baseUrl,
  modelId: evalConfig.judgeModelId,
});

const judge = { model: judgeModel, threshold: 0.7 } as const;

/** One suite per metric, in the flat shape the reference project uses: the
 * metric is fixed for the suite, and each Case carries whatever that metric
 * needs (`expected`, or the `metadata` the deterministic metrics read). */
const suites: Array<{
  key: string;
  metric: MetricName;
  metrics: AnyEvalMetric[];
  name: string;
  /** Defaults to a full Agent turn. */
  target?: (input: EvalTurnInput) => Promise<EvalTurnOutput>;
  /** Suite-level gates on a metric's mean score, the way IR benchmarks report
   * a retriever. Any mean below its gate fails the run. */
  gates?: Record<string, number>;
}> = [
  {
    key: "contains",
    metric: "contains",
    metrics: [
      contains<EvalTurnInput, EvalTurnOutput, string>({
        actual: ({ output }) => normalizeText(output.output),
        expected: ({ case: testCase }) => normalizeText(String(testCase.expected ?? "")),
      }),
    ],
    name: "northstar-contains",
  },
  {
    key: "exactmatch",
    metric: "exactMatch",
    metrics: [
      exactMatch<EvalTurnInput, EvalTurnOutput, string>({
        actual: ({ output }: { output: EvalTurnOutput }) => normalizeText(output.output),
        expected: ({ case: testCase }: { case: { expected?: string } }) =>
          normalizeText(String(testCase.expected ?? "")),
      }),
    ],
    name: "northstar-exact-match",
  },
  {
    key: "relevancy",
    metric: "relevancy",
    metrics: [answerRelevancy(judge)],
    name: "northstar-relevancy",
  },
  {
    key: "faithfulness",
    metric: "faithfulness",
    // Judged against what retrieval actually returned this turn, passage by
    // passage — see groundedFaithfulness for why the library metric is not used.
    metrics: [groundedFaithfulness(judge)],
    name: "northstar-faithfulness",
  },
  {
    key: "geval",
    metric: "gEval",
    metrics: [
      gEval({
        ...judge,
        criteria:
          "The answer is correct against the expected answer, addresses the question directly, states any condition or exception the expected answer states, and never invents policy, prices, stock, or internal procedure.",
        evaluationParams: ["input", "actualOutput", "expectedOutput"],
        name: "answer-quality",
      }),
    ],
    name: "northstar-g-eval",
  },
  {
    key: "decision",
    metric: "decision",
    metrics: [decisionMatches()],
    name: "northstar-decision",
  },
  {
    key: "tool",
    metric: "tool",
    metrics: [toolUsage()],
    name: "northstar-tool-usage",
  },
  {
    key: "visibility",
    metric: "visibility",
    metrics: [neverLeaksInternal()],
    name: "northstar-visibility",
  },
  {
    key: "language",
    metric: "language",
    metrics: [languageMatches()],
    name: "northstar-language",
  },
  {
    // The retriever alone, on the Customer's own message: deterministic, so
    // the ranking metrics measure retrieval rather than query-rewrite noise.
    gates: { mrr: 0.7, "ndcg@5": 0.7, "recall@k": 0.9 },
    key: "retriever",
    metric: "retrieval",
    metrics: [retrievalRecall(), retrievalReciprocalRank(), retrievalNdcg(5), retrievalPrecision()],
    name: "northstar-retriever",
    target: runRetrieverTurn,
  },
  {
    // The same labels through a real Agent turn. Only context recall is graded:
    // the query is model-written and varies per run, so rank here is noise.
    gates: { "recall@k": 0.9 },
    key: "retrieval",
    metric: "retrieval",
    metrics: [retrievalRecall()],
    name: "northstar-retrieval",
  },
  {
    key: "negativecontrol",
    metric: "negativeControl",
    metrics: [negativeControl()],
    name: "northstar-negative-control",
  },
];

const categories = new Set(cases.map((testCase) => testCase.metadata.category));

function parseArgs(argv: string[]) {
  const idArg = argv.find((arg) => arg.startsWith("--id="))?.split("=")[1];
  const positional = argv.find((arg) => !arg.startsWith("-"));
  const normalized = positional?.toLowerCase().replace(/-/g, "");

  const suiteFilter = suites.some((suite) => suite.key === normalized) ? normalized : undefined;
  const categoryFilter =
    positional && categories.has(positional as never) ? (positional as string) : undefined;
  const idFilter = idArg ?? (suiteFilter || categoryFilter ? undefined : positional);

  return { categoryFilter, idFilter, suiteFilter };
}

async function main() {
  if (!evalConfig.workspaceId) {
    process.stderr.write("EVAL_WORKSPACE_ID is required to run the eval suite.\n");
    process.exitCode = 2;
    return;
  }
  if (!aiAgentConfig.apiKey) {
    process.stderr.write(
      "COMPLETION_GATEWAY_API_KEY (or OPENROUTER_API_KEY) is required to run the eval suite.\n",
    );
    process.exitCode = 2;
    return;
  }

  const { categoryFilter, idFilter, suiteFilter } = parseArgs(process.argv.slice(2));
  const evalTicket = await setupEvalTicket();
  const targetModelId = resolveAgentModelId(
    (
      await unscopedPrisma.aiAgent.findUnique({
        select: { agentModel: true },
        where: { id: evalTicket.aiAgentId },
      })
    )?.agentModel,
  );
  startTelemetry({ config: telemetryConfig, serviceName: "ai-agent-evals" });
  // `includePayloads` defaults to false, which publishes outcomes with no
  // Input/Expected/Output — a run you cannot read without re-running it
  // locally. The payload is trimmed on the way out: a turn's raw output
  // carries every retrieved chunk and every Tool Result verbatim, which is
  // megabytes of noise in a detail pane. What is kept is what a person reads
  // when a case fails.
  const reporter = createOtelEvalReporter({
    captureMaxBytes: 16_000,
    includePayloads: true,
    onMissingTrace: "emit",
    publishInvalid: true,
    // `transformInput` is applied to `expected`, `context`, and
    // `retrievalContext` as well as to the input, so it has to pass anything
    // that is not a turn input straight through — unwrapping blindly turns a
    // case's `expected` string into undefined and Lens shows "No data
    // captured" for it.
    transformInput: (value) => {
      if (typeof value !== "object" || value === null || !("message" in value)) return value;
      const input = value as EvalTurnInput;
      return input.attachments?.length || input.history?.length || input.clarificationCount
        ? input
        : input.message;
    },
    transformOutput: (value) => {
      const output = value as EvalTurnOutput;
      return {
        reply: output.output,
        decision: output.decision,
        ...(output.escalationReason ? { escalationReason: output.escalationReason } : {}),
        durationMs: Math.round(output.durationMs),
        ...(output.ttftMs === undefined ? {} : { ttftMs: Math.round(output.ttftMs) }),
        ...(output.ttfcMs === undefined ? {} : { ttfcMs: Math.round(output.ttfcMs) }),
        usage: output.usage,
        toolCalls: output.toolCalls.map((call) => ({
          durationMs: Math.round(call.durationMs),
          name: call.name,
          status: call.failed ? "failed" : "succeeded",
        })),
        retrievedChunks: output.retrieved.length,
      };
    },
  });

  try {
    for (const suite of suites) {
      if (suiteFilter && suiteFilter !== suite.key) continue;

      const suiteCases = cases.filter((testCase) => {
        if (testCase.metadata.metric !== suite.metric) return false;
        if (categoryFilter && testCase.metadata.category !== categoryFilter) return false;
        if (idFilter && testCase.id !== idFilter && !testCase.id.includes(idFilter)) return false;
        return true;
      });
      if (!suiteCases.length) continue;

      const suiteOutputs: EvalTurnOutput[] = [];

      const result = await runEvalCli({
        cases: suiteCases,
        // Serial: every case is a real turn against one scratch Ticket and a
        // live MCP server, so concurrency would interleave Tool calls and
        // agent memory between cases.
        concurrency: 1,
        metrics: suite.metrics as never,
        maxValueLength: 4_000,
        name: suite.name,
        reporters: [reporter],
        run: {
          datasetName: "northstar-ai-agent",
          metadata: {
            category: categoryFilter ?? "all",
            embeddingModel: embeddingConfig.modelId,
            judgeModel: evalConfig.judgeModelId,
            metric: suite.metric,
            targetModel: targetModelId,
            workspaceId: evalConfig.workspaceId ?? "unknown",
          },
        },
        target: async (input) => {
          if (suite.target) return suite.target(input);
          const output = await runEvalTurn(input);
          suiteOutputs.push(output);
          process.stdout.write(`${costLine(output)}\n`);
          return output;
        },
      });

      if (suiteOutputs.length) process.stdout.write(`${summaryLine(suite.name, suiteOutputs)}\n`);
      if (suite.gates) process.stdout.write(`${gateLine(suite.name, suite.gates, result)}\n`);
    }
  } finally {
    await teardownEvalTicket();
    await shutdownTelemetry();
  }
}

/** The Case payload the reporter prints is dominated by `retrieved` and is
 * truncated before `usage` and `toolCalls`, so the numbers a cost or latency
 * question needs are exactly the ones that get cut. One compact line per Case,
 * printed as the turn finishes, is what makes a run readable without re-running
 * it. See `docs/research/ai-agent-cost-and-latency.md`. */
function costLine(output: EvalTurnOutput): string {
  const ms = (value: number | undefined) => (value === undefined ? "-" : `${Math.round(value)}ms`);
  const usage = output.usage;
  const tokens = usage
    ? `in ${usage.inputTokens} (cached ${usage.cachedInputTokens}) out ${usage.outputTokens}` +
      ` (reasoning ${usage.details?.output_reasoning_tokens ?? 0})`
    : "usage unavailable";
  return (
    `  cost: ttft ${ms(output.ttftMs)} / content ${ms(output.ttfcMs)} / total ${ms(output.durationMs)}` +
    ` | ${tokens} | tools ${output.toolCalls.length} | chunks ${output.retrieved.length}`
  );
}

/** Mean of each gated metric over the suite's gradable Cases, checked against
 * its gate. Invalid outcomes (a stale label, a failed turn) are excluded from
 * the mean and counted, so they surface instead of dragging the score. */
function gateLine(
  suiteName: string,
  gates: Record<string, number>,
  result: Awaited<ReturnType<typeof runEvalCli>>,
): string {
  const parts = Object.entries(gates).map(([name, gate]) => {
    const outcomes = result.results.flatMap((caseResult) =>
      caseResult.metrics
        .filter((metric) => metric.metricName === name)
        .map((metric) => metric.outcome),
    );
    const scores = outcomes
      .filter((outcome) => outcome.outcome !== "invalid")
      .map((outcome) => Number(outcome.score));
    const invalid = outcomes.length - scores.length;
    const mean = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
    const passed = scores.length > 0 && invalid === 0 && mean >= gate;
    if (!passed) process.exitCode = 1;
    return `${name} ${mean.toFixed(2)} (gate ${gate}${invalid ? `, ${invalid} invalid` : ""}) ${passed ? "PASS" : "FAIL"}`;
  });
  return `gates [${suiteName}] (${result.results.length} cases): ${parts.join(" | ")}`;
}

/** Nearest-rank percentile. `p` is 0-100. */
function percentile(values: number[], p: number): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

/** One line after a suite's Cases, rolling up what the per-Case `cost:` lines
 * otherwise require adding up by hand. p50/p95, not means, per the metrics
 * this reply-latency work cares about — see
 * `docs/research/ai-agent-cost-and-latency.md` §5 and §6.1. A Case whose
 * provider reported no `usage` is excluded from the token figures rather than
 * counted as zero, so one untracked Case cannot understate the others. */
function summaryLine(suiteName: string, outputs: EvalTurnOutput[]): string {
  const ms = (value: number | undefined) => (value === undefined ? "-" : `${Math.round(value)}ms`);
  const percentiles = (values: number[]) =>
    `p50 ${ms(percentile(values, 50))} / p95 ${ms(percentile(values, 95))}`;

  const ttft = outputs.map((output) => output.ttftMs).filter((value) => value !== undefined);
  const ttfc = outputs.map((output) => output.ttfcMs).filter((value) => value !== undefined);
  const duration = outputs.map((output) => output.durationMs);

  const usages = outputs.map((output) => output.usage).filter((usage) => usage !== undefined);
  const inputTokens = usages.reduce((sum, usage) => sum + usage.inputTokens, 0);
  const cachedInputTokens = usages.reduce((sum, usage) => sum + usage.cachedInputTokens, 0);
  const outputTokens = usages.reduce((sum, usage) => sum + usage.outputTokens, 0);
  const reasoningTokens = usages.reduce(
    (sum, usage) => sum + (usage.details?.output_reasoning_tokens ?? 0),
    0,
  );
  const cachedRatio =
    inputTokens > 0 ? `${Math.round((cachedInputTokens / inputTokens) * 100)}%` : "-";
  const totalToolCalls = outputs.reduce((sum, output) => sum + output.toolCalls.length, 0);
  const toolCallsPerCase = outputs.length ? (totalToolCalls / outputs.length).toFixed(1) : "0";

  return (
    `summary [${suiteName}] (${outputs.length} cases, ${usages.length} with usage):` +
    ` ttft ${percentiles(ttft)} | content ${percentiles(ttfc)} | total ${percentiles(duration)}` +
    ` | in ${inputTokens} (cached ${cachedRatio}) out ${outputTokens} (reasoning ${reasoningTokens})` +
    ` | tools ${toolCallsPerCase}/case`
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 2;
});
