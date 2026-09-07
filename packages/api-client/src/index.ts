import { hc } from "hono/client";
import type { AppType } from "@repo/api";

export function createApiClient(baseUrl: string) {
  return hc<AppType>(baseUrl, {
    init: {
      credentials: "include",
    },
  });
}

export type ApiClient = ReturnType<typeof createApiClient>;

export type UpdateProfileInput = {
  image?: string | null;
  name: string;
};

export class UnauthorizedApiError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedApiError";
  }
}

export async function fetchSessionUser(client: ApiClient) {
  const response = await client.session.$get();

  if (response.status === 401) {
    throw new UnauthorizedApiError();
  }

  if (!response.ok) {
    throw new Error("Failed to load current user.");
  }

  const data = await response.json();

  return data.user;
}

export async function updateCurrentUserProfile(client: ApiClient, input: UpdateProfileInput) {
  const response = await client.profile.$patch({
    json: input,
  });

  if (response.status === 401) {
    throw new UnauthorizedApiError();
  }

  if (!response.ok) {
    throw new Error("Failed to update profile.");
  }

  const data = await response.json();

  return data.user;
}

export type RegisterWorkspaceAdminInput = {
  email: string;
  name: string;
  password: string;
};

export class EmailAlreadyInUseApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailAlreadyInUseApiError";
  }
}

export async function registerWorkspaceAdmin(
  client: ApiClient,
  input: RegisterWorkspaceAdminInput,
) {
  const response = await client.register.$post({
    json: input,
  });

  if (response.status === 409) {
    const data = (await response.json()) as { error: string; message: string };
    throw new EmailAlreadyInUseApiError(data.message);
  }

  if (!response.ok) {
    throw new Error("Registration failed.");
  }
}
