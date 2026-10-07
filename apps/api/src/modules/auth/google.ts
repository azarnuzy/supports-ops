import { unscopedPrisma } from "../../utils/prisma";
import { provisionOrganization } from "../registration/services";

/**
 * Better Auth's only path to creating a User is Google sign-in (form sign-up is
 * disabled), and it knows nothing about Organizations. `before` gives the new
 * User the same start as form registration; `after` adds the Workspace
 * membership once the User row exists. If that fails the User is removed, so
 * no User outlives a failed provisioning.
 */
export const googleUserHooks = {
  before: async (
    user: { id?: string; name?: string | null; email: string } & Record<string, unknown>,
  ) => {
    if (user.organizationId) return;

    const name = user.name?.trim() || user.email.split("@")[0] || "New user";
    const id = user.id ?? crypto.randomUUID();
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
