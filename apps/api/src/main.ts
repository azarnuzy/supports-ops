import { telemetryConfig } from "./config";
import { startTelemetry } from "@repo/logger/telemetry";

startTelemetry({
  config: telemetryConfig,
  serviceName: "api",
});

await import("./index");
