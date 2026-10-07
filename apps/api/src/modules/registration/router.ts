import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { auth } from "../auth/instance";
import type { AuthVariables } from "../auth/types";
import { betterAuthConfig } from "../../config";
import { EmailAlreadyInUseError, registerAdminWorkspace } from "./services";
import { registerSchema } from "./schema";

// The Platform is the first client origin; Better Auth redirects here after the link is followed.
const verifyEmailCallbackUrl = new URL(
  "/verify-email",
  betterAuthConfig.trustedOrigins[0],
).toString();

export const registrationRouter = new Hono<{ Variables: AuthVariables }>().post(
  "/",
  zValidator("json", registerSchema),
  async (c) => {
    const input = c.req.valid("json");

    try {
      await registerAdminWorkspace(input);
    } catch (error) {
      if (error instanceof EmailAlreadyInUseError) {
        return c.json(
          {
            error: error.unverified ? "email_unverified" : "email_in_use",
            message: error.message,
          },
          409,
        );
      }

      throw error;
    }

    await auth.api.sendVerificationEmail({
      body: { email: input.email, callbackURL: verifyEmailCallbackUrl },
    });

    return c.json({ status: "verification_sent" as const }, 201);
  },
);
