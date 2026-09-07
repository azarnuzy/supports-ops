import type { auth } from "./instance";

export type AuthSession = typeof auth.$Infer.Session.session;
export type AuthUser = typeof auth.$Infer.Session.user;

export type ResolvedWebSession = {
  workspaceId: string;
};

export type AuthVariables = {
  session: AuthSession | null;
  user: AuthUser | null;
  webSession: ResolvedWebSession | null;
};
