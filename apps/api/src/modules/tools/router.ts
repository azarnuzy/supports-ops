import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { requireAdmin } from "../auth/guards";
import type { AuthVariables } from "../auth/types";
import {
  createHttpToolSchema,
  setToolAssignmentSchema,
  setToolEnabledSchema,
  setToolPolicySchema,
  testHttpToolSchema,
  toolPolicyParamsSchema,
  updateHttpToolSchema,
} from "./schema";
import { HttpToolFailure, testHttpTool } from "./execution";
import {
  AiAgentNotFoundError,
  createHttpTool,
  deleteHttpTool,
  getHttpTool,
  HttpToolNotFoundError,
  InvalidToolSchemaError,
  listHttpTools,
  listToolCalls,
  listTools,
  removeToolPolicy,
  setToolAssignment,
  setToolEnabled,
  setToolPolicy,
  ToolNotAssignedError,
  ToolNotFoundError,
  ToolRequiredByPolicyError,
  ToolUnavailableError,
  updateHttpTool,
} from "./services";

export const toolsRouter = new Hono<{ Variables: AuthVariables }>()
  .use("*", async (c, next) => {
    if (!requireAdmin(c)) return c.json({ error: "forbidden" }, 403);
    await next();
  })
  .get("/", async (c) => {
    const aiAgentId = c.req.query("aiAgentId");
    try {
      return c.json({ tools: aiAgentId ? await listTools(aiAgentId) : await listHttpTools() }, 200);
    } catch (error) {
      return toolAuthorizationError(c, error);
    }
  })
  .post("/", zValidator("json", createHttpToolSchema), async (c) => {
    try {
      return c.json({ tool: await createHttpTool(c.req.valid("json")) }, 201);
    } catch (error) {
      if (error instanceof InvalidToolSchemaError)
        return c.json({ error: "invalid_schema", message: error.message }, 422);
      throw error;
    }
  })
  .patch("/:toolId", zValidator("json", setToolEnabledSchema), async (c) => {
    try {
      return c.json(
        { tool: await setToolEnabled(c.req.param("toolId"), c.req.valid("json").enabled) },
        200,
      );
    } catch (error) {
      return toolAuthorizationError(c, error);
    }
  })
  .put(
    "/:toolId/assignments/:aiAgentId",
    zValidator("json", setToolAssignmentSchema),
    async (c) => {
      try {
        await setToolAssignment(
          c.req.param("toolId"),
          c.req.param("aiAgentId"),
          c.req.valid("json").assigned,
        );
        return c.body(null, 204);
      } catch (error) {
        return toolAuthorizationError(c, error);
      }
    },
  )
  .put(
    "/policies/:aiAgentId/:category",
    zValidator("param", toolPolicyParamsSchema),
    zValidator("json", setToolPolicySchema),
    async (c) => {
      try {
        return c.json(
          {
            policy: await setToolPolicy(
              c.req.param("aiAgentId"),
              c.req.valid("param").category,
              c.req.valid("json").toolId,
            ),
          },
          200,
        );
      } catch (error) {
        return toolAuthorizationError(c, error);
      }
    },
  )
  .delete(
    "/policies/:aiAgentId/:category",
    zValidator("param", toolPolicyParamsSchema),
    async (c) => {
      try {
        await removeToolPolicy(c.req.param("aiAgentId"), c.req.valid("param").category);
        return c.body(null, 204);
      } catch (error) {
        return toolAuthorizationError(c, error);
      }
    },
  )
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
  .get("/:id/logs", async (c) => {
    return c.json(await listToolCalls(c.req.param("id")), 200);
  })
  .post("/:id/test", zValidator("json", testHttpToolSchema), async (c) => {
    try {
      const result = await testHttpTool({
        input: c.req.valid("json").input,
        toolId: c.req.param("id"),
      });
      return c.json({ result: { ...result, ok: true as const } }, 200);
    } catch (error) {
      if (error instanceof HttpToolFailure)
        return c.json({ result: { code: error.code, ok: false as const } }, 200);
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

function toolAuthorizationError(
  c: Context<{ Variables: AuthVariables }>,
  error: unknown,
): Response {
  if (error instanceof ToolNotFoundError || error instanceof AiAgentNotFoundError)
    return c.json({ error: "not_found" }, 404);
  if (error instanceof ToolRequiredByPolicyError)
    return c.json({ error: "tool_required_by_policy" }, 409);
  if (error instanceof ToolUnavailableError) return c.json({ error: "tool_unavailable" }, 409);
  if (error instanceof ToolNotAssignedError) return c.json({ error: "tool_not_assigned" }, 409);
  throw error;
}
