import { createLogger } from "@repo/logger";
import { loggerConfig } from "../config";

export const logger = createLogger({ ...loggerConfig, service: "api" });
