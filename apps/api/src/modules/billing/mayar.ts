import { mayarConfig } from "../../config";
import {
  externalErrorCode,
  externalHttpStatus,
  recordExternalError,
} from "../../utils/external-errors";
import { unscopedPrisma } from "../../utils/prisma";

export class MayarUnavailableError extends Error {}

const requestTimeoutMs = 15_000;

async function mayarRequest<T>(path: string, init?: RequestInit, workspaceId?: string): Promise<T> {
  const apiKey = mayarConfig.apiKey;
  if (!apiKey) throw new MayarUnavailableError("MAYAR_API_KEY is not configured.");
  try {
    const response = await fetch(`${mayarConfig.apiUrl}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) {
      throw Object.assign(new MayarUnavailableError(`Mayar request failed (${response.status}).`), {
        status: response.status,
      });
    }
    return ((await response.json()) as { data: T }).data;
  } catch (error) {
    await recordExternalError(unscopedPrisma, {
      provider: "MAYAR",
      operation: path === "/payments/create" ? "CREATE_PAYMENT" : "FETCH_PAYMENT",
      workspaceId,
      code: externalErrorCode(error),
      httpStatus: externalHttpStatus(error),
    });
    throw error;
  }
}

/** A Mayar Single Payment Request: one amount, one checkout link. */
export function createMayarPayment(
  params: { amount: number; description: string; email: string; expiredAt: Date; name: string },
  workspaceId?: string,
) {
  return mayarRequest<{ id: string; link: string }>(
    "/payments/create",
    {
      body: JSON.stringify({ ...params, expiredAt: params.expiredAt.toISOString() }),
      method: "POST",
    },
    workspaceId,
  );
}

export function fetchMayarPayment(id: string, workspaceId?: string) {
  return mayarRequest<{ amount: number; id: string; status: string }>(
    `/payments/${encodeURIComponent(id)}`,
    undefined,
    workspaceId,
  );
}
