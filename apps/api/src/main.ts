import { telemetryConfig } from "./config";
import { configureWorkspaceTelemetry, startTelemetry } from "@repo/logger/telemetry";

startTelemetry({
  config: telemetryConfig,
  serviceName: "api",
});

const { workspaceTelemetry } = await import("./modules/eval-destination/telemetry");
configureWorkspaceTelemetry(workspaceTelemetry);

await import("./index");
