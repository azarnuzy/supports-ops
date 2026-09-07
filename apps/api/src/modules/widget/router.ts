import { Hono } from "hono";
import { cors } from "hono/cors";
import { unscopedPrisma } from "../../utils/prisma";
import type { AuthVariables } from "../auth/types";

type PublicWidgetConfig = {
  botName: string;
  primaryColor: string;
  welcomeMessage: string;
};

type WidgetVariables = AuthVariables & {
  origin: string | null;
  widgetConfig: PublicWidgetConfig | null;
};

export const widgetRouter = new Hono<{ Variables: WidgetVariables }>()
  .use("/config", async (c, next) => {
    const widgetKey = c.req.query("key");
    const origin = c.req.header("Origin") ?? null;

    if (!widgetKey || !origin) {
      return c.json({ error: "forbidden" }, 403);
    }

    const config = await unscopedPrisma.webWidgetConfig.findUnique({
      where: { widgetKey },
      select: {
        allowedDomains: true,
        botName: true,
        primaryColor: true,
        welcomeMessage: true,
      },
    });

    if (!config || !isAllowedOrigin(origin, config.allowedDomains)) {
      return c.json({ error: "forbidden" }, 403);
    }

    c.set("origin", origin);
    c.set("widgetConfig", {
      botName: config.botName,
      primaryColor: config.primaryColor,
      welcomeMessage: config.welcomeMessage,
    });

    await next();
  })
  .use(
    "/config",
    cors({
      allowHeaders: ["Content-Type"],
      allowMethods: ["GET", "OPTIONS"],
      credentials: false,
      origin: (_, c) => c.get("origin") ?? null,
    }),
  )
  .get("/config", (c) => c.json(c.get("widgetConfig"), 200));

function isAllowedOrigin(origin: string, allowedDomains: string[]) {
  try {
    const url = new URL(origin);

    return (url.protocol === "http:" || url.protocol === "https:") && allowedDomains.includes(url.host);
  } catch {
    return false;
  }
}
