/**
 * Centralized so a query and its invalidations can't drift apart (e.g.
 * workspace users being invalidated with a key that no longer matches the
 * one the list query was registered under).
 */
export const queryKeys = {
  auth: {
    all: ["auth"] as const,
    me: ["auth", "me"] as const,
  },
  workspace: {
    users: ["workspace", "users"] as const,
  },
} as const;
