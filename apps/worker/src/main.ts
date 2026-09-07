import { telemetryConfig } from "./config";
import { startTelemetry } from "@repo/logger/telemetry";

startTelemetry({
  config: telemetryConfig,
  serviceName: "worker",
});

const { runWorker } = await import("./index");

runWorker();
