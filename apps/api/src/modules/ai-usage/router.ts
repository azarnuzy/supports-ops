import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAdmin } from "../auth/guards";
import type { AuthVariables } from "../auth/types";
import { aiUsageQuerySchema, ledgerQuerySchema } from "./schema";
import {
  getAiUsageSummary,
  getToolUsage,
  InvalidLedgerCursorError,
  listCreditLedger,
} from "./services";

const withRangeQuery = zValidator("query", aiUsageQuerySchema, (result, c) => {
  if (!result.success) return c.json({ error: "invalid_range" }, 400);
});

export const aiUsageRouter = new Hono<{ Variables: AuthVariables }>()
  .get("/summary", withRangeQuery, async (c) => {
    if (!requireAdmin(c)) return c.json({ error: "forbidden" }, 403);
    return c.json({ aiUsage: await getAiUsageSummary(c.req.valid("query")) }, 200);
  })
  .get("/tools", withRangeQuery, async (c) => {
    if (!requireAdmin(c)) return c.json({ error: "forbidden" }, 403);
    return c.json({ toolUsage: await getToolUsage(c.req.valid("query")) }, 200);
  })
  .get("/ledger", zValidator("query", ledgerQuerySchema), async (c) => {
    if (!requireAdmin(c)) return c.json({ error: "forbidden" }, 403);

    try {
      return c.json(await listCreditLedger(c.req.valid("query")), 200);
    } catch (error) {
      if (error instanceof InvalidLedgerCursorError) {
        return c.json({ error: "invalid_cursor" }, 400);
      }
      throw error;
    }
  });
