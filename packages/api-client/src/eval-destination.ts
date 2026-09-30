import type { ApiClient } from "./client";

export type EvalBackend = "LENS" | "LANGFUSE";

export type EvalDestination = {
  backend: EvalBackend;
  dashboardUrl: string;
  endpoint: string;
  publicKeyLastFour: string;
  secretKeyLastFour: string;
};

/** Keys are optional on update: omitted keeps the stored credentials. */
export type EvalDestinationInput = {
  backend: EvalBackend;
  dashboardUrl: string;
  endpoint: string;
  publicKey?: string;
  secretKey?: string;
};

export type EvalDestinationReadiness = {
  credentials: "configured";
  endpoint: "accepted" | "unauthorized" | "rejected" | "unreachable" | "blocked";
  reports: "compatible" | "unsupported" | "unchecked";
};

const routes = (client: ApiClient) => client["eval-destination"];

export async function getEvalDestination(client: ApiClient) {
  const response = await routes(client).$get();
  if (!response.ok) throw new Error("Failed to load the evaluation destination.");
  return (await response.json()) as unknown as { evalDestination: EvalDestination | null };
}

export async function saveEvalDestination(client: ApiClient, input: EvalDestinationInput) {
  const response = await routes(client).$put({ json: input });
  if (response.status === 422) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? "This destination is not allowed.");
  }
  if (!response.ok) throw new Error("Failed to save the evaluation destination.");
  return (await response.json()) as unknown as { evalDestination: EvalDestination };
}

export async function checkEvalDestination(client: ApiClient) {
  const response = await routes(client).check.$post();
  if (!response.ok) throw new Error("Failed to check the evaluation destination.");
  return (await response.json()) as unknown as { readiness: EvalDestinationReadiness };
}
