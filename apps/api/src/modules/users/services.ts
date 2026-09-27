import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { isUniqueConstraintError, unscopedPrisma, type Role } from "../../utils/prisma";
import type { CreateHumanAgentInput } from "./schema";

export class HumanAgentEmailAlreadyInUseError extends Error {
  constructor() { super("This email belongs to another Organization."); }
}
export class MembershipConflictError extends Error {
  constructor(message = "Workspace membership already exists.") { super(message); }
}
export class LastOrganizationAdminError extends Error {
  constructor() { super("The final Organization Admin cannot be removed."); }
}
export class InvalidUsersCursorError extends Error {}

export async function listRecentUsers({ cursor, limit = 20 }: { cursor?: string; limit?: number } = {}, workspaceId: string) {
  if (cursor && !(await unscopedPrisma.workspaceMembership.findUnique({
    where: { userId_workspaceId: { userId: cursor, workspaceId } }, select: { userId: true },
  }))) throw new InvalidUsersCursorError();
  const memberships = await unscopedPrisma.workspaceMembership.findMany({
    where: { workspaceId, user: { deletedAt: null } },
    include: { user: true },
    orderBy: [{ createdAt: "desc" }, { userId: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { userId_workspaceId: { userId: cursor, workspaceId } }, skip: 1 } : {}),
  });
  return {
    nextCursor: memberships.length > limit ? memberships[limit - 1]?.userId ?? null : null,
    users: memberships.slice(0, limit).map(({ user, role, createdAt }) => ({
      id: user.id, email: user.email, name: user.name, role, isOrganizationAdmin: user.isOrganizationAdmin,
      createdAt, updatedAt: user.updatedAt,
    })),
  };
}

export async function createHumanAgent(workspaceId: string, input: Omit<CreateHumanAgentInput, "role"> & { role?: Role }) {
  const role = input.role ?? "HUMAN_AGENT";
  const workspace = await unscopedPrisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId }, select: { organizationId: true },
  });
  const existing = await unscopedPrisma.user.findUnique({ where: { email: input.email } });
  if (existing && existing.organizationId !== workspace.organizationId)
    throw new HumanAgentEmailAlreadyInUseError();
  if (existing) {
    try {
      await unscopedPrisma.workspaceMembership.create({
        data: { userId: existing.id, workspaceId, role },
      });
    } catch (error) {
      if (isUniqueConstraintError(error, "userId")) throw new MembershipConflictError();
      throw error;
    }
    return { user: { ...existing, role } };
  }
  const passwordHash = await hashPassword(input.password);
  const userId = randomUUID();
  try {
    const user = await unscopedPrisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { id: userId, email: input.email, name: input.name,
          role, organizationId: workspace.organizationId },
      });
      await tx.workspaceMembership.create({ data: { userId, workspaceId, role } });
      await tx.account.create({ data: { id: randomUUID(), accountId: userId,
        providerId: "credential", password: passwordHash, userId } });
      return created;
    });
    return { user };
  } catch (error) {
    if (isUniqueConstraintError(error, "email")) throw new HumanAgentEmailAlreadyInUseError();
    throw error;
  }
}

export async function updateMembership(workspaceId: string, userId: string, role: Role) {
  const membership = await unscopedPrisma.workspaceMembership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    include: { user: true },
  });
  if (!membership) throw new MembershipConflictError("Membership not found.");
  return unscopedPrisma.workspaceMembership.update({
    where: { userId_workspaceId: { userId, workspaceId } }, data: { role },
  });
}

export async function removeMembership(workspaceId: string, userId: string) {
  return unscopedPrisma.$transaction(async (tx) => {
    const membership = await tx.workspaceMembership.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } }, include: { user: true },
    });
    if (!membership) throw new MembershipConflictError("Membership not found.");
    if (await tx.ticket.count({ where: { assignedHumanAgentId: userId, workspaceId, status: "HUMAN_HANDLING" } }))
      throw new MembershipConflictError("Reassign this user's active Tickets before removing access.");
    if (membership.user.isOrganizationAdmin) {
      const count = await tx.user.count({
        where: { organizationId: membership.user.organizationId, isOrganizationAdmin: true, deletedAt: null },
      });
      if (count === 1 && !(await tx.workspaceMembership.count({ where: { userId, workspaceId: { not: workspaceId } } })))
        throw new LastOrganizationAdminError();
    }
    await tx.workspaceMembership.delete({ where: { userId_workspaceId: { userId, workspaceId } } });
  });
}

export async function setOrganizationAdmin(organizationId: string, userId: string, enabled: boolean) {
  return unscopedPrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
    const user = await tx.user.findFirst({ where: { id: userId, organizationId, deletedAt: null } });
    if (!user) throw new MembershipConflictError("User not found in this Organization.");
    if (!enabled && user.isOrganizationAdmin &&
      (await tx.user.count({ where: { organizationId, isOrganizationAdmin: true, deletedAt: null } })) <= 1)
      throw new LastOrganizationAdminError();
    return tx.user.update({ where: { id: userId }, data: { isOrganizationAdmin: enabled } });
  });
}
