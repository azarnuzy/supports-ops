import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAdmin } from "../auth/guards";
import type { AuthVariables } from "../auth/types";
import { createHumanAgentSchema, usersQuerySchema, updateMembershipSchema, organizationAdminSchema } from "./schema";
import {
  createHumanAgent,
  HumanAgentEmailAlreadyInUseError,
  InvalidUsersCursorError,
  listRecentUsers,
  updateMembership,
  removeMembership,
  setOrganizationAdmin,
  MembershipConflictError,
  LastOrganizationAdminError,
} from "./services";

export const usersRouter = new Hono<{ Variables: AuthVariables }>()
  .get("/", zValidator("query", usersQuerySchema), async (c) => {
    const currentUser = requireAdmin(c);

    if (!currentUser) {
      return c.json({ error: "forbidden" }, 403);
    }

    try {
      const result = await listRecentUsers(c.req.valid("query"), currentUser.workspaceId);

      return c.json(result, 200);
    } catch (error) {
      if (error instanceof InvalidUsersCursorError) return c.json({ error: "invalid_cursor" }, 400);
      throw error;
    }
  })
  .post("/", zValidator("json", createHumanAgentSchema), async (c) => {
    const currentUser = requireAdmin(c);

    if (!currentUser) {
      return c.json({ error: "forbidden" }, 403);
    }

    try {
      const result = await createHumanAgent(currentUser.workspaceId, c.req.valid("json"));

      return c.json(result, 201);
    } catch (error) {
      if (error instanceof HumanAgentEmailAlreadyInUseError || error instanceof MembershipConflictError) {
        return c.json({ error: "email_in_use", message: error.message }, 409);
      }

      throw error;
    }
  })
  .patch("/:id", zValidator("json", updateMembershipSchema), async (c) => {
    const admin = requireAdmin(c);
    if (!admin) return c.json({ error: "forbidden" }, 403);
    try {
      await updateMembership(admin.workspaceId, c.req.param("id"), c.req.valid("json").role);
      return c.json({ ok: true });
    } catch (error) {
      if (error instanceof MembershipConflictError) return c.json({ error: error.message }, 404);
      throw error;
    }
  })
  .delete("/:id", async (c) => {
    const admin = requireAdmin(c);
    if (!admin) return c.json({ error: "forbidden" }, 403);
    try {
      await removeMembership(admin.workspaceId, c.req.param("id"));
      return c.json({ ok: true });
    } catch (error) {
      if (error instanceof LastOrganizationAdminError) return c.json({ error: error.message }, 409);
      if (error instanceof MembershipConflictError) return c.json({ error: error.message }, 404);
      throw error;
    }
  })
  .patch("/:id/organization-admin", zValidator("json", organizationAdminSchema), async (c) => {
    const admin = requireAdmin(c);
    if (!admin?.isOrganizationAdmin || !admin.organizationId) return c.json({ error: "forbidden" }, 403);
    try {
      await setOrganizationAdmin(admin.organizationId, c.req.param("id"), c.req.valid("json").enabled);
      return c.json({ ok: true });
    } catch (error) {
      if (error instanceof LastOrganizationAdminError) return c.json({ error: error.message }, 409);
      if (error instanceof MembershipConflictError) return c.json({ error: error.message }, 404);
      throw error;
    }
  });
