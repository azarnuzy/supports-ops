import { zValidator } from "@hono/zod-validator";
import { Hono, type Context } from "hono";
import { requireAdmin } from "../auth/guards";
import type { AuthVariables } from "../auth/types";
import {
  createMcpServerSchema,
  executeMcpToolSchema,
  reviewMcpToolSchema,
  updateMcpServerSchema,
} from "./schema";
import {
  createMcpServer,
  deleteMcpServer,
  discoverMcpTools,
  executeMcpTool,
  listMcpServers,
  McpNotFoundError,
  McpToolDeniedError,
  reviewMcpTool,
  testMcpConnection,
  updateMcpServer,
} from "./services";

export const mcpRouter = new Hono<{ Variables: AuthVariables }>()
  .use("*", async (c, next) =>
    requireAdmin(c) ? next() : c.json({ error: "forbidden" }, 403),
  )
  .get("/", async (c) => c.json({ servers: await listMcpServers() }))
  .post("/", zValidator("json", createMcpServerSchema), async (c) =>
    c.json({ server: await createMcpServer(c.req.valid("json")) }, 201),
  )
  .patch("/:id", zValidator("json", updateMcpServerSchema), async (c) =>
    handle(c, () => updateMcpServer(c.req.param("id"), c.req.valid("json"))),
  )
  .delete("/:id", async (c) =>
    handle(c, async () => {
      await deleteMcpServer(c.req.param("id"));
      return null;
    }),
  )
  .post("/:id/test", async (c) => handle(c, () => testMcpConnection(c.req.param("id"))))
  .post("/:id/discover", async (c) => handle(c, () => discoverMcpTools(c.req.param("id"))))
  .post("/tools/:toolId/review", zValidator("json", reviewMcpToolSchema), async (c) =>
    handle(c, () => reviewMcpTool(c.req.param("toolId"), c.req.valid("json"))),
  )
  .post("/tools/:toolId/execute", zValidator("json", executeMcpToolSchema), async (c) =>
    handle(c, () => {
      const input = c.req.valid("json");
      return executeMcpTool(c.req.param("toolId"), input.aiAgentId, input.arguments);
    }),
  );

async function handle(
  c: Context<{ Variables: AuthVariables }>,
  operation: () => Promise<unknown>,
) {
  try {
    return c.json({ data: await operation() }, 200);
  } catch (error) {
    if (error instanceof McpNotFoundError) return c.json({ error: "not_found" }, 404);
    if (error instanceof McpToolDeniedError) return c.json({ error: "tool_denied", message: error.message }, 409);
    throw error;
  }
}
