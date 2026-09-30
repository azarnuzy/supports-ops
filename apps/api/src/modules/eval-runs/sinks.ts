import type { TelemetrySink } from "@repo/logger/isolated-telemetry";
import { getTelemetryHeaders } from "@repo/logger/telemetry";
import { telemetryConfig, toolEncryptionConfig } from "../../config";
import { assertSafeDestination } from "../eval-destination/outbound";
import { otlpUrls } from "../eval-destination/services";
import { decryptToolSecret } from "../tools/secrets";

function otlpSink(options: {
  endpoint: string;
  headers: Record<string, string>;
  name: string;
  /** Rejects an address the server must not call. Run again on every send. */
  guard?: (url: string) => Promise<unknown>;
}): TelemetrySink {
  const urls = otlpUrls(options.endpoint);
  return {
    name: options.name,
    async send(signal, body) {
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
  });
}

/** The Workspace's own Lens or Langfuse, from the destination frozen onto the Run. Credentials are
 * decrypted here, in memory, and are never placed in a queue payload or a log. */
export function workspaceSink(destination: {
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
  });
}
