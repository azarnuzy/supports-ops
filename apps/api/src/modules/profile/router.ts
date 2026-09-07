import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { AuthVariables } from "../auth/types";
import { updateProfileSchema } from "./schema";
import { updateProfile } from "./services";

export const profileRouter = new Hono<{ Variables: AuthVariables }>().patch(
  "/",
  zValidator("json", updateProfileSchema),
  async (c) => {
    const user = c.get("user");

    if (!user) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const result = await updateProfile(user.id, c.req.valid("json"));

    return c.json(result, 200);
  },
);
