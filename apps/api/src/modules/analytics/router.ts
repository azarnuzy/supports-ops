import { Hono } from "hono";
import { requireAdmin } from "../auth/guards";
import type { AuthVariables } from "../auth/types";
import { getAnalyticsOverview, getAnalyticsTraffic } from "./services";

export const analyticsRouter = new Hono<{ Variables: AuthVariables }>()
  .get("/overview", async (c) => {
    if (!requireAdmin(c)) return c.json({ error: "forbidden" }, 403);
    return c.json({ analytics: await getAnalyticsOverview() }, 200);
  })
  .get("/traffic", async (c) => {
    if (!requireAdmin(c)) return c.json({ error: "forbidden" }, 403);
    return c.json({ analytics: await getAnalyticsTraffic() }, 200);
  });
