import { Hono, type Context, type Next } from "hono";
import { captureMode } from "@repo/ai-agent";
import { withSpan } from "@repo/logger/telemetry";
import { createStorage } from "@repo/storage";
import { storageConfig } from "../../config";
import { unscopedPrisma } from "../../utils/prisma";
import { keepStreamAlive } from "../../utils/sse";
import { cors } from "hono/cors";
import type { AuthVariables } from "../auth/types";
import { zValidator } from "@hono/zod-validator";
import { streamSSE } from "hono/streaming";
import { customerAttachmentSchema, customerMessageSchema, preChatSchema } from "./schema";
import {
  isTicketGenerating,
  publishTicketQueueEvent,
  publishWidgetEvent,
  publishSessionEvent,
  subscribeToWidgetEvents,
  subscribeToSessionEvents,
} from "./realtime";
import { clientAddress, limitWidgetMessage } from "./rate-limit";
import { escalate, generateAiReply } from "../ai-agent/turn";
import {
  ClassificationFailedError,
  ClassificationNotConfiguredError,
  createSession,
  getApprovedWidget,
  createCustomerMessage,
  createCustomerAttachments,
  customerRequestedHuman,
  getMessagesAfter,
  getSession,
  toPublicWidgetConfig,
  UnapprovedWidgetOriginError,
  WidgetNotFoundError,
  InvalidAttachmentError,
  SessionClosedError,
} from "./services";
import type { PublicWidgetConfig } from "./services";

type WidgetVariables = AuthVariables & {
  origin: string | null;
  widgetConfig: PublicWidgetConfig | null;
};

async function requireApprovedWidget(c: Context<{ Variables: WidgetVariables }>, next: Next) {
  const widgetKey = c.req.query("key");
  const origin = c.req.header("Origin") ?? null;

  if (!widgetKey || !origin) {
    return c.json({ error: "forbidden" }, 403);
  }

  try {
    const config = await getApprovedWidget(widgetKey, origin);

    c.set("origin", origin);
    c.set("widgetConfig", toPublicWidgetConfig(config));
    await next();
  } catch (error) {
    if (error instanceof WidgetNotFoundError || error instanceof UnapprovedWidgetOriginError) {
      return c.json({ error: "forbidden" }, 403);
    }

    throw error;
  }
}

export const widgetRouter = new Hono<{ Variables: WidgetVariables }>()
  .use("/config", requireApprovedWidget)
  .use("/pre-chat", requireApprovedWidget)
  .use(
    "/config",
    cors({
      allowHeaders: ["Content-Type"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      credentials: false,
      origin: (_, c) => c.get("origin") ?? null,
    }),
  )
  .use(
    "/pre-chat",
    cors({
      allowHeaders: ["Content-Type"],
      allowMethods: ["POST", "OPTIONS"],
      credentials: false,
      origin: (_, c) => c.get("origin") ?? null,
    }),
  )
  .use(
    "/messages",
    cors({
      allowHeaders: ["Content-Type"],
      allowMethods: ["POST", "OPTIONS"],
      credentials: false,
      origin: "*",
    }),
  )
  .use(
    "/attachments",
    cors({
      allowHeaders: ["Content-Type"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      credentials: false,
      origin: "*",
    }),
  )
  .use(
    "/attachments/*",
    cors({
      allowHeaders: ["Content-Type"],
      allowMethods: ["GET", "OPTIONS"],
      credentials: false,
      origin: "*",
    }),
  )
  .use("/events", cors({ allowMethods: ["GET", "OPTIONS"], credentials: false, origin: "*" }))
  .use("/session", cors({ allowMethods: ["GET", "OPTIONS"], credentials: false, origin: "*" }))
  .get("/config", (c) => c.json(c.get("widgetConfig"), 200))
  .post("/pre-chat", zValidator("json", preChatSchema), async (c) => {
    const origin = c.get("origin");
    if (!origin) return c.json({ error: "forbidden" }, 403);
    const session = await createSession(c.req.valid("json"), origin);
    return c.json(session, 201);
  })
  .post("/messages", zValidator("json", customerMessageSchema), async (c) => {
    const accessToken = c.req.query("token");
    if (!accessToken) return c.json({ error: "unauthorized" }, 401);
    const limit = await limitWidgetMessage(accessToken, clientAddress(c.req.raw.headers));
    if (!limit.allowed) {
      c.header("Retry-After", String(limit.retryAfterSeconds));
      return c.json({ error: "rate_limited", retryAfterSeconds: limit.retryAfterSeconds }, 429);
    }
    try {
      const input = c.req.valid("json");
      let respond!: (response: Response) => void;
      let rejectResponse!: (error: unknown) => void;
      const response = new Promise<Response>((resolve, reject) => {
        respond = resolve;
        rejectResponse = reject;
      });
      // The HTTP response is ready once the Customer Message is stored. Keep
      // its trace open while the AI finishes in the background for the Widget.
      void withSpan(
        "support.customer_turn",
        {
          "anvia.trace.name": "support.customer_turn",
          "langfuse.trace.name": "support.customer_turn",
          ...(captureMode === "full" ? { "langfuse.observation.input": input.content } : {}),
        },
        async (span) => {
          let accepted = false;
          try {
            const result = await createCustomerMessage(accessToken, input);
            if (!result) {
              respond(c.json({ error: "unauthorized" }, 401));
              return;
            }
            if (result.kind === "reply") {
              span.setAttributes({
                "anvia.trace.session_id": result.sessionId,
                "langfuse.session.id": result.sessionId,
                "supportops.workspace_id": result.workspaceId,
              });
              span.setAttribute("supportops.outcome", "GREETING_REPLY");
              if (captureMode === "full") {
                span.setAttribute("langfuse.observation.output", result.reply);
              }
              respond(c.json({ reply: result.reply }, 200));
              return;
            }
            span.setAttributes({
              "anvia.trace.session_id": result.message.sessionId,
              "langfuse.session.id": result.message.sessionId,
              "supportops.workspace_id": result.message.workspaceId,
              ...(result.message.ticketId ? { "supportops.ticket_id": result.message.ticketId } : {}),
            });
            respond(c.json(result.message, result.created ? 201 : 200));
            accepted = true;
            if (!result.created || !result.message.ticketId) {
              span.setAttribute("supportops.outcome", "DUPLICATE_OR_NO_TICKET");
              return;
            }
            const ticketId = result.message.ticketId;
            void publishSessionEvent(result.message.sessionId, {
              type: "ticket.status",
              data: { status: "ticket_created" },
            }).catch(() => undefined);
            void publishWidgetEvent(ticketId, {
              type: "message.created",
              data: result.message,
            });
            void publishTicketQueueEvent(result.message.workspaceId);
            if (customerRequestedHuman(result.message.content)) {
              await escalate(
                ticketId,
                result.message.workspaceId,
                "CUSTOMER_REQUESTED_HUMAN",
                result.message.content,
              );
              span.setAttribute("supportops.outcome", "CUSTOMER_REQUESTED_HUMAN");
              if (captureMode === "full") {
                span.setAttribute("langfuse.observation.output", "Escalated to Human Agent");
              }
            } else {
              const decision = await generateAiReply(
                ticketId,
                result.message.workspaceId,
                result.message.content,
              );
              const outcome = decision ?? (await unscopedPrisma.ticket.findUnique({
                select: { escalationReason: true, status: true },
                where: { id: ticketId },
              }));
              span.setAttribute(
                "supportops.outcome",
                decision?.decision ?? outcome?.escalationReason ?? outcome?.status ?? "UNKNOWN",
              );
              if (captureMode === "full") {
                span.setAttribute(
                  "langfuse.observation.output",
                  JSON.stringify(outcome ?? { status: "UNKNOWN" }),
                );
              }
            }
          } catch (error) {
            if (!accepted) rejectResponse(error);
            throw error;
          }
        },
      ).catch(() => undefined);
      return await response;
    } catch (error) {
      if (error instanceof ClassificationNotConfiguredError) {
        return c.json({ error: "classification_not_configured", message: error.message }, 503);
      }
      if (error instanceof ClassificationFailedError) {
        return c.json({ error: "classification_failed", message: error.message }, 502);
      }
      if (error instanceof SessionClosedError) {
        return c.json({ error: "session_closed" }, 409);
      }
      throw error;
    }
  })
  .post("/attachments", async (c) => {
    const accessToken = c.req.query("token");
    if (!accessToken) return c.json({ error: "unauthorized" }, 401);
    try {
      const form = await c.req.formData();
      const parsed = customerAttachmentSchema.safeParse({
        content: form.get("content") || undefined,
        files: form.getAll("files").filter((value): value is File => value instanceof File),
      });
      if (!parsed.success) return c.json({ error: "invalid_attachment" }, 422);
      const result = await createCustomerAttachments(accessToken, parsed.data);
      if (!result) return c.json({ error: "unauthorized" }, 401);
      if (result.message.ticketId) {
        void publishWidgetEvent(result.message.ticketId, {
          type: "message.created",
          data: { ...result.message, attachments: result.attachments },
        });
        if (customerRequestedHuman(result.message.content)) {
          void escalate(
            result.message.ticketId,
            result.message.workspaceId,
            "CUSTOMER_REQUESTED_HUMAN",
            result.message.content,
          );
        }
      }
      return c.json(result, 201);
    } catch (error) {
      if (error instanceof InvalidAttachmentError) {
        return c.json({ error: "invalid_attachment", message: error.message }, 422);
      }
      throw error;
    }
  })
  .get("/events", async (c) => {
    const accessToken = c.req.query("token");
    if (!accessToken) return c.json({ error: "unauthorized" }, 401);
    const rawCursor = c.req.header("Last-Event-ID");
    const parsed = rawCursor === undefined ? null : Number(rawCursor);
    const position =
      parsed === null ? null : Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
    const initial = await getSession(accessToken);
    if (!initial) return c.json({ error: "unauthorized" }, 401);
    return streamSSE(c, async (stream) => {
      const unsubscribe = await (initial.ticket
        ? subscribeToWidgetEvents(initial.ticket.id, async (event) => {
            const data = event.data as { position?: number };
            await stream.writeSSE({
              data: JSON.stringify(event.data),
              event: event.type,
              id: data.position ? String(data.position) : undefined,
            });
          })
        : subscribeToSessionEvents(initial.id, async (event) => {
            const data = event.data as { position?: number };
            await stream.writeSSE({
              data: JSON.stringify(event.data),
              event: event.type,
              id: data.position ? String(data.position) : undefined,
            });
          }));
      stream.onAbort(unsubscribe);
      // Subscribe before replay: a Message written during the handshake is
      // delivered by the subscription or the second read (duplicates are
      // harmless because the Widget deduplicates by Session position).
      const replay = await getMessagesAfter(accessToken, position);
      if (!replay) return unsubscribe();
      for (const message of replay.messages) {
        await stream.writeSSE({
          data: JSON.stringify(message),
          event: "message.created",
          id: String(message.position),
        });
      }
      if (!initial.ticket && replay.ticketId) {
        await stream.writeSSE({
          data: JSON.stringify({ status: "ticket_created" }),
          event: "ticket.status",
        });
      }
      await stream.writeSSE({
        data: JSON.stringify({
          status:
            replay.sessionStatus === "CLOSED" || replay.ticketStatus === "RESOLVED"
              ? "resolved"
              : replay.ticketId && isTicketGenerating(replay.ticketId)
                ? "generating"
                : "ready",
        }),
        event: "ticket.status",
      });
      keepStreamAlive(stream);
      await new Promise<void>(() => undefined);
    });
  })
  .get("/attachments/:id/:mode", async (c) => {
    const accessToken = c.req.query("token");
    if (!accessToken) return c.json({ error: "unauthorized" }, 401);
    const attachment = await unscopedPrisma.attachment.findFirst({
      where: { id: c.req.param("id"), deletedAt: null, ticket: { session: { accessToken } } },
    });
    if (!attachment) return c.json({ error: "not_found" }, 404);
    const preview = c.req.param("mode") === "preview";
    if (!preview && c.req.param("mode") !== "download") return c.json({ error: "not_found" }, 404);
    return c.json({
      url: await createStorage(storageConfig).getSignedGetObjectUrl({
        key: attachment.storageKey,
        responseContentDisposition: `${preview ? "inline" : "attachment"}; filename="${attachment.fileName.replaceAll('"', "")}"`,
        responseContentType: attachment.mimeType,
      }),
    });
  })
  .get("/session", async (c) => {
    const accessToken = c.req.query("token");
    if (!accessToken || !/^[A-Za-z0-9_-]{43}$/.test(accessToken))
      return c.text("Invalid conversation link.", 400);
    const session = await getSession(accessToken);
    if (!session) return c.text("Invalid conversation link.", 404);
    const scriptUrl = process.env.WIDGET_SCRIPT_URL ??
      (process.env.NODE_ENV === "production"
        ? "https://widget.support.azarnuzy.com/widget.js"
        : "http://localhost:3002/src/loader.ts");
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Content-Type-Options", "nosniff");
    const apiUrl = new URL(process.env.SESSION_LINK_BASE_URL ?? c.req.url).origin;
    const scriptType = process.env.NODE_ENV === "production" ? "" : ' type="module"';
    return c.html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Support chat</title></head><body><script${scriptType} src="${scriptUrl}" data-session-token="${accessToken}" data-api-url="${apiUrl}"></script></body></html>`);
  })
  .get("/session/info", async (c) => {
    const accessToken = c.req.query("token");
    if (!accessToken) return c.json({ error: "unauthorized" }, 401);

    const session = await getSession(accessToken);
    if (!session) return c.json({ error: "unauthorized" }, 401);
    const config = session.channel.webWidgetConfig;
    if (!config) return c.json({ error: "not_found" }, 404);
    c.header("Cache-Control", "no-store");
    return c.json({
      config: toPublicWidgetConfig(config),
      customer: session.customerIdentity,
      id: session.id,
      status: session.status,
    }, 200);
  });
