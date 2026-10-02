import { randomUUID } from "node:crypto";
import { toolEncryptionConfig } from "../../config";
import { prisma } from "../../utils/prisma";
import { requireWorkspaceId } from "../../utils/workspace-context";
import { decryptToolSecret, encryptToolSecret } from "../tools/secrets";
import { assertSafeDestination, UnsafeDestinationError } from "./outbound";
import type { EvalDestinationInput } from "./schema";

export class CredentialsRequiredError extends Error {}
export class DestinationNotFoundError extends Error {}
export { UnsafeDestinationError };

type Credentials = { publicKey: string; secretKey: string };

export async function getEvalDestination() {
  const destination = await prisma.evalDestination.findFirst();
  return { evalDestination: destination ? toDto(destination) : null };
}

export async function saveEvalDestination(input: EvalDestinationInput) {
  await assertSafeDestination(input.endpoint);
  const current = await prisma.evalDestination.findFirst({ select: { id: true } });
  const { publicKey, secretKey } = input;
  if (!!publicKey !== !!secretKey || (!current && !publicKey)) {
    throw new CredentialsRequiredError("Enter both the public key and the secret key.");
  }
  const base = {
    backend: input.backend,
    dashboardUrl: input.dashboardUrl,
    endpoint: input.endpoint,
    productionTracingEnabled: input.productionTracingEnabled,
  };
  const keys =
    publicKey && secretKey
      ? {
          credentialsEncrypted: encryptToolSecret(
            JSON.stringify({ publicKey, secretKey }),
            toolEncryptionConfig.masterKey,
          ),
          publicKeyLastFour: publicKey.slice(-4),
          secretKeyLastFour: secretKey.slice(-4),
        }
      : undefined;
  if (current) {
    const destination = await prisma.evalDestination.update({
      data: { ...base, ...keys },
      where: { id: current.id },
    });
    return { evalDestination: toDto(destination) };
  }
  if (!keys) throw new CredentialsRequiredError("Enter both the public key and the secret key.");
  const destination = await prisma.evalDestination.create({
    data: { ...base, ...keys, id: randomUUID(), workspaceId: requireWorkspaceId() },
  });
  return { evalDestination: toDto(destination) };
}

export type ReadinessResult = {
  credentials: "configured";
  /** Did the trace endpoint accept an authenticated, empty OTLP request? */
  endpoint: "accepted" | "unauthorized" | "rejected" | "unreachable" | "blocked";
  /** Does the destination expose its evaluation API, not just trace ingestion? */
  reports: "compatible" | "unsupported" | "unchecked";
};

/** Sends empty OTLP requests and reads Langfuse score configs without storing data or calling an LLM.
 * Never follows redirects: the Authorization header must not leave the configured host. */
export async function checkEvalDestination(
  request: typeof fetch = fetch,
): Promise<ReadinessResult> {
  const destination = await prisma.evalDestination.findFirst();
  if (!destination) throw new DestinationNotFoundError();
  const { publicKey, secretKey } = JSON.parse(
    decryptToolSecret(destination.credentialsEncrypted, toolEncryptionConfig.masterKey),
  ) as Credentials;
  const headers = {
    authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`,
    "content-type": "application/json",
    "x-langfuse-ingestion-version": "4",
  };
  const { traces, logs } = otlpUrls(destination.endpoint);

  const probe = async (url: string, body?: object) => {
    await assertSafeDestination(url);
    return request(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method: body === undefined ? "GET" : "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
  };

  let endpoint: ReadinessResult["endpoint"];
  try {
    const response = await probe(traces, { resourceSpans: [] });
    endpoint = response.ok
      ? "accepted"
      : response.status === 401 || response.status === 403
        ? "unauthorized"
        : "rejected";
  } catch (error) {
    endpoint = error instanceof UnsafeDestinationError ? "blocked" : "unreachable";
  }
  if (endpoint !== "accepted") return { credentials: "configured", endpoint, reports: "unchecked" };

  try {
    const response =
      destination.backend === "LANGFUSE"
        ? await probe(`${langfuseApiUrl(destination.endpoint, "score-configs")}?limit=1`)
        : await probe(logs, { resourceLogs: [] });
    return {
      credentials: "configured",
      endpoint,
      reports: response.ok ? "compatible" : "unsupported",
    };
  } catch {
    return { credentials: "configured", endpoint, reports: "unsupported" };
  }
}

/** Accepts either the OTLP base (Langfuse `.../api/public/otel`) or a full `.../v1/traces` URL
 * (Lens), and derives the trace and log signal URLs from it. */
export function otlpUrls(endpoint: string) {
  const base = endpoint.replace(/\/+$/, "").replace(/\/v1\/traces$/, "");
  return { logs: `${base}/v1/logs`, traces: `${base}/v1/traces` };
}

/** Preserve self-hosted path prefixes and the configured host when selecting a public API. */
export function langfuseApiUrl(endpoint: string, resource: "scores" | "score-configs") {
  const url = new URL(endpoint);
  if (!/\/api\/public\/otel(?:\/v1\/traces)?\/*$/.test(url.pathname)) {
    throw new Error(
      "Langfuse requires an /api/public/otel or /api/public/otel/v1/traces endpoint.",
    );
  }
  url.pathname = url.pathname.replace(/\/otel(?:\/v1\/traces)?\/*$/, `/${resource}`);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function toDto(destination: {
  backend: "LENS" | "LANGFUSE";
  dashboardUrl: string;
  endpoint: string;
  publicKeyLastFour: string;
  secretKeyLastFour: string;
  productionTracingEnabled: boolean;
}) {
  return {
    backend: destination.backend,
    dashboardUrl: destination.dashboardUrl,
    endpoint: destination.endpoint,
    publicKeyLastFour: destination.publicKeyLastFour,
    secretKeyLastFour: destination.secretKeyLastFour,
    productionTracingEnabled: destination.productionTracingEnabled,
  };
}
