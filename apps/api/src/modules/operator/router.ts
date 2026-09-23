import { Hono } from "hono";
import { loadOperatorSession, requireOperator } from "./middleware";
import type { OperatorVariables } from "./types";

export const operatorRouter = new Hono<{ Variables: OperatorVariables }>()
  .use("*", loadOperatorSession)
  .use("*", requireOperator)
  .get("/session", (c) => c.json({ operator: c.get("operator") }));
