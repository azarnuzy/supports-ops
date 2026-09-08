import { Hono, type Context, type Next } from "hono";
import { cors } from "hono/cors";
import type { AuthVariables } from "../auth/types";
import { zValidator } from "@hono/zod-validator";
import { streamSSE } from "hono/streaming";
import { customerMessageSchema, preChatSchema } from "./schema";
import { publishWidgetEvent, subscribeToWidgetEvents } from "./realtime";
import { clientAddress, limitWidgetMessage } from "./rate-limit";
import {
  ClassificationNotConfiguredError,
  createWebSession,
  getApprovedWidget,
  createCustomerMessage,
  getMessagesAfter,
  getWebSession,
  toPublicWidgetConfig,
  UnapprovedWidgetOriginError,
  WidgetNotFoundError,
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
    cors({ allowHeaders: ["Content-Type"], allowMethods: ["POST", "OPTIONS"], credentials: false, origin: "*" }),
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
      if (result.created) {
        void publishWidgetEvent(result.message.ticketId, { type: "message.created", data: result.message });
      }
      return c.json(result.message, result.created ? 201 : 200);
    } catch (error) {
      if (error instanceof ClassificationNotConfiguredError) {
        return c.json({ error: "classification_not_configured", message: error.message }, 503);
      }
      throw error;
    }
  })
  .get("/events", async (c) => {
    const accessToken = c.req.query("token");
    if (!accessToken) return c.json({ error: "unauthorized" }, 401);
    const position = Number(c.req.header("Last-Event-ID") ?? "0");
    const replay = await getMessagesAfter(accessToken, Number.isSafeInteger(position) && position >= 0 ? position : 0);
    if (!replay) return c.json({ error: "unauthorized" }, 401);
    return streamSSE(c, async (stream) => {
      for (const message of replay.messages) {
        await stream.writeSSE({ data: JSON.stringify(message), event: "message.created", id: String(message.position) });
      }
      const unsubscribe = await subscribeToWidgetEvents(replay.ticketId, async (event) => {
        const data = event.data as { position?: number };
        await stream.writeSSE({ data: JSON.stringify(event.data), event: event.type, id: data.position ? String(data.position) : undefined });
      });
      stream.onAbort(unsubscribe);
      await new Promise<void>(() => undefined);
    });
  })
  .get("/session", async (c) => {
    const accessToken = c.req.query("token");
    if (!accessToken) return c.json({ error: "unauthorized" }, 401);

    const session = await getWebSession(accessToken);
    if (!session) return c.json({ error: "unauthorized" }, 401);

    return c.json(session, 200);
  });
