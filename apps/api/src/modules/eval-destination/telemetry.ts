import type { WorkspaceTelemetryOptions } from "@repo/logger/telemetry";
import { unscopedPrisma } from "../../utils/prisma";
import { requireWorkspaceId } from "../../utils/workspace-context";
import { workspaceSink } from "../eval-runs/sinks";

export const workspaceTelemetry: WorkspaceTelemetryOptions = {
  workspaceId() {
    try {
      return requireWorkspaceId();
    } catch {
      return undefined;
    }
  },
  async resolveSink(workspaceId) {
    const destination = await unscopedPrisma.evalDestination.findUnique({
      where: { workspaceId },
    });
    return destination?.productionTracingEnabled ? workspaceSink(destination) : null;
  },
};
