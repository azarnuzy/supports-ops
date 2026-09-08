import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAdmin } from "../auth/guards";
import type { AuthVariables } from "../auth/types";
import { updateWebWidgetConfigSchema } from "./schema";
import {
  getWebWidgetConfig,
  updateWebWidgetConfig,
  WebWidgetConfigNotFoundError,
} from "./services";

export const widgetConfigRouter = new Hono<{ Variables: AuthVariables }>()
  .get("/", async (c) => {
    const currentUser = requireAdmin(c);

    if (!currentUser) {
      return c.json({ error: "forbidden" }, 403);
    }

    try {
      const result = await getWebWidgetConfig();

      return c.json(result, 200);
    } catch (error) {
      if (error instanceof WebWidgetConfigNotFoundError) {
        return c.json({ error: "not_found", message: error.message }, 404);
      }

      throw error;
    }
  })
  .patch("/", zValidator("json", updateWebWidgetConfigSchema), async (c) => {
    const currentUser = requireAdmin(c);

    if (!currentUser) {
      return c.json({ error: "forbidden" }, 403);
    }

    try {
      const result = await updateWebWidgetConfig(c.req.valid("json"));

      return c.json(result, 200);
    } catch (error) {
      if (error instanceof WebWidgetConfigNotFoundError) {
        return c.json({ error: "not_found", message: error.message }, 404);
      }

      throw error;
    }
  });
