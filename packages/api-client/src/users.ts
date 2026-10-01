import { EmailAlreadyInUseApiError } from "./auth";
import type { ApiClient } from "./client";

export type WorkspaceUser = {
  createdAt: string;
  email: string;
  id: string;
  name: string;
  role: "ADMIN" | "HUMAN_AGENT";
  isOrganizationAdmin: boolean;
  updatedAt: string;
};

export type CreateHumanAgentInput = {
  email: string;
  name: string;
  password: string;
  role: "ADMIN" | "HUMAN_AGENT";
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

export async function updateWorkspaceUser(
  client: ApiClient,
  userId: string,
  role: "ADMIN" | "HUMAN_AGENT",
) {
  const response = await client.users[":id"].$patch({ param: { id: userId }, json: { role } });
  if (!response.ok) throw new Error("Failed to update Workspace role.");
}

export async function removeWorkspaceUser(client: ApiClient, userId: string) {
  const response = await client.users[":id"].$delete({ param: { id: userId } });
  if (!response.ok) throw new Error("Failed to remove user.");
}

export async function updateOrganizationAdmin(client: ApiClient, userId: string, enabled: boolean) {
  const response = await client.users[":id"]["organization-admin"].$patch({
    param: { id: userId },
    json: { enabled },
  });
  if (!response.ok) throw new Error("Failed to update Organization Admin.");
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
