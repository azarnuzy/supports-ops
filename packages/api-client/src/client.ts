import { hc } from "hono/client";
import type { AppType } from "@repo/api";

/** The Workspace an Organization Admin has switched into for this browser
 * tab (ADR-0026's Workspace switcher, #270). `sessionStorage` keeps two tabs
 * on different Workspaces independent of each other; storing it under this
 * one key means every feature's `createApiClient` call sends the current
 * selection without threading it through by hand. */
export const activeWorkspaceStorageKey = "supportops:active-workspace-id";

function activeWorkspaceId() {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(activeWorkspaceStorageKey);
}

export function createApiClient(baseUrl: string) {
  const workspaceId = activeWorkspaceId();

  return hc<AppType>(baseUrl, {
    init: {
      credentials: "include",
      headers: workspaceId ? { "X-Workspace-Id": workspaceId } : undefined,
    },
  });
}

export type ApiClient = ReturnType<typeof createApiClient>;
