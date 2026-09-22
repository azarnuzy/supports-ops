import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { requireAdmin } from "../auth/guards";
import type { AuthVariables } from "../auth/types";
import { MayarUnavailableError } from "./mayar";
import {
  createTopUpCheckout,
  getBilling,
  handleMayarWebhook,
  UnknownTopUpPackError,
} from "./services";

export const billingRouter = new Hono<{ Variables: AuthVariables }>()
  .get("/", async (c) => {
    if (!requireAdmin(c)) return c.json({ error: "forbidden" }, 403);
    return c.json({ billing: await getBilling() }, 200);
  })
  .post("/checkout", zValidator("json", z.object({ packId: z.string().min(1) })), async (c) => {
    const admin = requireAdmin(c);
    if (!admin) return c.json({ error: "forbidden" }, 403);
    try {
      const payment = await createTopUpCheckout({
        adminEmail: admin.email,
        packId: c.req.valid("json").packId,
      });
      return c.json({ payment }, 201);
    } catch (error) {
      if (error instanceof UnknownTopUpPackError) return c.json({ error: "unknown_pack" }, 400);
      if (error instanceof MayarUnavailableError) {
        return c.json({ error: "payments_unavailable" }, 503);
      }
      throw error;
    }
  });

/** Unauthenticated by necessity; safe because the body is never trusted (ADR-0023). */
export const mayarWebhookRouter = new Hono().post("/", async (c) => {
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return c.text("Invalid payload", 400);
  }
  await handleMayarWebhook(payload);
  return c.body(null, 200);
});
