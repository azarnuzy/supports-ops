import { Hono, type Context, type Next } from "hono";
import { createStorage } from "@repo/storage";
import { storageConfig } from "../../config";
import { unscopedPrisma } from "../../utils/prisma";
import { cors } from "hono/cors";
import type { AuthVariables } from "../auth/types";
import { zValidator } from "@hono/zod-validator";
import { streamSSE } from "hono/streaming";
import { customerAttachmentSchema, customerMessageSchema, preChatSchema } from "./schema";
import {
  isTicketGenerating,
  publishTicketQueueEvent,
  publishWidgetEvent,
  subscribeToWidgetEvents,
} from "./realtime";
import { clientAddress, limitWidgetMessage } from "./rate-limit";
import {
  ClassificationFailedError,
  ClassificationNotConfiguredError,
  createWebSession,
  getApprovedWidget,
  createCustomerMessage,
  createCustomerAttachments,
  generateAiReply,
  customerRequestedHuman,
  escalate,
  getMessagesAfter,
  getWebSession,
  toPublicWidgetConfig,
  UnapprovedWidgetOriginError,
  WidgetNotFoundError,
  InvalidAttachmentError,
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
  .get("/config", (c) => c.json(c.get("widgetConfig"), 200))
  .post("/pre-chat", zValidator("json", preChatSchema), async (c) => {
    const origin = c.get("origin");
    if (!origin) return c.json({ error: "forbidden" }, 403);
    const session = await createWebSession(c.req.valid("json"), origin);
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
      const result = await createCustomerMessage(accessToken, c.req.valid("json"));
      if (!result) return c.json({ error: "unauthorized" }, 401);
      if (result.kind === "reply") {
        return c.json({ reply: result.reply }, 200);
      }
      if (result.created && result.message.ticketId) {
        const ticketId = result.message.ticketId;
        void publishWidgetEvent(ticketId, {
          type: "message.created",
          data: result.message,
        });
        void publishTicketQueueEvent(result.message.workspaceId);
        if (customerRequestedHuman(result.message.content)) {
          void escalate(
            ticketId,
            result.message.workspaceId,
            "CUSTOMER_REQUESTED_HUMAN",
            result.message.content,
          );
        } else {
          void generateAiReply(ticketId, result.message.workspaceId, result.message.content);
        }
      }
      return c.json(result.message, result.created ? 201 : 200);
    } catch (error) {
      if (error instanceof ClassificationNotConfiguredError) {
        return c.json({ error: "classification_not_configured", message: error.message }, 503);
      }
      if (error instanceof ClassificationFailedError) {
        return c.json({ error: "classification_failed", message: error.message }, 502);
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
    const replay = await getMessagesAfter(accessToken, position);
    if (!replay) return c.json({ error: "unauthorized" }, 401);
    return streamSSE(c, async (stream) => {
      for (const message of replay.messages) {
        await stream.writeSSE({
          data: JSON.stringify(message),
          event: "message.created",
          id: String(message.position),
        });
      }
      const unsubscribe = replay.ticketId
        ? await subscribeToWidgetEvents(replay.ticketId, async (event) => {
            const data = event.data as { position?: number };
            await stream.writeSSE({
              data: JSON.stringify(event.data),
              event: event.type,
              id: data.position ? String(data.position) : undefined,
            });
          })
        : undefined;
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
      if (unsubscribe) stream.onAbort(unsubscribe);
      await new Promise<void>(() => undefined);
    });
  })
  .get("/attachments/:id/:mode", async (c) => {
    const accessToken = c.req.query("token");
    if (!accessToken) return c.json({ error: "unauthorized" }, 401);
    const attachment = await unscopedPrisma.attachment.findFirst({
      where: { id: c.req.param("id"), deletedAt: null, ticket: { webSession: { accessToken } } },
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
    if (!accessToken) return c.json({ error: "unauthorized" }, 401);

    const session = await getWebSession(accessToken);
    if (!session) return c.json({ error: "unauthorized" }, 401);

    return c.json(session, 200);
  });
