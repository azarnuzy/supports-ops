import type { ApiClient } from "./client";
import type { EvalBackend } from "./eval-destination";

export type EvalRunStatus = "QUEUED" | "RUNNING" | "FINISHED" | "ERROR";
export type EvalRunCaseStatus =
  | "PENDING"
  | "RUNNING"
  | "EVALUATED"
  | "EXECUTION_ERROR"
  | "UNEXECUTED";
export type EvalDeliveryStatus = "PENDING" | "DELIVERED" | "ERROR" | "NOT_CONFIGURED";

export type EvalRunSelection = { caseIds: string[]; datasetId: string };

export type EvalRunEstimate = {
  agentModel: string;
  balance: number;
  caseCount: number;
  credits: number;
  judgeCredits: number;
  modelRate: number;
  sufficient: boolean;
  unlimited: boolean;
};

export type EvalRun = {
  centralDelivery: EvalDeliveryStatus;
  cases: {
    caseKey: string;
    category: string;
    error: string | null;
    id: string;
    limitations: unknown;
    metric: string;
    passed: boolean | null;
    position: number;
    status: EvalRunCaseStatus;
    traceId: string | null;
  }[];
  chargedCredits: number;
  createdAt: string;
  creditExhausted: boolean;
  datasetId: string;
  datasetName: string;
  destinationBackend: EvalBackend;
  destinationDashboardUrl: string;
  error: string | null;
  estimatedCredits: number;
  finishedAt: string | null;
  id: string;
  progress: {
    evaluated: number;
    executionErrors: number;
    passed: number;
    total: number;
    unexecuted: number;
  };
  status: EvalRunStatus;
  workspaceDelivery: EvalDeliveryStatus;
};

const routes = (client: ApiClient) => client["eval-runs"];

/** Blocked starts carry an Admin-readable message; anything else falls back to `fallback`. */
async function fail(response: Response, fallback: string): Promise<never> {
  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  throw new Error(body?.message ?? fallback);
}

export async function estimateEvalRun(client: ApiClient, selection: EvalRunSelection) {
  const response = await routes(client).estimate.$post({ json: selection });
  if (!response.ok) return fail(response, "Failed to estimate the Run.");
  return (await response.json()) as unknown as { estimate: EvalRunEstimate };
}

export async function startEvalRun(client: ApiClient, selection: EvalRunSelection) {
  const response = await routes(client).$post({ json: selection });
  if (!response.ok) return fail(response, "Failed to start the Run.");
  return (await response.json()) as unknown as { run: EvalRun };
}

export async function getEvalRun(client: ApiClient, id: string) {
  const response = await routes(client)[":id"].$get({ param: { id } });
  if (!response.ok) throw new Error("Failed to load the Run.");
  return (await response.json()) as unknown as { run: EvalRun };
}

export async function listEvalRuns(client: ApiClient, datasetId: string) {
  const response = await routes(client).$get({ query: { datasetId } });
  if (!response.ok) throw new Error("Failed to load Runs.");
  return (await response.json()) as unknown as { runs: EvalRun[] };
}
