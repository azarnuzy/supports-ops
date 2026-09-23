import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { analyticsRangeQuerySchema } from "../analytics/schema";
import { loadOperatorSession, requireOperator } from "./middleware";
import { listPayments, paymentQuerySchema } from "./payments";
import { getModelMargin, getOperatorOverview } from "./services";
import type { OperatorVariables } from "./types";

const withRangeQuery = zValidator("query", analyticsRangeQuerySchema, (result, c) => {
  if (!result.success) return c.json({ error: "invalid_range" }, 400);
});

export const operatorRouter = new Hono<{ Variables: OperatorVariables }>()
  .use("*", loadOperatorSession)
  .use("*", requireOperator)
  .get("/session", (c) => c.json({ operator: c.get("operator") }))
  .get("/margin", withRangeQuery, async (c) => c.json(await getModelMargin(c.req.valid("query"))))
  .get(
    "/payments",
    zValidator("query", paymentQuerySchema, (result, c) => {
      if (!result.success) return c.json({ error: "invalid_query" }, 400);
    }),
    async (c) => c.json(await listPayments(c.req.valid("query"))),
  )
  .get(
    "/overview",
    withRangeQuery,
    async (c) => c.json({ overview: await getOperatorOverview(c.req.valid("query")) }),
  );
