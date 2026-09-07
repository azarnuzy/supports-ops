import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { auth } from "../auth/instance";
import type { AuthVariables } from "../auth/types";
import { EmailAlreadyInUseError, registerAdminWorkspace } from "./services";
import { registerSchema } from "./schema";

export const registrationRouter = new Hono<{ Variables: AuthVariables }>().post(
  "/",
  zValidator("json", registerSchema),
  async (c) => {
    const input = c.req.valid("json");

    try {
      await registerAdminWorkspace(input);
    } catch (error) {
      if (error instanceof EmailAlreadyInUseError) {
        return c.json({ error: "email_in_use", message: error.message }, 409);
      }

      throw error;
    }

    return auth.api.signInEmail({
      asResponse: true,
      body: { email: input.email, password: input.password },
      headers: c.req.raw.headers,
    });
  },
);
