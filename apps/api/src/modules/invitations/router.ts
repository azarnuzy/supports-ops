import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireWorkspaceId } from "../../utils/workspace-context";
import { auth } from "../auth/instance";
import { requireAdmin } from "../auth/guards";
import type { AuthVariables } from "../auth/types";
import { acceptInvitationSchema, inviteSchema } from "./schema";
import {
  InvitationConflictError,
  InvitationEmailInOtherOrganizationError,
  InvitationForbiddenError,
  InvitationNotFoundError,
  InvitationUnavailableError,
  acceptInvitation,
  describeInvitation,
  inviteToWorkspace,
  listPendingInvitations,
  resendInvitation,
  revokeInvitation,
} from "./services";

const unavailable = {
  error: "invitation_unavailable",
  message: new InvitationUnavailableError().message,
};

export const invitationsRouter = new Hono<{ Variables: AuthVariables }>()
  .get("/", async (c) => {
    if (!requireAdmin(c)) return c.json({ error: "forbidden" }, 403);
    return c.json(await listPendingInvitations(requireWorkspaceId()), 200);
  })
  .post("/", zValidator("json", inviteSchema), async (c) => {
    const admin = requireAdmin(c);
    if (!admin?.organizationId) return c.json({ error: "forbidden" }, 403);
    try {
      const result = await inviteToWorkspace(
        { ...admin, organizationId: admin.organizationId },
        requireWorkspaceId(),
        c.req.valid("json"),
      );
      return c.json(result, 201);
    } catch (error) {
      if (error instanceof InvitationForbiddenError) return c.json({ error: "forbidden" }, 403);
      if (error instanceof InvitationEmailInOtherOrganizationError)
        return c.json({ error: "email_in_use", message: error.message }, 409);
      if (error instanceof InvitationConflictError)
        return c.json({ error: "conflict", message: error.message }, 409);
      throw error;
    }
  })
  .post("/:id/resend", async (c) => {
    const admin = requireAdmin(c);
    if (!admin) return c.json({ error: "forbidden" }, 403);
    try {
      await resendInvitation(requireWorkspaceId(), c.req.param("id"), admin.name);
      return c.json({ ok: true });
    } catch (error) {
      if (error instanceof InvitationNotFoundError) return c.json({ error: "not_found" }, 404);
      throw error;
    }
  })
  .delete("/:id", async (c) => {
    if (!requireAdmin(c)) return c.json({ error: "forbidden" }, 403);
    try {
      await revokeInvitation(requireWorkspaceId(), c.req.param("id"));
      return c.json({ ok: true });
    } catch (error) {
      if (error instanceof InvitationNotFoundError) return c.json({ error: "not_found" }, 404);
      throw error;
    }
  })
  // Public: the invitee has no account yet; the token is the credential.
  .get("/by-token/:token", async (c) => {
    try {
      return c.json(await describeInvitation(c.req.param("token")), 200);
    } catch (error) {
      if (error instanceof InvitationUnavailableError) return c.json(unavailable, 410);
      throw error;
    }
  })
  .post("/by-token/:token/accept", zValidator("json", acceptInvitationSchema), async (c) => {
    const input = c.req.valid("json");
    try {
      const { email } = await acceptInvitation(c.req.param("token"), input);
      // Signs the invitee straight in; the response carries the session cookie.
      const signedIn = await auth.api.signInEmail({
        body: { email, password: input.password },
        asResponse: true,
      });
      const response = c.json({ ok: true }, 200);
      for (const cookie of signedIn.headers.getSetCookie())
        response.headers.append("set-cookie", cookie);
      return response;
    } catch (error) {
      if (error instanceof InvitationUnavailableError) return c.json(unavailable, 410);
      if (error instanceof InvitationEmailInOtherOrganizationError)
        return c.json({ error: "email_in_use", message: error.message }, 409);
      if (error instanceof InvitationConflictError)
        return c.json({ error: "conflict", message: error.message }, 409);
      throw error;
    }
  });
