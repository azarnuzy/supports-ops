import { contains, exactMatch, type AnyEvalMetric } from "@anvia/core/evals";
import type { MetricName } from "./cases";
import {
  decisionMatches,
  languageMatches,
  neverLeaksInternal,
  normalizeText,
  toolUsage,
} from "./metrics";
import type { EvalTurnInput, EvalTurnOutput } from "./target";

/** The metrics that grade a full AI Turn with no model call of their own. Shared by the manual CLI
 * and Admin-started Runs, so a Case means the same thing in both. Judge and retrieval metrics are
 * deliberately absent: they cost Credits or need labelled Knowledge and are enabled separately. */
export const deterministicMetrics = {
  contains: () => [
    contains<EvalTurnInput, EvalTurnOutput, string>({
      actual: ({ output }) => normalizeText(output.output),
      expected: ({ case: testCase }) => normalizeText(String(testCase.expected ?? "")),
    }),
  ],
  decision: () => [decisionMatches()],
  exactMatch: () => [
    exactMatch<EvalTurnInput, EvalTurnOutput, string>({
      actual: ({ output }: { output: EvalTurnOutput }) => normalizeText(output.output),
      expected: ({ case: testCase }: { case: { expected?: string } }) =>
        normalizeText(String(testCase.expected ?? "")),
    }),
  ],
  language: () => [languageMatches()],
  tool: () => [toolUsage()],
  visibility: () => [neverLeaksInternal()],
} satisfies Partial<Record<MetricName, () => AnyEvalMetric[]>>;

export type DeterministicMetric = keyof typeof deterministicMetrics;

export const isDeterministicMetric = (metric: string): metric is DeterministicMetric =>
  Object.hasOwn(deterministicMetrics, metric);
