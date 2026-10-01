import type { TelemetrySink } from "@repo/logger/isolated-telemetry";
import { getTelemetryHeaders } from "@repo/logger/telemetry";
import { telemetryConfig, toolEncryptionConfig } from "../../config";
import { assertSafeDestination } from "../eval-destination/outbound";
import { langfuseApiUrl, otlpUrls } from "../eval-destination/services";
import { decryptToolSecret } from "../tools/secrets";

function otlpSink(options: {
  endpoint: string;
  headers: Record<string, string>;
  name: string;
  /** Workspace declares its backend; central OTLP falls back only when logs return 404. */
  scores?: boolean | "on-404";
  /** Rejects an address the server must not call. Run again on every send. */
  guard?: (url: string) => Promise<unknown>;
}): TelemetrySink {
  const urls = otlpUrls(options.endpoint);
  const sendScores = async (body: string) => {
    const url = langfuseApiUrl(options.endpoint, "scores");
    for (const score of langfuseScores(body)) {
      await options.guard?.(url);
      const response = await fetch(url, {
        body: JSON.stringify(score),
        headers: { ...options.headers, "content-type": "application/json" },
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`${options.name} answered ${response.status} for scores.`);
    }
  };
  return {
    name: options.name,
    async send(signal, body) {
      if (signal === "logs" && options.scores === true) return sendScores(body);
      const url = urls[signal];
      await options.guard?.(url);
      const response = await fetch(url, {
        body,
        headers: { ...options.headers, "content-type": "application/json" },
        method: "POST",
        // The Authorization header must never follow a redirect off the configured host.
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
      if (
        signal === "logs" &&
        response.status === 404 &&
        options.scores === "on-404" &&
        /\/api\/public\/otel(?:\/v1\/traces)?\/*$/.test(new URL(options.endpoint).pathname)
      )
        return sendScores(body);
      if (!response.ok)
        throw new Error(`${options.name} answered ${response.status} for ${signal}.`);
    },
  };
}

/** SupportOps' own telemetry backend, configured for the deployment. Absent when tracing is off
 * or only prints to the console, so there is nothing to deliver to. */
export function centralSink(): TelemetrySink | null {
  if (!telemetryConfig.enabled || telemetryConfig.exporter !== "otlp") return null;
  if (!telemetryConfig.otlpEndpoint) return null;
  return otlpSink({
    endpoint: telemetryConfig.otlpEndpoint,
    headers: getTelemetryHeaders(telemetryConfig) ?? {},
    name: "central",
    scores: "on-404",
  });
}

/** The Workspace's own Lens or Langfuse, from the destination frozen onto the Run. Credentials are
 * decrypted here, in memory, and are never placed in a queue payload or a log. */
export function workspaceSink(destination: {
  backend: "LENS" | "LANGFUSE";
  credentialsEncrypted: string;
  endpoint: string;
}): TelemetrySink {
  const { publicKey, secretKey } = JSON.parse(
    decryptToolSecret(destination.credentialsEncrypted, toolEncryptionConfig.masterKey),
  ) as { publicKey: string; secretKey: string };
  return otlpSink({
    endpoint: destination.endpoint,
    guard: (url) => assertSafeDestination(url),
    headers: {
      authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`,
      "x-langfuse-ingestion-version": "4",
    },
    name: "workspace",
    scores: destination.backend === "LANGFUSE",
  });
}

type OtlpValue = {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: string | number;
  doubleValue?: number;
  arrayValue?: { values?: OtlpValue[] };
  kvlistValue?: { values?: { key: string; value: OtlpValue }[] };
};

function otlpValue(value: OtlpValue): unknown {
  if (value.arrayValue) return (value.arrayValue.values ?? []).map(otlpValue);
  if (value.kvlistValue) {
    return Object.fromEntries(
      (value.kvlistValue.values ?? []).map(({ key, value: entry }) => [key, otlpValue(entry)]),
    );
  }
  return (
    value.stringValue ??
    value.boolValue ??
    value.doubleValue ??
    (value.intValue === undefined ? undefined : Number(value.intValue))
  );
}

/** Translate the Anvia reporter's OTLP evidence at delivery time, including stored retries. */
export function langfuseScores(body: string) {
  const payload = JSON.parse(body) as {
    resourceLogs?: {
      scopeLogs?: {
        logRecords?: {
          traceId?: string;
          spanId?: string;
          attributes?: { key: string; value: OtlpValue }[];
        }[];
      }[];
    }[];
  };
  return (payload.resourceLogs ?? []).flatMap((resource) =>
    (resource.scopeLogs ?? []).flatMap((scope) =>
      (scope.logRecords ?? []).flatMap((record) => {
        const attributes = Object.fromEntries(
          (record.attributes ?? []).map(({ key, value }) => [key, otlpValue(value)]),
        );
        const name = attributes["gen_ai.evaluation.name"];
        if (typeof name !== "string") return []; // Run lifecycle events are not scores.
        const id = attributes["anvia.eval.id"];
        if (typeof id !== "string") throw new Error("Evaluation evidence is missing its score ID.");
        const numeric = attributes["gen_ai.evaluation.score.value"];
        // Invalid evaluations are not failing grades, even when Anvia projects them to zero.
        const value =
          attributes["anvia.eval.outcome"] === "invalid"
            ? "invalid"
            : (numeric ?? attributes["gen_ai.evaluation.score.label"]);
        if (typeof value !== "number" && typeof value !== "string") {
          throw new Error("Evaluation evidence is missing its score value.");
        }
        const traceId = attributes["anvia.eval.target.trace_id"] ?? record.traceId;
        const observationId = attributes["anvia.eval.target.observation_id"] ?? record.spanId;
        const runId = attributes["anvia.eval.run.id"];
        const hasTrace =
          typeof traceId === "string" && /^[0-9a-f]{32}$/i.test(traceId) && !/^0+$/.test(traceId);
        if (!hasTrace && typeof runId !== "string") {
          throw new Error("Evaluation evidence has neither a trace nor an Eval Run.");
        }
        return [
          {
            id, // Langfuse upserts this ID when a partially delivered batch is retried.
            name,
            value,
            dataType:
              typeof value === "string"
                ? "CATEGORICAL"
                : attributes["anvia.eval.data_type"] === "BOOLEAN"
                  ? "BOOLEAN"
                  : "NUMERIC",
            ...(hasTrace
              ? {
                  traceId,
                  ...(typeof observationId === "string" &&
                  /^[0-9a-f]{16}$/i.test(observationId) &&
                  !/^0+$/.test(observationId)
                    ? { observationId }
                    : {}),
                }
              : { sessionId: `eval-run-${runId}` }),
            comment: attributes["gen_ai.evaluation.explanation"],
            metadata: attributes,
          },
        ];
      }),
    ),
  );
}
