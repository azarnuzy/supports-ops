import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAdmin } from "../auth/guards";
import type { AuthVariables } from "../auth/types";
import {
  replaceWhatsAppCredentialsSchema,
  updateWhatsAppConfigSchema,
  verifyWhatsAppConfigSchema,
} from "./schema";
import {
  connectWhatsApp,
  getWhatsAppConfig,
  InvalidWhatsAppCredentialsError,
  PhoneNumberAlreadyConnectedError,
  replaceWhatsAppCredentials,
  setWhatsAppEnabled,
  WhatsAppAlreadyConnectedError,
  WhatsAppConfigNotFoundError,
} from "./services";

export const whatsAppConfigRouter = new Hono<{ Variables: AuthVariables }>()
  .use("*", async (c, next) => {
    if (!requireAdmin(c)) return c.json({ error: "forbidden" }, 403);
    await next();
  })
  .get("/", async (c) => c.json(await getWhatsAppConfig(), 200))
  .post("/verify", zValidator("json", verifyWhatsAppConfigSchema), async (c) => {
    try {
      return c.json(await connectWhatsApp(c.req.valid("json")), 201);
    } catch (error) {
      if (error instanceof InvalidWhatsAppCredentialsError) {
        return c.json({ error: "invalid_credentials", message: error.message }, 422);
      }
      if (
        error instanceof PhoneNumberAlreadyConnectedError ||
        error instanceof WhatsAppAlreadyConnectedError
      ) {
        return c.json({ error: "already_connected", message: error.message }, 409);
      }
      throw error;
    }
  })
  .patch("/credentials", zValidator("json", replaceWhatsAppCredentialsSchema), async (c) => {
    try {
      return c.json(await replaceWhatsAppCredentials(c.req.valid("json")), 200);
    } catch (error) {
      if (error instanceof InvalidWhatsAppCredentialsError) {
        return c.json({ error: "invalid_credentials", message: error.message }, 422);
      }
      if (error instanceof WhatsAppConfigNotFoundError) {
        return c.json({ error: "not_found", message: "No WhatsApp Channel is connected." }, 404);
      }
      throw error;
    }
  })
  .patch("/", zValidator("json", updateWhatsAppConfigSchema), async (c) => {
    try {
      return c.json(await setWhatsAppEnabled(c.req.valid("json").enabled), 200);
    } catch (error) {
      if (error instanceof WhatsAppConfigNotFoundError) {
        return c.json({ error: "not_found", message: "No WhatsApp Channel is connected." }, 404);
      }
      throw error;
    }
  });
