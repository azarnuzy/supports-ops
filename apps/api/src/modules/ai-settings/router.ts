import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAdmin } from "../auth/guards";
import type { AuthVariables } from "../auth/types";
import { updateAiSettingsSchema } from "./schema";
import { getAiSettings, updateAiSettings } from "./services";

export const aiSettingsRouter = new Hono<{ Variables: AuthVariables }>()
  .get("/", async (c) => {
    if (!requireAdmin(c)) return c.json({ error: "forbidden" }, 403);
    return c.json({ aiSettings: await getAiSettings() }, 200);
  })
  .patch("/", zValidator("json", updateAiSettingsSchema), async (c) => {
    if (!requireAdmin(c)) return c.json({ error: "forbidden" }, 403);
    return c.json({ aiSettings: await updateAiSettings(c.req.valid("json")) }, 200);
  });
