import type { Context, Next } from "hono";
import { auth } from "./instance";
import type { AuthVariables } from "./types";
import { withWorkspaceContext } from "../../utils/workspace-context";
import { unscopedPrisma } from "../../utils/prisma";

export async function loadAuthSession(c: Context<{ Variables: AuthVariables }>, next: Next) {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  c.set("authSession", session?.session ?? null);
  c.set("user", session?.user ?? null);
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
  const homeWorkspaceId = user?.workspaceId ?? c.get("session")?.workspaceId;
  const requestedWorkspaceId =
    c.req?.header?.("x-workspace-id") ??
    (c.req?.path?.endsWith("/events") ? c.req.query("workspaceId") : undefined);

  if (!requestedWorkspaceId || requestedWorkspaceId === homeWorkspaceId) {
    if (!homeWorkspaceId) {
      await next();
      return;
    }

    await withWorkspaceContext(homeWorkspaceId, next);
    return;
  }

  if (!user?.isOrganizationAdmin || !user.organizationId) {
    return c.json({ error: "forbidden" }, 403);
  }

  const requestedWorkspace = await unscopedPrisma.workspace.findUnique({
    where: { id: requestedWorkspaceId },
    select: { deletedAt: true, organizationId: true },
  });

  if (
    !requestedWorkspace ||
    requestedWorkspace.deletedAt ||
    requestedWorkspace.organizationId !== user.organizationId
  ) {
    return c.json({ error: "forbidden" }, 403);
  }

  c.set("user", { ...user, role: "ADMIN", workspaceId: requestedWorkspaceId });
  await withWorkspaceContext(requestedWorkspaceId, next);
}
