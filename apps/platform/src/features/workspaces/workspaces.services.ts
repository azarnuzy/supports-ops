import {
  activeWorkspaceStorageKey,
  createApiClient,
  createWorkspace,
  listWorkspaces,
} from "@repo/api-client";

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const apiClient = createApiClient(apiBaseUrl);

export async function getWorkspaces() {
  return listWorkspaces(apiClient);
}

export async function createOrganizationWorkspace(name: string) {
  return createWorkspace(apiClient, name);
}

export function getActiveWorkspaceId() {
  return sessionStorage.getItem(activeWorkspaceStorageKey);
}

/** Switches this tab into a Workspace and opens its Inbox. A hard navigation
 * is simplest and correct here: every already-open `@repo/api-client`
 * instance was built with the previous selection baked into its headers, so
 * only a fresh page load (which reconstructs them) is guaranteed to send the
 * new one. */
export function switchToWorkspace(workspaceId: string) {
  sessionStorage.setItem(activeWorkspaceStorageKey, workspaceId);
  window.location.assign("/chat");
}
