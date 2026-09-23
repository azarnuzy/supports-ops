import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { loadOperatorSession, requireOperator } from "./middleware";
import { listPayments, paymentQuerySchema } from "./payments";
import type { OperatorVariables } from "./types";

export const operatorRouter = new Hono<{ Variables: OperatorVariables }>()
  .use("*", loadOperatorSession)
  .use("*", requireOperator)
  .get("/session", (c) => c.json({ operator: c.get("operator") }))
  .get(
    "/payments",
    zValidator("query", paymentQuerySchema, (result, c) => {
      if (!result.success) return c.json({ error: "invalid_query" }, 400);
    }),
    async (c) => c.json(await listPayments(c.req.valid("query"))),
  );
