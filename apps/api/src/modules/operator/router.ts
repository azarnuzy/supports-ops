import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { analyticsRangeQuerySchema } from "../analytics/schema";
import { loadOperatorSession, requireOperator } from "./middleware";
import { getModelMargin } from "./services";
import type { OperatorVariables } from "./types";

export const operatorRouter = new Hono<{ Variables: OperatorVariables }>()
  .use("*", loadOperatorSession)
  .use("*", requireOperator)
  .get("/session", (c) => c.json({ operator: c.get("operator") }))
  .get(
    "/margin",
    zValidator("query", analyticsRangeQuerySchema, (result, c) => {
      if (!result.success) return c.json({ error: "invalid_range" }, 400);
    }),
    async (c) => c.json(await getModelMargin(c.req.valid("query"))),
  );
