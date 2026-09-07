import type { Context, Next } from "hono";
import { auth, type AuthSession, type AuthUser } from "./auth";
import { withWorkspaceContext } from "../../utils/workspace-context";

export type ResolvedWebSession = {
  workspaceId: string;
};

export type AuthVariables = {
  session: AuthSession | null;
  user: AuthUser | null;
  webSession: ResolvedWebSession | null;
};

export async function loadAuthSession(c: Context<{ Variables: AuthVariables }>, next: Next) {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  c.set("session", session?.session ?? null);
  c.set("user", session?.user ?? null);
  c.set("webSession", null);

  await next();
}

/**
 * Adds the authenticated user's Workspace, or a Web Session resolved by a
 * Channel Adapter, to the data-layer request context.
 */
export async function loadWorkspaceContext(
  c: Context<{ Variables: AuthVariables }>,
  next: Next,
) {
  const workspaceId = c.get("user")?.workspaceId ?? c.get("webSession")?.workspaceId;

  if (!workspaceId) {
    await next();
    return;
  }

  await withWorkspaceContext(workspaceId, next);
}

export function requireAdmin(c: Context<{ Variables: AuthVariables }>) {
  const user = c.get("user");

  if (user?.role !== "ADMIN") {
    return null;
  }

  return user;
}
