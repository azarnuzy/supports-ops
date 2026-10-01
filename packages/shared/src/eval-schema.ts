import { z } from "zod";

/** The metrics `evals/metrics.ts` already implements; a Case names exactly one. */
export const evalMetrics = [
  "contains",
  "decision",
  "exactMatch",
  "faithfulness",
  "gEval",
  "language",
  "negativeControl",
  "relevancy",
  "retrieval",
  "tool",
  "visibility",
] as const;
export type EvalMetric = (typeof evalMetrics)[number];

export const evalMetricLabels: Record<EvalMetric, string> = {
  contains: "Contains",
  decision: "Decision",
  exactMatch: "Exact match",
  faithfulness: "Faithfulness",
  gEval: "gEval",
  language: "Language",
  negativeControl: "Negative control",
  relevancy: "Relevance",
  retrieval: "Retrieval",
  tool: "Tool",
  visibility: "Visibility",
};

/** Metric-specific expectations, mirroring `AgentEvalCase["metadata"]`. Unknown keys are dropped,
 * so a Case can never carry an executable script or free-form prompt. */
export const evalCaseMetadataSchema = z.object({
  canaries: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  decisions: z
    .array(z.enum(["CLARIFY", "ESCALATE", "REPLY", "RESOLVE"]))
    .max(4)
    .optional(),
  expectedPassages: z
    .array(
      z.object({
        fragment: z.string().trim().min(1).max(1000),
        grade: z.union([z.literal(1), z.literal(2)]).optional(),
        source: z.string().trim().min(1).max(200),
      }),
    )
    .max(50)
    .optional(),
  language: z.enum(["en", "id"]).optional(),
  /** `retrieval` Cases: `retriever` searches with the Customer's message and calls no AI Agent;
   * `agent` (default) is a full AI Turn. */
  retrievalTarget: z.enum(["agent", "retriever"]).optional(),
  tool: z.string().trim().min(1).max(200).optional(),
  toolMustNotBeCalled: z.boolean().optional(),
});
export type EvalCaseMetadata = z.infer<typeof evalCaseMetadataSchema>;

export const datasetSchema = z.object({
  criteria: z.string().trim().max(4000).default(""),
  name: z.string().trim().min(1).max(120),
});

/** Drafts are allowed: `metric` and its expectations may be missing at save time and are reported
 * by `caseIssues` instead, so an Admin can save half-written imports and finish them later. */
export const caseSchema = z.object({
  attachments: z
    .array(z.object({ content: z.string().max(50_000), id: z.string().trim().min(1).max(200) }))
    .max(10)
    .default([]),
  caseKey: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "Use letters, digits, '.', '_', ':' or '-'."),
  category: z.string().trim().max(60).default(""),
  clarificationCount: z.number().int().min(0).max(10).default(0),
  expected: z.string().trim().default(""),
  history: z
    .array(z.object({ content: z.string().min(1), role: z.enum(["assistant", "user"]) }))
    .max(50)
    .default([]),
  message: z.string().trim().min(1),
  metadata: evalCaseMetadataSchema.default({}),
  metric: z.enum(evalMetrics).nullable().default(null),
});
export type CaseInput = z.infer<typeof caseSchema>;

/** What still blocks a Case from being run. Empty means complete. */
export function caseIssues(input: {
  expected: string;
  metadata: EvalCaseMetadata;
  metric: string | null;
}): string[] {
  const { expected, metadata, metric } = input;
  switch (metric) {
    case null:
      return ["Choose an evaluation type."];
    case "contains":
    case "exactMatch":
    case "gEval":
      return expected ? [] : ["Add the expected answer."];
    case "decision":
      return metadata.decisions?.length ? [] : ["Choose at least one expected decision."];
    case "tool":
      return metadata.tool ? [] : ["Name the Tool."];
    case "visibility":
      return metadata.canaries?.length ? [] : ["Add at least one forbidden phrase."];
    case "language":
      return metadata.language ? [] : ["Choose the expected language."];
    case "retrieval":
      return metadata.expectedPassages?.length ? [] : ["Add at least one expected passage."];
    default:
      return [];
  }
}
