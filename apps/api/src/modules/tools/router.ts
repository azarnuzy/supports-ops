import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAdmin } from "../auth/guards";
import type { AuthVariables } from "../auth/types";
import { createHttpToolSchema, updateHttpToolSchema } from "./schema";
import {
  createHttpTool,
  deleteHttpTool,
  getHttpTool,
  HttpToolNotFoundError,
  InvalidToolSchemaError,
  listHttpTools,
  updateHttpTool,
} from "./services";

export const toolsRouter = new Hono<{ Variables: AuthVariables }>()
  .use("*", async (c, next) => {
    if (!requireAdmin(c)) return c.json({ error: "forbidden" }, 403);
    await next();
  })
  .get("/", async (c) => c.json({ tools: await listHttpTools() }, 200))
  .post("/", zValidator("json", createHttpToolSchema), async (c) => {
    try {
      return c.json({ tool: await createHttpTool(c.req.valid("json")) }, 201);
    } catch (error) {
      if (error instanceof InvalidToolSchemaError)
        return c.json({ error: "invalid_schema", message: error.message }, 422);
      throw error;
    }
  })
  .get("/:id", async (c) => {
    try {
      return c.json({ tool: await getHttpTool(c.req.param("id")) }, 200);
    } catch (error) {
      if (error instanceof HttpToolNotFoundError) return c.json({ error: "not_found" }, 404);
      throw error;
    }
  })
  .put("/:id", zValidator("json", updateHttpToolSchema), async (c) => {
    try {
      return c.json(
        { tool: await updateHttpTool(c.req.param("id"), c.req.valid("json")) },
        200,
      );
    } catch (error) {
      if (error instanceof HttpToolNotFoundError) return c.json({ error: "not_found" }, 404);
      if (error instanceof InvalidToolSchemaError)
        return c.json({ error: "invalid_schema", message: error.message }, 422);
      throw error;
    }
  })
  .delete("/:id", async (c) => {
    try {
      await deleteHttpTool(c.req.param("id"));
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof HttpToolNotFoundError) return c.json({ error: "not_found" }, 404);
      throw error;
    }
  });
