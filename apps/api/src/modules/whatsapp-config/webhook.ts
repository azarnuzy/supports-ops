import { randomUUID } from "node:crypto";
import { parseWhatsAppWebhook, verifyWhatsAppSignature } from "@repo/channels";
import { Hono } from "hono";
import { toolEncryptionConfig } from "../../config";
import { unscopedPrisma } from "../../utils/prisma";
import { claimMessageSlot } from "../../utils/session-messages";
import { decryptToolSecret } from "../tools/secrets";
import { enqueueWhatsAppTurn } from "./queue";

export const whatsAppWebhookRouter = new Hono()
  .get("/", async (c) => {
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
  })
  .post("/", async (c) => {
    const rawBody = new Uint8Array(await c.req.arrayBuffer());
    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      return c.text("Invalid payload", 400);
    }

    const phoneNumberId = findPhoneNumberId(payload);
    if (!phoneNumberId) return c.text("Invalid payload", 400);
    const config = await unscopedPrisma.whatsAppConfig.findUnique({
      include: { channel: { select: { status: true } } },
      where: { phoneNumberId },
    });
    if (!config) return c.text("Unknown phone number", 404);

    const signature = c.req.header("x-hub-signature-256") ?? "";
    const appSecret = decryptToolSecret(
      config.appSecretEncrypted,
      toolEncryptionConfig.masterKey,
    );
    if (!(await verifyWhatsAppSignature(rawBody, signature, appSecret))) {
      return c.text("Invalid signature", 401);
    }
    if (config.channel.status !== "ACTIVE") return c.body(null, 200);

    const sessions = new Map<string, { sessionId: string; workspaceId: string }>();
    for (const event of parseWhatsAppWebhook(payload)) {
      if (event.kind === "delivery") {
        await unscopedPrisma.message.updateMany({
          data: {
            deliveryStatus: event.deliveryStatus,
            ...(event.failureReason ? { deliveryFailureReason: event.failureReason } : {}),
          },
          where: { externalMessageId: event.messageId, workspaceId: config.workspaceId },
        });
        continue;
      }
      if (event.phoneNumberId !== config.phoneNumberId || event.text === undefined) continue;

      const stored = await persistInboundText({
        channelId: config.channelId,
        customerMessageAt: timestampFromMeta(event.timestamp),
        customerName: event.customerName,
        externalMessageId: event.messageId,
        phoneE164: event.from.startsWith("+") ? event.from : `+${event.from}`,
        text: event.text,
        workspaceId: config.workspaceId,
      });
      sessions.set(stored.sessionId, stored);
    }
    await Promise.all([...sessions.values()].map(enqueueWhatsAppTurn));
    return c.body(null, 200);
  });

function findPhoneNumberId(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const entry = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entry)) return undefined;
  for (const item of entry) {
    const changes =
      item && typeof item === "object" ? (item as { changes?: unknown }).changes : null;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const value = (change as { value?: unknown }).value;
      if (!value || typeof value !== "object") continue;
      const metadata = (value as { metadata?: unknown }).metadata;
      if (!metadata || typeof metadata !== "object") continue;
      const id = (metadata as { phone_number_id?: unknown }).phone_number_id;
      if (typeof id === "string") return id;
    }
  }
}

async function persistInboundText(input: {
  channelId: string;
  customerMessageAt: Date;
  customerName?: string;
  externalMessageId: string;
  phoneE164: string;
  text: string;
  workspaceId: string;
}) {
  return unscopedPrisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.channelId}), hashtext(${input.phoneE164}))`;
    const existing = await tx.message.findUnique({
      where: {
        workspaceId_externalMessageId: {
          externalMessageId: input.externalMessageId,
          workspaceId: input.workspaceId,
        },
      },
    });
    if (existing) {
      return {
        created: false,
        sessionId: existing.sessionId,
        workspaceId: input.workspaceId,
      };
    }

    const identity = await tx.customerIdentity.upsert({
      create: {
        canonicalId: input.phoneE164,
        channelType: "WHATSAPP",
        email: null,
        id: randomUUID(),
        name: input.customerName ?? input.phoneE164,
        phoneE164: input.phoneE164,
        workspaceId: input.workspaceId,
      },
      update: {
        ...(input.customerName ? { name: input.customerName } : {}),
        phoneE164: input.phoneE164,
      },
      where: {
        workspaceId_channelType_canonicalId: {
          canonicalId: input.phoneE164,
          channelType: "WHATSAPP",
          workspaceId: input.workspaceId,
        },
      },
    });
    let session = await tx.session.findFirst({
      orderBy: { createdAt: "desc" },
      select: {
        customerLastMessageAt: true,
        id: true,
        ticket: { select: { id: true } },
      },
      where: {
        channelId: input.channelId,
        customerIdentityId: identity.id,
        status: "ACTIVE",
        workspaceId: input.workspaceId,
      },
    });
    if (!session) {
      const sessionId = randomUUID();
      session = await tx.session.create({
        data: {
          channelId: input.channelId,
          customerIdentityId: identity.id,
          id: sessionId,
          workspaceId: input.workspaceId,
          conversation: {
            create: {
              id: randomUUID(),
              metadata: {},
              scopeKey: `session:${sessionId}`,
              userId: identity.id,
              workspaceId: input.workspaceId,
            },
          },
        },
        select: {
          customerLastMessageAt: true,
          id: true,
          ticket: { select: { id: true } },
        },
      });
    }
    await tx.message.create({
      data: {
        ...(await claimMessageSlot(tx, session.id)),
        content: input.text,
        externalMessageId: input.externalMessageId,
        message: { content: input.text },
        role: "user",
        senderType: "CUSTOMER",
        ticketId: session.ticket?.id ?? null,
        workspaceId: input.workspaceId,
      },
    });
    if (
      !session.customerLastMessageAt ||
      input.customerMessageAt > session.customerLastMessageAt
    ) {
      await tx.session.update({
        data: { customerLastMessageAt: input.customerMessageAt },
        where: { id: session.id },
      });
    }
    return { created: true, sessionId: session.id, workspaceId: input.workspaceId };
  });
}

function timestampFromMeta(value: string) {
  const date = new Date(Number(value) * 1_000);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
