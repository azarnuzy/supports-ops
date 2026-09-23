import { apiConfig, loggerConfig } from "./config";
import type { HttpBindings } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "./utils/logger";
import { auth, operatorAuth } from "./modules/auth/instance";
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
import { aiUsageRouter } from "./modules/ai-usage/router";
import { billingRouter, mayarWebhookRouter } from "./modules/billing/router";
import { analyticsRouter } from "./modules/analytics/router";
import { ticketCategoriesRouter } from "./modules/ticket-categories/router";
import { ticketsRouter } from "./modules/tickets/router";
import { toolsRouter } from "./modules/tools/router";
import { mcpRouter } from "./modules/mcp/router";
import { whatsAppConfigRouter } from "./modules/whatsapp-config/router";
import { whatsAppWebhookRouter } from "./modules/whatsapp-config/webhook";
import { operatorRouter } from "./modules/operator/router";

export const app = new Hono<{ Variables: AuthVariables }>()
  /** Registered before every route so it covers the Channel endpoints too.
   * Only slow requests are logged, so a healthy API stays quiet; `SLOW_REQUEST_MS`
   * tunes the threshold without a code change. `handlerMs` ends when the handler
   * returns; `totalMs` ends when the socket closes, so a gap between them is time
   * spent writing the body to the proxy, not computing it. An SSE endpoint is
   * measured up to the point it starts streaming, not for the life of the stream. */
  .use("*", async (c, next) => {
    const start = performance.now();
    await next();
    const handlerMs = Math.round(performance.now() - start);
    const report = (extra: { totalMs?: number; finished?: boolean } = {}) => {
      if (Math.max(handlerMs, extra.totalMs ?? 0) < loggerConfig.slowRequestMs) return;
      logger.warn(
        {
          bytes: c.res.headers.get("content-length"),
          encoding: c.req.header("accept-encoding"),
          handlerMs,
          method: c.req.method,
          path: c.req.path,
          status: c.res.status,
          ...extra,
        },
        "slow request",
      );
    };
    const outgoing = (c.env as Partial<HttpBindings> | undefined)?.outgoing;
    if (!outgoing || c.res.headers.get("content-type")?.startsWith("text/event-stream"))
      return report();
    outgoing.once("close", () =>
      report({
        finished: outgoing.writableFinished,
        totalMs: Math.round(performance.now() - start),
      }),
    );
  })
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
  .route("/webhooks/whatsapp", whatsAppWebhookRouter)
  .route("/webhooks/mayar", mayarWebhookRouter)
  .use(
    "*",
    cors({
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
      origin: (origin) => (apiConfig.clientOrigins.includes(origin) ? origin : null),
    }),
  )
  .on(["POST", "GET"], "/operator/auth/*", (c) => operatorAuth.handler(c.req.raw))
  .route("/operator", operatorRouter)
  .use("*", loadAuthSession)
  .use("*", loadWorkspaceContext)
  .get("/health", (c) => {
    return c.json({ ok: true, service: "api" }, 200);
  })
  .get("/session", (c) => {
    const user = c.get("user");
    const session = c.get("authSession");

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
  .route("/ticket-categories", ticketCategoriesRouter)
  .route("/tickets", ticketsRouter)
  .route("/analytics", analyticsRouter)
  .route("/profile", profileRouter)
  .route("/register", registrationRouter)
  .route("/users", usersRouter)
  .route("/widget-config", widgetConfigRouter)
  .route("/whatsapp-config", whatsAppConfigRouter)
  .route("/ai-settings", aiSettingsRouter)
  .route("/ai-usage", aiUsageRouter)
  .route("/billing", billingRouter)
  .route("/mcp-servers", mcpRouter)
  .route("/tools", toolsRouter);

export type AppType = typeof app;
