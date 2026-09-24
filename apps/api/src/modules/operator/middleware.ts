import type { Context, Next } from "hono";
import { operatorAuth } from "../auth/instance";
import type { Operator, OperatorVariables } from "./types";

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

/** Only call from handlers mounted behind requireOperator, where the operator is guaranteed set. */
export function currentOperator(c: Context<{ Variables: OperatorVariables }>): Operator {
  const operator = c.get("operator");
  if (!operator) throw new Error("currentOperator called without requireOperator middleware");
  return operator;
}
