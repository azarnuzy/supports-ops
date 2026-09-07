import { Hono, type Context, type Next } from "hono";
import { cors } from "hono/cors";
import type { AuthVariables } from "../auth/types";
import { zValidator } from "@hono/zod-validator";
import { preChatSchema } from "./schema";
import {
  createWebSession,
  getApprovedWidget,
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
  .get("/config", (c) => c.json(c.get("widgetConfig"), 200))
  .post("/pre-chat", zValidator("json", preChatSchema), async (c) => {
    const origin = c.get("origin");
    if (!origin) return c.json({ error: "forbidden" }, 403);
    const session = await createWebSession(c.req.valid("json"), origin);
    return c.json(session, 201);
  })
  .get("/session", async (c) => {
    const accessToken = c.req.query("token");
    if (!accessToken) return c.json({ error: "unauthorized" }, 401);

    const session = await getWebSession(accessToken);
    if (!session) return c.json({ error: "unauthorized" }, 401);

    return c.json(session, 200);
  });
