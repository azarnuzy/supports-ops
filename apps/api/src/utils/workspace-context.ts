import { AsyncLocalStorage } from "node:async_hooks";

export class MissingWorkspaceContextError extends Error {
  constructor() {
    super("A Workspace-scoped query requires an active Workspace context.");
    this.name = "MissingWorkspaceContextError";
  }
}

const workspaceContext = new AsyncLocalStorage<string>();

/**
 * Runs work with the Workspace that owns the request. All Workspace-scoped
 * Prisma queries made by that work use this value automatically.
 */
export function withWorkspaceContext<Value>(workspaceId: string, operation: () => Value): Value {
  return workspaceContext.run(workspaceId, operation);
}

export function requireWorkspaceId() {
  const workspaceId = workspaceContext.getStore();

  if (!workspaceId) {
    throw new MissingWorkspaceContextError();
  }

  return workspaceId;
}
