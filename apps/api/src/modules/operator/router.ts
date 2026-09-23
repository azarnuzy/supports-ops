import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { unscopedPrisma } from "../../utils/prisma";
import { analyticsRangeQuerySchema } from "../analytics/schema";
import { loadOperatorSession, requireOperator } from "./middleware";
import { listPayments, paymentQuerySchema } from "./payments";
import { getModelMargin, getOperatorOverview, topUpWorkspace } from "./services";
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

const topUpSchema = z.object({ credits: z.number().int().positive(), note: z.string().trim().min(1) });

export const operatorRouter = new Hono<{ Variables: OperatorVariables }>()
  .use("*", loadOperatorSession)
  .use("*", requireOperator)
  .get("/session", (c) => c.json({ operator: c.get("operator") }))
  .post("/workspaces/:workspaceId/top-ups", zValidator("json", topUpSchema, (result, c) => {
    if (!result.success) return c.json({ error: "invalid_top_up" }, 400);
  }), async (c) => {
    const { credits, note } = c.req.valid("json");
    const result = await topUpWorkspace(c.get("operator")!.id, c.req.param("workspaceId"), credits, note);
    if (!result) return c.json({ error: "workspace_not_found" }, 404);
    return c.json(result, 201);
  })
  .get("/actions", zValidator("query", z.object({ workspaceId: z.string().min(1).optional() })), async (c) => {
    const { workspaceId } = c.req.valid("query");
    const actions = await unscopedPrisma.operatorAction.findMany({
      where: workspaceId ? { workspaceId } : undefined,
      include: { operator: { select: { id: true, name: true, email: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    return c.json({ actions });
  })
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
