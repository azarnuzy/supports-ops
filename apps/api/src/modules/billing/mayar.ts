import { mayarConfig } from "../../config";

export class MayarUnavailableError extends Error {}

const requestTimeoutMs = 15_000;

async function mayarRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = mayarConfig.apiKey;
  if (!apiKey) throw new MayarUnavailableError("MAYAR_API_KEY is not configured.");
  const response = await fetch(`${mayarConfig.apiUrl}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) {
    throw new MayarUnavailableError(`Mayar ${path} responded ${response.status}.`);
  }
  return ((await response.json()) as { data: T }).data;
}

/** A Mayar Single Payment Request: one amount, one checkout link. */
export function createMayarPayment(params: {
  amount: number;
  description: string;
  email: string;
  expiredAt: Date;
  name: string;
}) {
  return mayarRequest<{ id: string; link: string }>("/payments/create", {
    body: JSON.stringify({ ...params, expiredAt: params.expiredAt.toISOString() }),
    method: "POST",
  });
}

export function fetchMayarPayment(id: string) {
  return mayarRequest<{ amount: number; id: string; status: string }>(
    `/payments/${encodeURIComponent(id)}`,
  );
}
