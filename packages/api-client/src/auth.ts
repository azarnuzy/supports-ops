import type { ApiClient } from "./client";

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

/** The email is registered but never verified; the user can ask for a new link. */
export class EmailUnverifiedApiError extends EmailAlreadyInUseApiError {
  constructor(message: string) {
    super(message);
    this.name = "EmailUnverifiedApiError";
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
    throw data.error === "email_unverified"
      ? new EmailUnverifiedApiError(data.message)
      : new EmailAlreadyInUseApiError(data.message);
  }

  if (!response.ok) {
    throw new Error("Registration failed.");
  }
}

export async function fetchAuthProviders(client: ApiClient) {
  const response = await client["auth-providers"].$get();

  if (!response.ok) {
    throw new Error("Failed to load sign-in options.");
  }

  return response.json();
}

/** For a Google-only user; rejects once a password already exists. */
export async function setCurrentUserPassword(client: ApiClient, newPassword: string) {
  const response = await client.profile.password.$post({ json: { newPassword } });

  if (!response.ok) {
    throw new Error("Could not set the password.");
  }
}
