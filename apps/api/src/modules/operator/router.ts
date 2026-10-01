import { zValidator } from "@hono/zod-validator";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { unscopedPrisma } from "../../utils/prisma";
import { analyticsRangeQuerySchema } from "../analytics/schema";
import { listAtRiskWorkspaces } from "./at-risk";
import {
  creditQuerySchema,
  getBillingOverview,
  listCreditOperations,
  listUnlimitedPeriods,
  periodQuerySchema,
} from "./billing";
import { currentOperator, loadOperatorSession, requireOperator } from "./middleware";
import { getOrganizationDetail, listOrganizations, topUpOrganization } from "./organizations";
import { listPayments, paymentQuerySchema } from "./payments";
import {
  getModelMargin,
  getOperatorOverview,
  getPlatformAnalyticsTrends,
  topUpWorkspace,
} from "./services";
import type { OperatorVariables } from "./types";
import {
  extendUnlimitedPeriod,
  grantUnlimitedPeriod,
  NoActiveUnlimitedPeriodError,
  OverlappingUnlimitedPeriodError,
  WorkspaceNotFoundError,
  endUnlimitedPeriodEarly,
} from "./unlimited-periods";
import { getWorkspaceDetail, listWorkspaces } from "./workspaces";

const listQuery = analyticsRangeQuerySchema.safeExtend({
  search: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z
    .enum([
      "createdAt",
      "name",
      "userCount",
      "balance",
      "unlimitedEndAt",
      "lastCustomerActivityAt",
      "sessionCount",
      "creditsUsed",
    ])
    .default("lastCustomerActivityAt"),
  sortDirection: z.enum(["asc", "desc"]).optional(),
  status: z.enum(["HEALTHY", "NEEDS_ATTENTION"]).optional(),
  channel: z.enum(["WEB", "WHATSAPP"]).optional(),
  attention: z
    .enum(["CREDIT_EXHAUSTED", "LOW_BALANCE", "UNLIMITED_ENDING_SOON", "INACTIVE"])
    .optional(),
});

const withRangeQuery = zValidator("query", analyticsRangeQuerySchema, (result, c) => {
  if (!result.success) return c.json({ error: "invalid_range" }, 400);
});

const topUpSchema = z.object({
  credits: z.number().int().positive(),
  note: z.string().trim().min(1),
});
const unlimitedPeriodSchema = z.object({ endDate: z.iso.date().nullable() });

async function organizationForWorkspace(workspaceId: string) {
  const workspace = await unscopedPrisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { organizationId: true },
  });
  return workspace?.organizationId ?? workspaceId;
}

function unlimitedPeriodError(c: Context<{ Variables: OperatorVariables }>, error: unknown) {
  if (error instanceof WorkspaceNotFoundError)
    return c.json({ error: "organization_not_found" }, 404);
  if (error instanceof OverlappingUnlimitedPeriodError)
    return c.json({ error: "overlapping_unlimited_period" }, 409);
  if (error instanceof NoActiveUnlimitedPeriodError)
    return c.json({ error: "no_active_unlimited_period" }, 404);
  throw error;
}

export const operatorRouter = new Hono<{ Variables: OperatorVariables }>()
  .use("*", loadOperatorSession)
  .use("*", requireOperator)
  .get("/session", (c) => c.json({ operator: c.get("operator") }))
  .get(
    "/organizations",
    zValidator("query", z.object({ search: z.string().trim().optional() })),
    async (c) => c.json({ organizations: await listOrganizations(c.req.valid("query").search) }),
  )
  .get("/organizations/:id", async (c) => {
    const detail = await getOrganizationDetail(c.req.param("id"));
    return detail ? c.json(detail) : c.json({ error: "not_found" }, 404);
  })
  .post(
    "/organizations/:id/top-ups",
    zValidator("json", topUpSchema, (result, c) => {
      if (!result.success) return c.json({ error: "invalid_top_up" }, 400);
    }),
    async (c) => {
      const { credits, note } = c.req.valid("json");
      const result = await topUpOrganization(
        currentOperator(c).id,
        c.req.param("id"),
        credits,
        note,
      );
      return result ? c.json(result, 201) : c.json({ error: "organization_not_found" }, 404);
    },
  )
  .post(
    "/organizations/:id/unlimited-period",
    zValidator("json", unlimitedPeriodSchema),
    async (c) => {
      try {
        return c.json(
          {
            period: await grantUnlimitedPeriod(
              currentOperator(c).id,
              c.req.param("id"),
              c.req.valid("json").endDate,
            ),
          },
          201,
        );
      } catch (error) {
        return unlimitedPeriodError(c, error);
      }
    },
  )
  .patch(
    "/organizations/:id/unlimited-period",
    zValidator("json", unlimitedPeriodSchema),
    async (c) => {
      try {
        return c.json({
          period: await extendUnlimitedPeriod(
            currentOperator(c).id,
            c.req.param("id"),
            c.req.valid("json").endDate,
          ),
        });
      } catch (error) {
        return unlimitedPeriodError(c, error);
      }
    },
  )
  .post("/organizations/:id/unlimited-period/end", async (c) => {
    try {
      return c.json({
        period: await endUnlimitedPeriodEarly(currentOperator(c).id, c.req.param("id")),
      });
    } catch (error) {
      return unlimitedPeriodError(c, error);
    }
  })
  .post(
    "/workspaces/:workspaceId/top-ups",
    zValidator("json", topUpSchema, (result, c) => {
      if (!result.success) return c.json({ error: "invalid_top_up" }, 400);
    }),
    async (c) => {
      const { credits, note } = c.req.valid("json");
      const result = await topUpWorkspace(
        currentOperator(c).id,
        c.req.param("workspaceId"),
        credits,
        note,
      );
      if (!result) return c.json({ error: "workspace_not_found" }, 404);
      return c.json(result, 201);
    },
  )
  .post(
    "/workspaces/:workspaceId/unlimited-period",
    zValidator("json", unlimitedPeriodSchema, (result, c) => {
      if (!result.success) return c.json({ error: "invalid_unlimited_period" }, 400);
    }),
    async (c) => {
      try {
        const period = await grantUnlimitedPeriod(
          currentOperator(c).id,
          await organizationForWorkspace(c.req.param("workspaceId")),
          c.req.valid("json").endDate,
        );
        return c.json({ period }, 201);
      } catch (error) {
        if (error instanceof WorkspaceNotFoundError)
          return c.json({ error: "workspace_not_found" }, 404);
        if (error instanceof OverlappingUnlimitedPeriodError) {
          return c.json({ error: "overlapping_unlimited_period" }, 409);
        }
        throw error;
      }
    },
  )
  .patch(
    "/workspaces/:workspaceId/unlimited-period",
    zValidator("json", unlimitedPeriodSchema, (result, c) => {
      if (!result.success) return c.json({ error: "invalid_unlimited_period" }, 400);
    }),
    async (c) => {
      try {
        const period = await extendUnlimitedPeriod(
          currentOperator(c).id,
          await organizationForWorkspace(c.req.param("workspaceId")),
          c.req.valid("json").endDate,
        );
        return c.json({ period });
      } catch (error) {
        if (error instanceof NoActiveUnlimitedPeriodError) {
          return c.json({ error: "no_active_unlimited_period" }, 404);
        }
        throw error;
      }
    },
  )
  .post("/workspaces/:workspaceId/unlimited-period/end", async (c) => {
    try {
      const period = await endUnlimitedPeriodEarly(
        currentOperator(c).id,
        await organizationForWorkspace(c.req.param("workspaceId")),
      );
      return c.json({ period });
    } catch (error) {
      if (error instanceof NoActiveUnlimitedPeriodError) {
        return c.json({ error: "no_active_unlimited_period" }, 404);
      }
      throw error;
    }
  })
  .get(
    "/actions",
    zValidator("query", z.object({ workspaceId: z.string().min(1).optional() })),
    async (c) => {
      const { workspaceId } = c.req.valid("query");
      const actions = await unscopedPrisma.operatorAction.findMany({
        where: workspaceId ? { workspaceId } : undefined,
        include: {
          operator: { select: { id: true, name: true, email: true } },
          workspace: {
            select: { id: true, name: true, organization: { select: { id: true, name: true } } },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
      });
      return c.json({ actions });
    },
  )
  .get("/margin", withRangeQuery, async (c) => c.json(await getModelMargin(c.req.valid("query"))))
  .get(
    "/payments",
    zValidator("query", paymentQuerySchema, (result, c) => {
      if (!result.success) return c.json({ error: "invalid_query" }, 400);
    }),
    async (c) => c.json(await listPayments(c.req.valid("query"))),
  )
  .get("/billing/overview", withRangeQuery, async (c) =>
    c.json(await getBillingOverview(c.req.valid("query"))),
  )
  .get("/billing/credits", zValidator("query", creditQuerySchema), async (c) =>
    c.json(await listCreditOperations(c.req.valid("query"))),
  )
  .get("/billing/unlimited-periods", zValidator("query", periodQuerySchema), async (c) =>
    c.json(await listUnlimitedPeriods(c.req.valid("query"))),
  )
  .get("/overview", withRangeQuery, async (c) =>
    c.json({ overview: await getOperatorOverview(c.req.valid("query")) }),
  )
  .get("/analytics/trends", withRangeQuery, async (c) =>
    c.json(await getPlatformAnalyticsTrends(c.req.valid("query"))),
  )
  .get("/workspaces", zValidator("query", listQuery), async (c) =>
    c.json(await listWorkspaces(c.req.valid("query"))),
  )
  .get("/at-risk", withRangeQuery, async (c) =>
    c.json(await listAtRiskWorkspaces(c.req.valid("query"))),
  )
  .get("/workspaces/:id", withRangeQuery, async (c) => {
    const detail = await getWorkspaceDetail(c.req.param("id"), c.req.valid("query"));
    return detail ? c.json(detail) : c.json({ error: "not_found" }, 404);
  });
