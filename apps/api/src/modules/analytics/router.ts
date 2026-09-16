import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAdmin } from "../auth/guards";
import type { AuthVariables } from "../auth/types";
import { getAnalyticsOverview, getAnalyticsTraffic } from "./services";
import { analyticsRangeQuerySchema } from "./schema";

/** Shared by both endpoints; every range failure — malformed date, half a
 * pair, inverted order, oversized span — reads as one `invalid_range`. */
const withRangeQuery = zValidator("query", analyticsRangeQuerySchema, (result, c) => {
  if (!result.success) return c.json({ error: "invalid_range" }, 400);
});

export const analyticsRouter = new Hono<{ Variables: AuthVariables }>()
  .get("/overview", withRangeQuery, async (c) => {
    if (!requireAdmin(c)) return c.json({ error: "forbidden" }, 403);
    return c.json({ analytics: await getAnalyticsOverview(c.req.valid("query")) }, 200);
  })
  .get("/traffic", withRangeQuery, async (c) => {
    if (!requireAdmin(c)) return c.json({ error: "forbidden" }, 403);
    return c.json({ analytics: await getAnalyticsTraffic(c.req.valid("query")) }, 200);
  });
