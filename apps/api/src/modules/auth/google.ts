import { APIError, getOAuthState } from "better-auth/api";
import { unscopedPrisma } from "../../utils/prisma";
import {
  acceptInvitationForUser,
  findPendingForEmail,
  issueTokenForVerifiedEmail,
  loadUsable,
} from "../invitations/services";
import { provisionOrganization } from "../registration/services";

/** Set by the Invitation page's "Continue with Google" via `additionalData`. */
const invitationTokenFromState = async () => {
  const token = (await getOAuthState())?.invitationToken;
  return typeof token === "string" ? token : undefined;
};

/** Better Auth puts `message` in the redirect's `?error=`, so it is a machine code: `<code>:<detail>`. */
const refuse = (code: string, detail = "") =>
  new APIError("BAD_REQUEST", { message: `${code}:${detail}` });

/**
 * Better Auth's only path to creating a User is Google sign-in (form sign-up is
 * disabled), and it knows nothing about Organizations. `before` gives the new
 * User the same start as form registration; `after` adds the Workspace
 * membership once the User row exists. If that fails the User is removed, so
 * no User outlives a failed provisioning.
 */
export const googleUserHooks = {
  before: async (
    user: {
      id?: string;
      name?: string | null;
      email: string;
      emailVerified?: boolean;
    } & Record<string, unknown>,
  ) => {
    if (user.organizationId) return;

    const name = user.name?.trim() || user.email.split("@")[0] || "New user";
    const id = user.id ?? crypto.randomUUID();
    const email = user.email.toLowerCase();

    const token = await invitationTokenFromState();
    if (token) {
      const invitation = await loadUsable(token).catch(() => {
        throw refuse("invitation_unavailable");
      });
      if (invitation.email !== email)
        throw refuse("invitation_email_mismatch", invitation.email);
      return {
        data: {
          id,
          name,
          emailVerified: true,
          organizationId: invitation.workspace.organizationId,
          role: invitation.role,
          isOrganizationAdmin: false,
        },
      };
    }

    // Registering with an invited email creates no Organization: the error
    // redirect carries a fresh token as the detail (Google verified the inbox) to the accept flow.
    const pending = await findPendingForEmail(email);
    if (pending)
      throw refuse(
        "invitation_pending",
        user.emailVerified ? await issueTokenForVerifiedEmail(pending) : "",
      );
    const { organization } = await unscopedPrisma.$transaction((tx) =>
      provisionOrganization(tx, name),
    );

    return {
      data: {
        id,
        name,
        emailVerified: true,
        organizationId: organization.id,
      },
    };
  },
  after: async (created: { id: string } & Record<string, unknown>) => {
    const user = created as { id: string; organizationId: string };

    try {
      const token = await invitationTokenFromState();
      if (token) return await acceptInvitationForUser(token, user.id);

      const workspace = await unscopedPrisma.workspace.findFirstOrThrow({
        where: { organizationId: user.organizationId },
        select: { id: true },
      });
      await unscopedPrisma.workspaceMembership.upsert({
        where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
        create: { userId: user.id, workspaceId: workspace.id, role: "ADMIN" },
        update: {},
      });
    } catch (error) {
      await unscopedPrisma.user.delete({ where: { id: user.id } });
      throw error;
    }
  },
};
