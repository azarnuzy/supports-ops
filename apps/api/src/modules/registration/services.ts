import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { grantTrialCredits } from "../credits/services";
import { isUniqueConstraintError, unscopedPrisma } from "../../utils/prisma";
import { findPendingForEmail, resendPendingLink } from "../invitations/services";
import { provisionWorkspaceDefaults } from "../workspaces/services";
import type { RegisterInput } from "./schema";

export class EmailAlreadyInUseError extends Error {
  constructor(readonly unverified = false) {
    super("An account with this email already exists.");
    this.name = "EmailAlreadyInUseError";
  }
}

/** The email has a pending Invitation: no Organization is created; the invitee accepts instead. */
export class InvitationPendingError extends Error {
  constructor(readonly workspaceName: string) {
    super(`You've been invited to ${workspaceName}. We re-sent the invitation link to your email; accept it to join.`);
  }
}

/** `emailVerified: true` is for scripts that create users with no inbox round-trip. */
export async function registerAdminWorkspace(
  input: RegisterInput,
  { emailVerified = false }: { emailVerified?: boolean } = {},
) {
  const existingUser = await unscopedPrisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, emailVerified: true },
  });

  if (existingUser) {
    throw new EmailAlreadyInUseError(!existingUser.emailVerified);
  }

  const pending = await findPendingForEmail(input.email);
  if (pending) {
    await resendPendingLink(pending);
    throw new InvitationPendingError(pending.workspace.name);
  }

  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  try {
    return await unscopedPrisma.$transaction(async (tx) => {
      const { organization, workspace } = await provisionOrganization(tx, input.name);
      const userId = randomUUID();

      const user = await tx.user.create({
        data: {
          id: userId,
          name: input.name,
          email: input.email,
          emailVerified,
          role: "ADMIN",
          organizationId: organization.id,
          isOrganizationAdmin: true,
        },
      });

      await tx.workspaceMembership.create({
        data: { userId, workspaceId: workspace.id, role: "ADMIN" },
      });

      await tx.account.create({
        data: {
          id: randomUUID(),
          accountId: userId,
          providerId: "credential",
          userId,
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        },
      });

      return { organization, user, workspace };
    });
  } catch (error) {
    if (isUniqueConstraintError(error, "email")) {
      throw new EmailAlreadyInUseError();
    }

    throw error;
  }
}

type Tx = Parameters<Parameters<typeof unscopedPrisma.$transaction>[0]>[0];

/** The Organization, first Workspace and Trial Grant every new Admin starts with. Shared by form and Google registration. */
export async function provisionOrganization(tx: Tx, adminName: string) {
  const organization = await tx.organization.create({
    data: { id: randomUUID(), name: `${adminName}'s Organization` },
  });
  const workspace = await tx.workspace.create({
    data: {
      id: randomUUID(),
      organizationId: organization.id,
      name: workspaceNameFor(adminName),
      slug: workspaceSlugFor(adminName),
    },
  });

  await provisionWorkspaceDefaults(tx, workspace.id);
  await grantTrialCredits(tx, organization.id, workspace.id);

  return { organization, workspace };
}

function workspaceNameFor(adminName: string) {
  return `${adminName}'s Workspace`;
}

function workspaceSlugFor(adminName: string) {
  const base = adminName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = randomBytes(4).toString("hex");

  return `${base || "workspace"}-${suffix}`;
}
