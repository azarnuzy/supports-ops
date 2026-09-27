import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAdmin } from "../auth/guards";
import type { AuthVariables } from "../auth/types";
import { createWorkspaceSchema } from "./schema";
import { createOrganizationWorkspace, listOrganizationWorkspaces } from "./services";

export const workspacesRouter = new Hono<{ Variables: AuthVariables }>()
  .get("/", async (c) => {
    const admin = requireAdmin(c);
    if (!admin?.isOrganizationAdmin || !admin.organizationId) {
      return c.json({ error: "forbidden" }, 403);
    }

    const workspaces = await listOrganizationWorkspaces(admin.organizationId);

    return c.json({ workspaces }, 200);
  })
  .post("/", zValidator("json", createWorkspaceSchema), async (c) => {
    const admin = requireAdmin(c);
    if (!admin?.isOrganizationAdmin || !admin.organizationId) {
      return c.json({ error: "forbidden" }, 403);
    }

    const workspace = await createOrganizationWorkspace(
      admin.organizationId,
      c.req.valid("json").name,
    );

    return c.json({ workspace }, 201);
  });
