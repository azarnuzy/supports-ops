import type { Context, Next } from "hono";
import { operatorAuth } from "../auth/instance";
import type { OperatorVariables } from "./types";

export async function loadOperatorSession(
  c: Context<{ Variables: OperatorVariables }>,
  next: Next,
) {
  const session = await operatorAuth.api.getSession({ headers: c.req.raw.headers });
  c.set("operatorSession", session?.session ?? null);
  c.set("operator", session?.user ?? null);
  await next();
}

export async function requireOperator(c: Context<{ Variables: OperatorVariables }>, next: Next) {
  if (!c.get("operator") || c.get("operator")?.disabledAt) {
    return c.json({ error: "unauthorized" }, 401);
  }

  await next();
}
