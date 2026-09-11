import type { Context, Next } from "hono";
import { auth } from "./instance";
import type { AuthVariables } from "./types";
import { withWorkspaceContext } from "../../utils/workspace-context";

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
 * Adapter, to the data-layer request context.
 */
export async function loadWorkspaceContext(c: Context<{ Variables: AuthVariables }>, next: Next) {
  const workspaceId = c.get("user")?.workspaceId ?? c.get("session")?.workspaceId;

  if (!workspaceId) {
    await next();
    return;
  }

  await withWorkspaceContext(workspaceId, next);
}
