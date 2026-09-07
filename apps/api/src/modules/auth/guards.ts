import type { Context } from "hono";
import type { AuthVariables } from "./types";

export function requireAdmin(c: Context<{ Variables: AuthVariables }>) {
  const user = c.get("user");

  if (user?.role !== "ADMIN") {
    return null;
  }

  return user;
}
