import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { betterAuthConfig } from "../../config";
import { isUniqueConstraintError, unscopedPrisma, type Role } from "../../utils/prisma";
import { enqueueAccountEmail } from "../auth/account-email";

export const invitationTtlMs = 7 * 24 * 60 * 60 * 1000;

export class InvitationEmailInOtherOrganizationError extends Error {
  constructor() {
    super("This email belongs to another Organization.");
  }
}
export class InvitationConflictError extends Error {}
export class InvitationNotFoundError extends Error {}
/** Expired, revoked, or already accepted: the link no longer works. */
export class InvitationUnavailableError extends Error {
  constructor() {
    super("Ask your Admin to resend the Invitation.");
  }
}
export class InvitationForbiddenError extends Error {}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const platformUrl = (path: string) => new URL(path, betterAuthConfig.trustedOrigins[0]).toString();
const roleLabel = (role: Role) => (role === "ADMIN" ? "Admin" : "Human Agent");

type Inviter = { id: string; name: string; organizationId: string; isOrganizationAdmin: boolean };

/** Rotates the token and expiry. The old link stops working. */
async function rotateToken(invitation: { id: string; workspaceId: string }) {
  const token = randomBytes(32).toString("base64url");
  const [updated, workspace] = await Promise.all([
    unscopedPrisma.invitation.update({
      where: { id: invitation.id },
      data: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + invitationTtlMs) },
    }),
    unscopedPrisma.workspace.findUniqueOrThrow({
      where: { id: invitation.workspaceId },
      select: { name: true },
    }),
  ]);
  return { token, updated, workspace };
}

/** Rotates the token and expiry, then emails the link. Resend and re-invite both land here. */
async function issueLink(
  invitation: { id: string; email: string; role: Role; workspaceId: string },
  inviterName: string,
) {
  const { token, updated, workspace } = await rotateToken(invitation);
  const link = platformUrl(`/accept-invitation?token=${token}`);
  await enqueueAccountEmail({
    to: invitation.email,
    subject: `${inviterName} invited you to ${workspace.name} on SupportOps`,
    text: `${inviterName} invited you to join ${workspace.name} as ${roleLabel(invitation.role)}: ${link}\n\nThis link is valid for 7 days.`,
    html: `<p>${escapeHtml(inviterName)} invited you to join ${escapeHtml(workspace.name)} as ${roleLabel(invitation.role)}.</p><p><a href="${link}">Accept the Invitation</a></p><p>This link is valid for 7 days.</p>`,
  });
  return updated;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

export async function inviteToWorkspace(
  inviter: Inviter,
  currentWorkspaceId: string,
  input: { email: string; role: Role; workspaceId?: string },
) {
  const workspaceId = input.workspaceId ?? currentWorkspaceId;
  const workspace = await unscopedPrisma.workspace.findFirst({
    where: { id: workspaceId, deletedAt: null, organizationId: inviter.organizationId },
    select: { id: true, name: true },
  });
  // An Admin invites only into the current Workspace; an Organization Admin into any of the Organization.
  if (!workspace || (workspaceId !== currentWorkspaceId && !inviter.isOrganizationAdmin))
    throw new InvitationForbiddenError();

  const existing = await unscopedPrisma.user.findUnique({ where: { email: input.email } });
  if (existing && existing.organizationId !== inviter.organizationId)
    throw new InvitationEmailInOtherOrganizationError();

  if (existing && !existing.deletedAt) {
    try {
      await unscopedPrisma.workspaceMembership.create({
        data: { userId: existing.id, workspaceId, role: input.role },
      });
    } catch (error) {
      if (isUniqueConstraintError(error, "userId"))
        throw new InvitationConflictError("This user is already a member of the Workspace.");
      throw error;
    }
    await enqueueAccountEmail({
      to: existing.email,
      subject: `You were added to ${workspace.name} on SupportOps`,
      text: `${inviter.name} added you to ${workspace.name} as ${roleLabel(input.role)}. Sign in to SupportOps and switch to the Workspace: ${platformUrl("/login")}`,
    });
    return { status: "added" as const };
  }

  // One pending Invitation per email and Workspace: inviting again renews it.
  const pending = await unscopedPrisma.invitation.findFirst({
    where: { email: input.email, workspaceId, acceptedAt: null, revokedAt: null },
  });
  try {
    const invitation = pending
      ? await unscopedPrisma.invitation.update({
          where: { id: pending.id },
          data: { role: input.role, invitedById: inviter.id },
        })
      : await unscopedPrisma.invitation.create({
          data: {
            id: randomUUID(),
            email: input.email,
            workspaceId,
            role: input.role,
            invitedById: inviter.id,
            tokenHash: hashToken(randomUUID()),
            expiresAt: new Date(),
          },
        });
    await issueLink(invitation, inviter.name);
    return { status: "invited" as const, invitationId: invitation.id };
  } catch (error) {
    if (isUniqueConstraintError(error, "email"))
      throw new InvitationConflictError("An Invitation for this email is already pending.");
    throw error;
  }
}

export async function listPendingInvitations(workspaceId: string) {
  const invitations = await unscopedPrisma.invitation.findMany({
    where: { workspaceId, acceptedAt: null, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      createdAt: true,
      invitedBy: { select: { name: true } },
    },
  });
  return {
    invitations: invitations.map(({ invitedBy, ...invitation }) => ({
      ...invitation,
      invitedByName: invitedBy.name,
    })),
  };
}

async function findPending(workspaceId: string, id: string) {
  const invitation = await unscopedPrisma.invitation.findFirst({
    where: { id, workspaceId, acceptedAt: null, revokedAt: null },
  });
  if (!invitation) throw new InvitationNotFoundError();
  return invitation;
}

export async function resendInvitation(workspaceId: string, id: string, inviterName: string) {
  await issueLink(await findPending(workspaceId, id), inviterName);
}

export async function revokeInvitation(workspaceId: string, id: string) {
  const { id: pendingId } = await findPending(workspaceId, id);
  await unscopedPrisma.invitation.update({
    where: { id: pendingId },
    data: { revokedAt: new Date() },
  });
}

/** The pending Invitation for an email, if any. A user cannot move Organizations, so it must be accepted before registering. */
export async function findPendingForEmail(email: string) {
  return unscopedPrisma.invitation.findFirst({
    where: { email, acceptedAt: null, revokedAt: null, workspace: { deletedAt: null } },
    include: { workspace: { select: { name: true } }, invitedBy: { select: { name: true } } },
  });
}

/** Fresh token for an invitee whose email Google just verified; nothing is emailed. */
export async function issueTokenForVerifiedEmail(invitation: { id: string; workspaceId: string }) {
  return (await rotateToken(invitation)).token;
}

/** Re-sends the link to the invited inbox only; the registrant's email is unverified, so no token is returned. */
export async function resendPendingLink(
  invitation: NonNullable<Awaited<ReturnType<typeof findPendingForEmail>>>,
) {
  await issueLink(invitation, invitation.invitedBy.name);
}

export async function loadUsable(token: string) {
  const invitation = await unscopedPrisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      workspace: { select: { name: true, organizationId: true, deletedAt: true } },
      invitedBy: { select: { name: true } },
    },
  });
  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.revokedAt ||
    invitation.expiresAt <= new Date() ||
    invitation.workspace.deletedAt
  )
    throw new InvitationUnavailableError();
  return invitation;
}

export async function describeInvitation(token: string) {
  const invitation = await loadUsable(token);
  return {
    email: invitation.email,
    role: invitation.role,
    workspaceName: invitation.workspace.name,
    invitedByName: invitation.invitedBy.name,
  };
}

/** Creates or reactivates the user, adds the membership, and marks the email verified. */
export async function acceptInvitation(token: string, input: { name: string; password: string }) {
  const invitation = await loadUsable(token);
  const { organizationId } = invitation.workspace;
  const passwordHash = await hashPassword(input.password);

  await unscopedPrisma.$transaction(async (tx) => {
    // Only one accept can win; this also guards a concurrent revoke or resend.
    const claimed = await tx.invitation.updateMany({
      where: {
        id: invitation.id,
        tokenHash: invitation.tokenHash,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { acceptedAt: new Date() },
    });
    if (claimed.count === 0) throw new InvitationUnavailableError();

    const existing = await tx.user.findUnique({ where: { email: invitation.email } });
    if (existing && existing.organizationId !== organizationId)
      throw new InvitationEmailInOtherOrganizationError();
    if (existing && !existing.deletedAt)
      throw new InvitationConflictError("This email already has an account. Sign in instead.");

    const userId = existing?.id ?? randomUUID();
    if (existing) {
      // Reactivation: nothing of the old access or credential survives.
      await tx.user.update({
        where: { id: existing.id },
        data: {
          deletedAt: null,
          name: input.name,
          role: invitation.role,
          isOrganizationAdmin: false,
          emailVerified: true,
        },
      });
      await tx.workspaceMembership.deleteMany({ where: { userId: existing.id } });
      await tx.authSession.deleteMany({ where: { userId: existing.id } });
      await tx.account.deleteMany({ where: { userId: existing.id } });
    } else {
      await tx.user.create({
        data: {
          id: userId,
          email: invitation.email,
          name: input.name,
          role: invitation.role,
          organizationId,
          emailVerified: true,
        },
      });
    }
    await tx.workspaceMembership.create({
      data: { userId, workspaceId: invitation.workspaceId, role: invitation.role },
    });
    await tx.account.create({
      data: {
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: passwordHash,
      },
    });
  });

  return { email: invitation.email };
}

/** Joins the Google-created user to the Workspace; the User row already exists with the Organization. */
export async function acceptInvitationForUser(token: string, userId: string) {
  const invitation = await loadUsable(token);
  await unscopedPrisma.$transaction(async (tx) => {
    const claimed = await tx.invitation.updateMany({
      where: { id: invitation.id, tokenHash: invitation.tokenHash, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: new Date() },
    });
    if (claimed.count === 0) throw new InvitationUnavailableError();
    await tx.workspaceMembership.create({
      data: { userId, workspaceId: invitation.workspaceId, role: invitation.role },
    });
  });
}
