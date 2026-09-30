import type { ApiClient } from "./client";

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

export type EvalCaseMetadata = {
  canaries?: string[];
  decisions?: ("CLARIFY" | "ESCALATE" | "REPLY" | "RESOLVE")[];
  expectedPassages?: { fragment: string; grade?: 1 | 2; source: string }[];
  language?: "en" | "id";
  tool?: string;
  toolMustNotBeCalled?: boolean;
};

export type EvalCaseInput = {
  attachments: { content: string; id: string }[];
  caseKey: string;
  category: string;
  clarificationCount: number;
  expected: string;
  history: { content: string; role: "assistant" | "user" }[];
  message: string;
  metadata: EvalCaseMetadata;
  metric: EvalMetric | null;
};

export type EvalCase = EvalCaseInput & {
  complete: boolean;
  id: string;
  issues: string[];
};

export type EvalDatasetInput = { criteria: string; name: string };
export type EvalDatasetSummary = EvalDatasetInput & {
  caseCount: number;
  id: string;
  incompleteCount: number;
};
export type EvalDataset = EvalDatasetInput & { cases: EvalCase[]; id: string };

const routes = (client: ApiClient) => client["eval-datasets"];

async function fail(response: Response, fallback: string): Promise<never> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  if (body?.error === "duplicate_case_key")
    throw new Error("Another case in this Workspace already uses that ID.");
  throw new Error(fallback);
}

export async function listEvalDatasets(client: ApiClient) {
  const response = await routes(client).$get();
  if (!response.ok) throw new Error("Failed to load Eval Datasets.");
  return (await response.json()) as unknown as { datasets: EvalDatasetSummary[] };
}

export async function getEvalDataset(client: ApiClient, id: string) {
  const response = await routes(client)[":id"].$get({ param: { id } });
  if (!response.ok) throw new Error("Failed to load the Eval Dataset.");
  return (await response.json()) as unknown as { dataset: EvalDataset };
}

export async function createEvalDataset(client: ApiClient, input: EvalDatasetInput) {
  const response = await routes(client).$post({ json: input });
  if (!response.ok) return fail(response, "Failed to create the Eval Dataset.");
  return (await response.json()) as unknown as { dataset: { id: string } };
}

export async function updateEvalDataset(client: ApiClient, id: string, input: EvalDatasetInput) {
  const response = await routes(client)[":id"].$put({ json: input, param: { id } });
  if (!response.ok) return fail(response, "Failed to save the Eval Dataset.");
}

export async function createEvalCase(client: ApiClient, datasetId: string, input: EvalCaseInput) {
  const response = await routes(client)[":id"].cases.$post({
    json: input as never,
    param: { id: datasetId },
  });
  if (!response.ok) return fail(response, "Failed to create the case.");
}

export async function updateEvalCase(
  client: ApiClient,
  datasetId: string,
  caseId: string,
  input: EvalCaseInput,
) {
  const response = await routes(client)[":id"].cases[":caseId"].$put({
    json: input as never,
    param: { caseId, id: datasetId },
  });
  if (!response.ok) return fail(response, "Failed to save the case.");
}

export async function deleteEvalCase(client: ApiClient, datasetId: string, caseId: string) {
  const response = await routes(client)[":id"].cases[":caseId"].$delete({
    param: { caseId, id: datasetId },
  });
  if (!response.ok) return fail(response, "Failed to delete the case.");
}
