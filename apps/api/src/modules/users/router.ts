import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { AuthVariables } from "../auth/middleware";
import { requireAdmin } from "../auth/middleware";
import { createHumanAgentSchema, usersQuerySchema } from "./schema";
import {
  createHumanAgent,
  HumanAgentEmailAlreadyInUseError,
  InvalidUsersCursorError,
  listRecentUsers,
} from "./services";

export const usersRouter = new Hono<{ Variables: AuthVariables }>().get(
  "/",
  zValidator("query", usersQuerySchema),
  async (c) => {
    const currentUser = requireAdmin(c);

    if (!currentUser) {
      return c.json({ error: "forbidden" }, 403);
    }

    try {
      const result = await listRecentUsers(c.req.valid("query"));

      return c.json(result, 200);
    } catch (error) {
      if (error instanceof InvalidUsersCursorError) {
        return c.json({ error: "invalid_cursor" }, 400);
      }

      throw error;
    }
  },
).post("/", zValidator("json", createHumanAgentSchema), async (c) => {
  const currentUser = requireAdmin(c);

  if (!currentUser) {
    return c.json({ error: "forbidden" }, 403);
  }

  try {
    const result = await createHumanAgent(currentUser.workspaceId, c.req.valid("json"));

    return c.json(result, 201);
  } catch (error) {
    if (error instanceof HumanAgentEmailAlreadyInUseError) {
      return c.json({ error: "email_in_use", message: error.message }, 409);
    }

    throw error;
  }
});
