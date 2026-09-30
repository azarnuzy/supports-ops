import type { ApiClient } from "./client";
import type { EvalBackend } from "./eval-destination";

export type EvalRunStatus = "QUEUED" | "RUNNING" | "FINISHED" | "ERROR";
export type EvalRunCaseStatus =
  | "PENDING"
  | "RUNNING"
  | "EVALUATED"
  | "EXECUTION_ERROR"
  | "UNEXECUTED"
  | "UNGRADED"
  | "INVALID";
export type EvalDeliveryStatus = "PENDING" | "DELIVERED" | "ERROR" | "NOT_CONFIGURED";

export type EvalRunSelection = { caseIds: string[]; datasetId: string };

export type EvalRunEstimate = {
  agentModel: string;
  /** Cases that make an AI Agent call; retriever-only and evaluator-health Cases make none. */
  agentTurns: number;
  balance: number;
  caseCount: number;
  /** AI Agent Credits (a ceiling). */
  credits: number;
  evaluatorHealthCases: number;
  judgeCallsMax: number;
  judgeCallsMin: number;
  /** Judge Credits at the most Judge calls the selected metrics may make. */
  judgeCredits: number;
  /** Judge Credits at the fewest. The real count depends on live output. */
  judgeCreditsMin: number;
  judgeRate: number;
  modelRate: number;
  sufficient: boolean;
  /** AI Agent Credits plus the most Judge Credits. */
  totalCredits: number;
  unlimited: boolean;
};

export type EvalRun = {
  centralDelivery: EvalDeliveryStatus;
  /** Stored evidence is kept until this time, then the delivery is failed for good. */
  centralExpiresAt: string | null;
  centralRetryable: boolean;
  cases: {
    caseKey: string;
    category: string;
    error: string | null;
    /** A negative control: its expected failure is never a product regression. */
    evaluatorHealth: boolean;
    id: string;
    judgeCalls: number;
    limitations: unknown;
    metric: string;
    passed: boolean | null;
    position: number;
    status: EvalRunCaseStatus;
    traceId: string | null;
  }[];
  agentCharged: number;
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
  judgeCallsCharged: number;
  judgeCharged: number;
  progress: {
    evaluated: number;
    evaluatorChecks: number;
    evaluatorHealthy: number;
    executionErrors: number;
    invalid: number;
    passed: number;
    total: number;
    unexecuted: number;
    ungraded: number;
  };
  status: EvalRunStatus;
  workspaceDelivery: EvalDeliveryStatus;
  workspaceExpiresAt: string | null;
  workspaceRetryable: boolean;
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

export async function retryEvalRunDelivery(
  client: ApiClient,
  id: string,
  target: "CENTRAL" | "WORKSPACE",
) {
  const response = await routes(client)[":id"].delivery[":target"].retry.$post({
    param: { id, target },
  });
  if (!response.ok) return fail(response, "Failed to retry delivery.");
  return (await response.json()) as unknown as { run: EvalRun };
}
