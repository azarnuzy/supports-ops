import { EmailAlreadyInUseApiError } from "./auth";
import type { ApiClient } from "./client";

export type WorkspaceUser = {
  createdAt: string;
  email: string;
  id: string;
  name: string;
  role: "ADMIN" | "HUMAN_AGENT";
  updatedAt: string;
};

export type CreateHumanAgentInput = {
  email: string;
  name: string;
  password: string;
};

export async function listWorkspaceUsers(client: ApiClient) {
  const response = await client.users.$get({ query: {} });

  if (response.status === 403) {
    throw new Error("You do not have permission to view Human Agents.");
  }

  if (!response.ok) {
    throw new Error("Failed to load Human Agents.");
  }

  return (await response.json()) as { nextCursor: string | null; users: WorkspaceUser[] };
}

export async function createWorkspaceHumanAgent(client: ApiClient, input: CreateHumanAgentInput) {
  const response = await client.users.$post({ json: input });

  if (response.status === 403) {
    throw new Error("You do not have permission to create Human Agents.");
  }

  if (response.status === 409) {
    const data = (await response.json()) as { message: string };
    throw new EmailAlreadyInUseApiError(data.message);
  }

  if (!response.ok) {
    throw new Error("Failed to create Human Agent.");
  }

  return (await response.json()) as { user: WorkspaceUser };
}
