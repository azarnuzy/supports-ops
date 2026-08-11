import { apiConfig } from "./config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./modules/auth/auth";
import { type AuthVariables, loadAuthSession } from "./modules/auth/middleware";
import { profileRouter } from "./modules/profile/router";
import { usersRouter } from "./modules/users/router";

export const app = new Hono<{ Variables: AuthVariables }>()
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
  .route("/profile", profileRouter)
  .route("/users", usersRouter);

export type AppType = typeof app;
