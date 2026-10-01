import type { CompletionModel } from "@anvia/core";
import { answerRelevancy, gEval, type AnyEvalMetric } from "@anvia/core/evals";
import { deterministicMetrics, isDeterministicMetric } from "./deterministic";
import {
  groundedFaithfulness,
  negativeControl,
  retrievalNdcg,
  retrievalPrecision,
  retrievalRecall,
  retrievalReciprocalRank,
} from "./metrics";

/**
 * Which metrics grade a Case and what running it costs, shared by the manual CLI and Admin-started
 * Runs so a Case means the same thing in both. `metadata.retrievalTarget` keeps the two retrieval
 * paths apart: `retriever` searches with the Customer's own message and calls no AI Agent (no AI Turn
 * is charged); `agent` (the default) is a full AI Turn whose model-written query varies per run.
 */

export const judgeThreshold = 0.7;

export const defaultGEvalCriteria =
  "The answer is correct against the expected answer, addresses the question directly, states any condition or exception the expected answer states, and never invents policy, prices, stock, or internal procedure.";

export type Judge = { model: CompletionModel; threshold: number };

/** The metrics that call the Judge model. Each builds a fresh instance per Case, because gEval
 * caches its generated evaluation steps per instance and a shared one would hide a Judge call. */
export const judgedMetrics = {
  faithfulness: (judge: Judge) => [groundedFaithfulness(judge)],
  gEval: (judge: Judge, criteria?: string) => [
    gEval({
      ...judge,
      // The dataset's rubric is the default; the Case's own `expected` stays the reference.
      criteria: criteria?.trim() || defaultGEvalCriteria,
      evaluationParams: ["input", "actualOutput", "expectedOutput"],
      name: "answer-quality",
    }),
  ],
  relevancy: (judge: Judge) => [answerRelevancy(judge)],
} satisfies Record<string, (judge: Judge, criteria?: string) => AnyEvalMetric[]>;

export type JudgedMetric = keyof typeof judgedMetrics;

/** Judge model calls one Case makes, as [fewest, most]. Counts follow the Anvia metrics: gEval
 * generates its steps then scores (2); relevancy extracts statements, judges them unless there are
 * none, then explains (2-3); grounded faithfulness extracts claims and judges them unless there
 * are none (1-2). A retry after a malformed Judge answer is one more call each, not counted here. */
const judgeCalls: Record<JudgedMetric, [number, number]> = {
  faithfulness: [1, 2],
  gEval: [2, 2],
  relevancy: [2, 3],
};

export const isJudgedMetric = (metric: string): metric is JudgedMetric =>
  Object.hasOwn(judgedMetrics, metric);

export type RetrievalTarget = "agent" | "retriever";
type CaseShape = { metadata?: unknown; metric: string };

export const retrievalTargetOf = (item: CaseShape): RetrievalTarget =>
  (item.metadata as { retrievalTarget?: RetrievalTarget } | null)?.retrievalTarget === "retriever"
    ? "retriever"
    : "agent";

export const isRunnableMetric = (metric: string) =>
  isDeterministicMetric(metric) ||
  isJudgedMetric(metric) ||
  metric === "retrieval" ||
  metric === "negativeControl";

/** What a Case needs from the platform: an AI Agent turn, a retriever-only search, or neither (an
 * evaluator-health check never calls the AI Agent), and how many Judge calls it may make. */
export function casePlan(item: CaseShape) {
  const retriever = item.metric === "retrieval" && retrievalTargetOf(item) === "retriever";
  return {
    agentTurn: item.metric !== "negativeControl" && !retriever,
    evaluatorHealth: item.metric === "negativeControl",
    judgeCalls: isJudgedMetric(item.metric)
      ? judgeCalls[item.metric]
      : ([0, 0] as [number, number]),
    retriever,
  };
}

export function metricsFor(
  item: CaseShape,
  context: { criteria: string; judge?: Judge; workspaceId: string },
): AnyEvalMetric[] {
  const { metric } = item;
  if (isDeterministicMetric(metric)) return deterministicMetrics[metric]() as AnyEvalMetric[];
  if (metric === "negativeControl") return [negativeControl()];
  if (metric === "retrieval") {
    const { workspaceId } = context;
    return casePlan(item).retriever
      ? [
          retrievalRecall(workspaceId),
          retrievalReciprocalRank(workspaceId),
          retrievalNdcg(5, workspaceId),
          retrievalPrecision(workspaceId),
        ]
      : [retrievalRecall(workspaceId)];
  }
  if (isJudgedMetric(metric)) {
    if (!context.judge) throw new Error("A Judge model is required for this metric.");
    return judgedMetrics[metric](context.judge, context.criteria);
  }
  throw new Error(`Unsupported metric "${metric}".`);
}
