import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { auth } from "../auth/instance";
import type { AuthVariables } from "../auth/types";
import { updateProfileSchema } from "./schema";
import { updateProfile } from "./services";

export const profileRouter = new Hono<{ Variables: AuthVariables }>()
  .patch("/", zValidator("json", updateProfileSchema), async (c) => {
    const user = c.get("user");

    if (!user) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const result = await updateProfile(user.id, c.req.valid("json"));

    return c.json(result, 200);
  })
  // For Google-only users; Better Auth refuses it once a password exists.
  .post(
    "/password",
    zValidator("json", z.object({ newPassword: z.string().min(8).max(128) })),
    async (c) => {
      if (!c.get("user")) {
        return c.json({ error: "unauthorized" }, 401);
      }

      try {
        await auth.api.setPassword({
          body: c.req.valid("json"),
          headers: c.req.raw.headers,
        });
      } catch {
        return c.json({ error: "password_already_set" }, 409);
      }

      return c.json({ ok: true }, 200);
    },
  );
