import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { recordExternalFailure } from "@repo/logger/telemetry";

export type ExternalFailure = {
  provider: string;
  operation: string;
  modelId?: string;
  workspaceId?: string;
  resourceType?: string;
  resourceId?: string;
  httpStatus?: number;
  code?: string;
};

/** Record a provider failure without storing customer data, URLs, or raw provider responses. */
export async function recordExternalError(db: PrismaClient, failure: ExternalFailure) {
  recordExternalFailure({
    "external.provider": failure.provider,
    "external.operation": failure.operation,
    ...(failure.modelId ? { "external.model_id": failure.modelId } : {}),
    ...(failure.httpStatus ? { "http.response.status_code": failure.httpStatus } : {}),
    ...(failure.code ? { "error.type": failure.code } : {}),
    ...(failure.resourceType ? { "supportops.resource_type": failure.resourceType } : {}),
    ...(failure.resourceId ? { "supportops.resource_id": failure.resourceId } : {}),
  });
  try {
    await db.$executeRaw`
      INSERT INTO "ExternalError" ("id", "workspaceId", "provider", "operation", "modelId", "code", "httpStatus", "resourceType", "resourceId")
      VALUES (${randomUUID()}, ${failure.workspaceId ?? null}, ${failure.provider}, ${failure.operation}, ${failure.modelId ?? null},
        ${failure.code ?? null}, ${failure.httpStatus ?? null}, ${failure.resourceType ?? null}, ${failure.resourceId ?? null})
    `;
  } catch {
    // Recording must never change the outcome of the customer operation.
    console.error("Failed to record an external service error.");
  }
}

export function externalErrorCode(error: unknown, depth = 0): string {
  if (!error || typeof error !== "object") return "UNKNOWN";
  if (depth < 3 && "cause" in error && error.cause) {
    const causedBy = externalErrorCode(error.cause, depth + 1);
    if (causedBy !== "UNKNOWN") return causedBy;
  }
  const candidate = "code" in error ? error.code : "name" in error ? error.name : undefined;
  return safeCode(candidate) ?? "UNKNOWN";
}

function safeCode(candidate: unknown): string | undefined {
  if (typeof candidate === "number" && Number.isInteger(candidate)) return String(candidate);
  return typeof candidate === "string" && /^[A-Za-z0-9_:-]{1,64}$/.test(candidate)
    ? candidate
    : undefined;
}

export function externalHttpStatus(error: unknown, depth = 0): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = "status" in error ? error.status : "statusCode" in error ? error.statusCode : null;
  if (typeof value === "number" && value >= 100 && value <= 599) return value;
  return depth < 3 && "cause" in error ? externalHttpStatus(error.cause, depth + 1) : undefined;
}

export function tagExternalError(
  error: unknown,
  provider: string,
  status?: number,
  code?: string | number,
) {
  return Object.assign(error instanceof Error ? error : new Error("External request failed."), {
    externalProvider: provider,
    ...(status === undefined ? {} : { status }),
    ...(code === undefined ? {} : { code }),
  });
}

// ponytail: single in-process gate, good enough for one worker process. If the
// worker ever scales to multiple instances, move this to a Redis-backed limiter.
let mistralGate: Promise<void> = Promise.resolve();

/** Serializes calls with a minimum 1.1s gap, matching Mistral's OCR rate limit
 * (1 request/second account-wide) so concurrent jobs and retries never overlap. */
function throttleMistral<T>(fn: () => Promise<T>): Promise<T> {
  const run = mistralGate.then(fn);
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 1100));
  mistralGate = run.then(wait, wait);
  return run;
}

/** Retries a 429 response, honoring `Retry-After` when the provider sends one.
 * Non-429 responses (including other errors) are returned as-is on the first try. */
export async function fetchWithRetry(
  input: string,
  init: RequestInit,
  maxAttempts = 3,
): Promise<Response> {
  return throttleMistral(async () => {
    for (let attempt = 1; ; attempt++) {
      const response = await fetch(input, init);
      if (response.status !== 429 || attempt >= maxAttempts) return response;
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      const delayMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : 2 ** attempt * 1000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  });
}

export function externalResponseCode(body: string): string | undefined {
  try {
    const code = (JSON.parse(body) as { code?: unknown }).code;
    return safeCode(code);
  } catch {
    return undefined;
  }
}
