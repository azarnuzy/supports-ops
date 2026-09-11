import type { auth } from "./instance";

export type AuthSession = typeof auth.$Infer.Session.session;
export type AuthUser = typeof auth.$Infer.Session.user;

/** A Customer's Session, resolved by a Channel Adapter from whatever that
 * Channel authenticates with. A Customer never signs in, so this is the only
 * Workspace context a Channel request carries. */
export type ResolvedSession = {
  workspaceId: string;
};

export type AuthVariables = {
  authSession: AuthSession | null;
  user: AuthUser | null;
  session: ResolvedSession | null;
};
