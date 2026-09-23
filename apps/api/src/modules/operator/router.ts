import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { analyticsRangeQuerySchema } from "../analytics/schema";
import { loadOperatorSession, requireOperator } from "./middleware";
import { getModelMargin, getOperatorOverview } from "./services";
import type { OperatorVariables } from "./types";
import { getWorkspaceDetail, listWorkspaces } from "./workspaces";

const listQuery = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const withRangeQuery = zValidator("query", analyticsRangeQuerySchema, (result, c) => {
  if (!result.success) return c.json({ error: "invalid_range" }, 400);
});

export const operatorRouter = new Hono<{ Variables: OperatorVariables }>()
  .use("*", loadOperatorSession)
  .use("*", requireOperator)
  .get("/session", (c) => c.json({ operator: c.get("operator") }))
  .get("/margin", withRangeQuery, async (c) => c.json(await getModelMargin(c.req.valid("query"))))
  .get(
    "/overview",
    withRangeQuery,
    async (c) => c.json({ overview: await getOperatorOverview(c.req.valid("query")) }),
  )
  .get("/workspaces", zValidator("query", listQuery), async (c) =>
    c.json(await listWorkspaces(c.req.valid("query"))),
  )
  .get(
    "/workspaces/:id",
    withRangeQuery,
    async (c) => {
      const detail = await getWorkspaceDetail(c.req.param("id"), c.req.valid("query"));
      return detail ? c.json(detail) : c.json({ error: "not_found" }, 404);
    },
  );
