import { apiConfig } from "./config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./modules/auth/instance";
import { loadAuthSession, loadWorkspaceContext } from "./modules/auth/middleware";
import type { AuthVariables } from "./modules/auth/types";
import { knowledgeRouter } from "./modules/knowledge/router";
import { profileRouter } from "./modules/profile/router";
import { registrationRouter } from "./modules/registration/router";
import { usersRouter } from "./modules/users/router";
import { widgetRouter } from "./modules/widget/router";
import { widgetConfigRouter } from "./modules/widget-config/router";
import { generateAttachmentReply } from "./modules/widget/services";
import { attachmentRouter } from "./modules/attachments/router";
import { aiSettingsRouter } from "./modules/ai-settings/router";
import { analyticsRouter } from "./modules/analytics/router";
import { ticketsRouter } from "./modules/tickets/router";
import { mcpRouter } from "./modules/mcp/router";

export const app = new Hono<{ Variables: AuthVariables }>()
  .post("/internal/tickets/:ticketId/generate", async (c) => {
    if (
      !apiConfig.internalWorkerToken ||
      c.req.header("x-supportops-worker-token") !== apiConfig.internalWorkerToken
    ) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const body = await c.req.json<{ workspaceId?: string }>();
    if (!body.workspaceId) return c.json({ error: "invalid_request" }, 422);
    void generateAttachmentReply(c.req.param("ticketId"), body.workspaceId);
    return c.body(null, 202);
  })
  .route("/widget", widgetRouter)
  .use(
    "*",
    cors({
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
      origin: (origin) => (apiConfig.clientOrigins.includes(origin) ? origin : null),
    }),
  )
  .use("*", loadAuthSession)
  .use("*", loadWorkspaceContext)
  .get("/health", (c) => {
    return c.json({ ok: true, service: "api" }, 200);
  })
  .get("/session", (c) => {
    const user = c.get("user");
    const session = c.get("session");

    if (!user || !session) {
      return c.json({ error: "unauthorized" }, 401);
    }

    return c.json({ session, user }, 200);
  })
  .on(["POST", "GET"], "/api/auth/*", (c) => {
    return auth.handler(c.req.raw);
  })
  .route("/knowledge", knowledgeRouter)
  .route("/attachments", attachmentRouter)
  .route("/tickets", ticketsRouter)
  .route("/analytics", analyticsRouter)
  .route("/profile", profileRouter)
  .route("/register", registrationRouter)
  .route("/users", usersRouter)
  .route("/widget-config", widgetConfigRouter)
  .route("/ai-settings", aiSettingsRouter)
  .route("/mcp-servers", mcpRouter);

export type AppType = typeof app;
