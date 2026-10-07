import type { ApiClient } from "./client";

export type Role = "ADMIN" | "HUMAN_AGENT";

export type PendingInvitation = {
  createdAt: string;
  email: string;
  expiresAt: string;
  id: string;
  invitedByName: string;
  role: Role;
};

export type InvitationPreview = {
  email: string;
  invitedByName: string;
  role: Role;
  workspaceName: string;
};

/** The link is expired, revoked, or already used. */
export class InvitationUnavailableApiError extends Error {
  constructor() {
    super("Ask your Admin to resend the Invitation.");
    this.name = "InvitationUnavailableApiError";
  }
}

async function failure(response: Response, fallback: string) {
  if (response.status === 403) return new Error("You do not have permission to invite users.");
  if (response.status === 409 || response.status === 404) {
    const data = (await response.json().catch(() => null)) as { message?: string } | null;
    return new Error(data?.message ?? fallback);
  }
  return new Error(fallback);
}

export async function listPendingInvitations(client: ApiClient) {
  const response = await client.invitations.$get();
  if (!response.ok) throw await failure(response, "Failed to load Invitations.");
  return (await response.json()) as { invitations: PendingInvitation[] };
}

export async function inviteUser(client: ApiClient, input: { email: string; role: Role }) {
  const response = await client.invitations.$post({ json: input });
  if (!response.ok) throw await failure(response, "Failed to send the Invitation.");
  return (await response.json()) as { status: "added" | "invited" };
}

export async function resendInvitation(client: ApiClient, id: string) {
  const response = await client.invitations[":id"].resend.$post({ param: { id } });
  if (!response.ok) throw await failure(response, "Failed to resend the Invitation.");
}

export async function revokeInvitation(client: ApiClient, id: string) {
  const response = await client.invitations[":id"].$delete({ param: { id } });
  if (!response.ok) throw await failure(response, "Failed to revoke the Invitation.");
}

export async function fetchInvitation(client: ApiClient, token: string) {
  const response = await client.invitations["by-token"][":token"].$get({ param: { token } });
  if (response.status === 410) throw new InvitationUnavailableApiError();
  if (!response.ok) throw new Error("Failed to load the Invitation.");
  return (await response.json()) as InvitationPreview;
}

export async function acceptInvitation(
  client: ApiClient,
  token: string,
  input: { name: string; password: string },
) {
  const response = await client.invitations["by-token"][":token"].accept.$post({
    param: { token },
    json: input,
  });
  if (response.status === 410) throw new InvitationUnavailableApiError();
  if (!response.ok) throw await failure(response, "Failed to accept the Invitation.");
}
