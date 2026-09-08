import { Hono } from "hono";
import { requireAdmin } from "../auth/guards";
import type { AuthVariables } from "../auth/types";
import { getAnalyticsOverview } from "./services";

export const analyticsRouter = new Hono<{ Variables: AuthVariables }>().get(
  "/overview",
  async (c) => {
    if (!requireAdmin(c)) return c.json({ error: "forbidden" }, 403);
    return c.json({ analytics: await getAnalyticsOverview() }, 200);
  },
);
