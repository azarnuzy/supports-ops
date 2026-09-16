#!/usr/bin/env node
import {
  answerRelevancy,
  contains,
  exactMatch,
  faithfulness,
  gEval,
  runEvalCli,
  type AnyEvalMetric,
} from "@anvia/core/evals";
import { createOtelEvalReporter } from "@anvia/otel";
import { createReplyModel } from "@repo/ai-agent";
import { shutdownTelemetry, startTelemetry } from "@repo/logger/telemetry";
import { aiAgentConfig, embeddingConfig, evalConfig, telemetryConfig } from "../config";
import { cases, type MetricName } from "./cases";
import {
  decisionMatches,
  languageMatches,
  normalizeText,
  negativeControl,
  neverLeaksInternal,
  retrievalFirstRelevantRank,
  retrievalPrecision,
  retrievalRecall,
  toolUsage,
} from "./metrics";
import { runEvalTurn, teardownEvalTicket, type EvalTurnInput, type EvalTurnOutput } from "./target";

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
const suites: Array<{ key: string; metric: MetricName; metrics: AnyEvalMetric[]; name: string }> = [
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
    // Judged against what retrieval actually returned this turn, not a
    // hand-written passage — so a grounded-sounding answer built on the wrong
    // chunk still fails.
    metrics: [
      faithfulness<EvalTurnInput, EvalTurnOutput, string>({
        ...judge,
        // A turn that legitimately retrieves nothing — a CLARIFY that asks for
        // an order number — used to report `invalid`, which reads as a broken
        // metric rather than as correct behaviour. Stating the absence keeps
        // the case gradable: a reply that asserts a company fact with no
        // Knowledge behind it is exactly what should fail here.
        retrievalContext: ({ output }) =>
          output.retrieved.length
            ? output.retrieved
            : [
                "No Knowledge was retrieved for this turn. Any company, product, policy, order, or billing fact stated in the answer is therefore unsupported.",
              ],
      }),
    ],
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
    key: "retrieval",
    metric: "retrieval",
    metrics: [retrievalRecall(), retrievalPrecision(), retrievalFirstRelevantRank()],
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

      await runEvalCli({
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
            targetModel: aiAgentConfig.modelId,
            workspaceId: evalConfig.workspaceId ?? "unknown",
          },
        },
        target: async (input) => {
          const output = await runEvalTurn(input);
          process.stdout.write(`${costLine(output)}\n`);
          return output;
        },
      });
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

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 2;
});
