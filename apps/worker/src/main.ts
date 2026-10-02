import { telemetryConfig } from "./config";
import { configureWorkspaceTelemetry, startTelemetry } from "@repo/logger/telemetry";

startTelemetry({
  config: telemetryConfig,
  serviceName: "worker",
});

const { workspaceTelemetry } = await import("@repo/api/workspace-telemetry");
configureWorkspaceTelemetry(workspaceTelemetry);

const { runWorker } = await import("./index");

runWorker();
