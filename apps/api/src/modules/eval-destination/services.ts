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
  const destination = current
    ? await prisma.evalDestination.update({ data: { ...base, ...keys }, where: { id: current.id } })
    : await prisma.evalDestination.create({
        data: { ...base, ...keys!, id: randomUUID(), workspaceId: requireWorkspaceId() },
      });
  return { evalDestination: toDto(destination) };
}

export type ReadinessResult = {
  credentials: "configured";
  /** Did the trace endpoint accept an authenticated, empty OTLP request? */
  endpoint: "accepted" | "unauthorized" | "rejected" | "unreachable" | "blocked";
  /** Does the same destination ingest evaluation evidence (OTLP logs), not just traces? */
  reports: "compatible" | "unsupported" | "unchecked";
};

/** Sends empty OTLP requests, so nothing is stored at the backend and no LLM is called. Never
 * follows redirects: the Authorization header must not leave the configured host. */
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
  };
  const { traces, logs } = otlpUrls(destination.endpoint);

  const post = async (url: string, body: object) => {
    await assertSafeDestination(url);
    return request(url, {
      body: JSON.stringify(body),
      headers,
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
  };

  let endpoint: ReadinessResult["endpoint"];
  try {
    const response = await post(traces, { resourceSpans: [] });
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
    const response = await post(logs, { resourceLogs: [] });
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

function toDto(destination: {
  backend: "LENS" | "LANGFUSE";
  dashboardUrl: string;
  endpoint: string;
  publicKeyLastFour: string;
  secretKeyLastFour: string;
}) {
  return {
    backend: destination.backend,
    dashboardUrl: destination.dashboardUrl,
    endpoint: destination.endpoint,
    publicKeyLastFour: destination.publicKeyLastFour,
    secretKeyLastFour: destination.secretKeyLastFour,
  };
}
