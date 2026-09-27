import type { ApiClient } from "./client";

export type Workspace = { id: string; name: string; slug: string };

export async function listWorkspaces(client: ApiClient) {
  const response = await client.workspaces.$get();

  if (!response.ok) {
    throw new Error("Failed to load Workspaces.");
  }

  const data = await response.json();

  return data.workspaces as Workspace[];
}

export async function createWorkspace(client: ApiClient, name: string) {
  const response = await client.workspaces.$post({ json: { name } });

  if (!response.ok) {
    throw new Error("Failed to create Workspace.");
  }

  const data = await response.json();

  return data.workspace as Workspace;
}
