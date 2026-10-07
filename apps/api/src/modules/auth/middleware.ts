import type { Context, Next } from "hono";
import { auth } from "./instance";
import type { AuthVariables } from "./types";
import { withWorkspaceContext } from "../../utils/workspace-context";
import { unscopedPrisma } from "../../utils/prisma";

export async function loadAuthSession(c: Context<{ Variables: AuthVariables }>, next: Next) {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  const storedUser = session?.user
    ? await unscopedPrisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          deletedAt: true,
          isOrganizationAdmin: true,
          organizationId: true,
          // The signed cookie cache can outlive a revoked session (e.g. after a
          // password change), so confirm the session row still exists.
          authSessions: { where: { id: session.session.id }, select: { id: true } },
        },
      })
    : null;
  c.set("authSession", storedUser?.authSessions.length ? (session?.session ?? null) : null);
  c.set(
    "user",
    storedUser?.authSessions.length && !storedUser.deletedAt && session?.user
      ? {
          ...session.user,
          isOrganizationAdmin: storedUser.isOrganizationAdmin,
          organizationId: storedUser.organizationId,
        }
      : null,
  );
  c.set("session", null);

  await next();
}

/**
 * Adds the authenticated user's Workspace, or a Session resolved by a Channel
 * Adapter, to the data-layer request context. An Organization Admin may ask
 * for a sibling Workspace instead via the `X-Workspace-Id` header — the
 * client-side Workspace switcher (#270) — which is honored only after
 * confirming it belongs to that Admin's own Organization; anything else
 * (a guessed id, a non-Admin, a cross-Organization target) is rejected here,
 * before any Workspace-scoped data access.
 */
export async function loadWorkspaceContext(c: Context<{ Variables: AuthVariables }>, next: Next) {
  const user = c.get("user");
  const homeWorkspaceId = user
    ? ((
        await unscopedPrisma.workspaceMembership.findFirst({
          where: { userId: user.id, workspace: { deletedAt: null } },
          orderBy: { createdAt: "asc" },
          select: { workspaceId: true },
        })
      )?.workspaceId ??
      (user.isOrganizationAdmin
        ? (
            await unscopedPrisma.workspace.findFirst({
              where: { organizationId: user.organizationId, deletedAt: null },
              orderBy: { createdAt: "asc" },
              select: { id: true },
            })
          )?.id
        : undefined))
    : c.get("session")?.workspaceId;
  const requestedWorkspaceId =
    c.req?.header?.("x-workspace-id") ??
    (c.req?.path?.endsWith("/events") ? c.req.query("workspaceId") : undefined);
  const workspaceId = requestedWorkspaceId ?? homeWorkspaceId;
  if (!workspaceId) return next();

  if (user) {
    const workspace = await unscopedPrisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { deletedAt: true, organizationId: true },
    });
    if (!workspace || workspace.deletedAt || workspace.organizationId !== user.organizationId)
      return c.json({ error: "forbidden" }, 403);

    const membership = await unscopedPrisma.workspaceMembership.findUnique({
      where: { userId_workspaceId: { userId: user.id, workspaceId } },
      select: { role: true },
    });
    const role = user.isOrganizationAdmin ? "ADMIN" : membership?.role;
    if (!role) return c.json({ error: "forbidden" }, 403);
    c.set("user", {
      ...user,
      workspaceId,
      role,
    });
  }

  await withWorkspaceContext(workspaceId, next);
}
