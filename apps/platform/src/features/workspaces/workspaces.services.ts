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

const workspaceChangeEvent = "supportops:workspace-changed";

export function subscribeToWorkspaceChange(onChange: () => void) {
  window.addEventListener(workspaceChangeEvent, onChange);
  return () => window.removeEventListener(workspaceChangeEvent, onChange);
}

export function switchToWorkspace(workspaceId: string) {
  sessionStorage.setItem(activeWorkspaceStorageKey, workspaceId);
  window.dispatchEvent(new Event(workspaceChangeEvent));
}
