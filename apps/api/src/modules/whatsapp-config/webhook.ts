import { Hono } from "hono";
import { unscopedPrisma } from "../../utils/prisma";

export const whatsAppWebhookRouter = new Hono().get("/", async (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  if (mode !== "subscribe" || !token || !challenge) return c.text("Invalid verification", 400);

  const config = await unscopedPrisma.whatsAppConfig.findUnique({
    select: { id: true },
    where: { verifyToken: token },
  });
  if (!config) return c.text("Invalid verify token", 403);
  await unscopedPrisma.whatsAppConfig.update({
    data: { webhookVerifiedAt: new Date() },
    where: { id: config.id },
  });
  return c.text(challenge, 200);
});
