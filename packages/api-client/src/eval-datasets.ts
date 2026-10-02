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
  retrievalTarget?: "agent" | "retriever";
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
  createdAt: string;
  updatedAt: string;
  caseCount: number;
  id: string;
  incompleteCount: number;
  lastRunAt: string | null;
};
export type EvalDataset = EvalDatasetInput & {
  cases: EvalCase[];
  caseIndex: Pick<EvalCase, "id" | "caseKey" | "complete">[];
  page: number;
  total: number;
  id: string;
  createdAt: string;
  updatedAt: string;
};

const routes = (client: ApiClient) => client["eval-datasets"];

async function fail(response: Response, fallback: string): Promise<never> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  if (body?.error === "duplicate_case_key")
    throw new Error("Another case in this dataset already uses that ID.");
  throw new Error(fallback);
}

export async function listEvalDatasets(client: ApiClient) {
  const response = await routes(client).$get();
  if (!response.ok) throw new Error("Failed to load Eval Datasets.");
  return (await response.json()) as unknown as { datasets: EvalDatasetSummary[] };
}

export type EvalCaseFilters = {
  page: number;
  search: string;
  status: "all" | "ready" | "draft";
  sortBy?: "caseKey" | "message" | "category" | "metric" | "complete";
  sortDirection?: "asc" | "desc";
};

export async function getEvalDataset(
  client: ApiClient,
  id: string,
  filters: EvalCaseFilters = { page: 1, search: "", status: "all" },
) {
  const response = await routes(client)[":id"].$get({
    param: { id },
    query: { ...filters, page: String(filters.page) },
  });
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

export async function deleteEvalDataset(client: ApiClient, id: string) {
  const response = await routes(client)[":id"].$delete({ param: { id } });
  if (!response.ok) return fail(response, "Failed to delete the Eval Dataset.");
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

export type EvalImportRow = { case: EvalCaseInput | null; errors: string[]; row: number };
export type EvalImportPreview = {
  error: string | null;
  rows: EvalImportRow[];
  truncated: { limit: number; total: number } | null;
};
export type EvalImportSource =
  | { source: "csv"; text: string }
  | { source: "paste"; text: string }
  | {
      selections: { includeHistory: boolean; messageId: string }[];
      source: "sessions";
    };
export type EvalImportSession = {
  createdAt: string;
  id: string;
  messages: { content: string; id: string; position: number }[];
};

export async function listEvalImportSessions(client: ApiClient) {
  const response = await routes(client)["import-sessions"].$get();
  if (!response.ok) throw new Error("Failed to load recent Sessions.");
  return (await response.json()) as unknown as { sessions: EvalImportSession[] };
}

export async function previewEvalImport(
  client: ApiClient,
  datasetId: string,
  source: EvalImportSource,
) {
  const response = await routes(client)[":id"].import.preview.$post({
    json: source as never,
    param: { id: datasetId },
  });
  if (!response.ok) throw new Error("Failed to preview the import.");
  return (await response.json()) as unknown as { preview: EvalImportPreview };
}

export async function importEvalCases(
  client: ApiClient,
  datasetId: string,
  source: EvalImportSource,
) {
  const response = await routes(client)[":id"].import.$post({
    json: source as never,
    param: { id: datasetId },
  });
  if (!response.ok) return fail(response, "Failed to import the cases.");
  return (await response.json()) as unknown as { import: EvalImportPreview };
}

export type EvalImportMessage = {
  id: string;
  content: string;
  createdAt: string;
  position: number;
  session: {
    channel: { name: string; type: "WEB" | "WHATSAPP" };
    customerIdentity: { name: string; email: string | null; phoneE164: string | null };
  };
};
export type EvalMessageFilters = {
  page: number;
  search: string;
  channel: "all" | "WEB" | "WHATSAPP";
  since: "all" | "7" | "30" | "90";
};
export async function listEvalImportMessages(client: ApiClient, filters: EvalMessageFilters) {
  const response = await routes(client)["import-messages"].$get({
    query: { ...filters, page: String(filters.page) },
  });
  if (!response.ok) throw new Error("Failed to load Customer Messages.");
  return (await response.json()) as { messages: EvalImportMessage[]; page: number; total: number };
}

export async function updateEvalCaseExpectations(
  client: ApiClient,
  datasetId: string,
  input: Pick<EvalCaseInput, "expected" | "metric" | "metadata"> & { caseIds: string[] },
) {
  const response = await routes(client)[":id"].cases.$put({
    param: { id: datasetId },
    json: input,
  });
  if (!response.ok)
    return fail(response, "Failed to update case expectations. Your selection is kept for retry.");
}

export async function getEvalImportMessageContext(client: ApiClient, messageId: string) {
  const response = await routes(client)["import-messages"][":messageId"].context.$get({
    param: { messageId },
  });
  if (!response.ok) throw new Error("Unable to load the preceding conversation context.");
  return (await response.json()) as {
    history: { id: string; content: string; role: "user" | "assistant" }[];
  };
}
