import { randomUUID } from "node:crypto";
import {
  baseMimeType,
  parseWhatsAppWebhook,
  refuseWhatsAppAttachment,
  whatsAppTimerDelayMs,
  verifyWhatsAppSignature,
  type WhatsAppInboundEvent,
} from "@repo/channels";
import { createStorage } from "@repo/storage";
import { Hono } from "hono";
import { storageConfig, toolEncryptionConfig } from "../../config";
import { unscopedPrisma } from "../../utils/prisma";
import { claimMessageSlot } from "../../utils/session-messages";
import { decryptToolSecret } from "../tools/secrets";
import { publishTicketQueueEvent, publishWidgetEvent } from "../widget/realtime";
import { enqueueWhatsAppTurn } from "./queue";
import { resetTimersAfterCustomerMessage } from "../follow-up/queue";

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
    const appSecret = decryptToolSecret(config.appSecretEncrypted, toolEncryptionConfig.masterKey);
    if (!(await verifyWhatsAppSignature(rawBody, signature, appSecret))) {
      return c.text("Invalid signature", 401);
    }
    if (config.channel.status !== "ACTIVE") return c.body(null, 200);

    const accessToken = decryptToolSecret(
      config.accessTokenEncrypted,
      toolEncryptionConfig.masterKey,
    );
    const sessions = new Map<string, { sessionId: string; workspaceId: string }>();
    for (const event of parseWhatsAppWebhook(payload)) {
      if (event.kind === "delivery") {
        const message = await unscopedPrisma.message.findFirst({
          where: { externalMessageId: event.messageId, workspaceId: config.workspaceId },
        });
        if (!message) continue;
        const updated = await unscopedPrisma.message.update({
          data: {
            deliveryFailureReason: event.failureReason ?? null,
            deliveryStatus: event.deliveryStatus,
          },
          where: { id: message.id },
        });
        if (updated.ticketId)
          await publishWidgetEvent(updated.ticketId, { type: "message.updated", data: updated });
        continue;
      }
      if (event.phoneNumberId !== config.phoneNumberId) continue;
      if (event.text === undefined && !event.attachment) continue;

      const seen = await unscopedPrisma.message.findUnique({
        where: {
          workspaceId_externalMessageId: {
            externalMessageId: event.messageId,
            workspaceId: config.workspaceId,
          },
        },
      });
      if (seen) {
        if (seen.ticketId) {
          await publishWidgetEvent(seen.ticketId, { type: "message.created", data: seen });
          await publishTicketQueueEvent(seen.workspaceId);
        }
        sessions.set(seen.sessionId, {
          sessionId: seen.sessionId,
          workspaceId: config.workspaceId,
        });
        continue;
      }

      // Meta's media URLs expire and need the access token, so the file is
      // copied into our own storage now, while it can still be fetched.
      const attachment = event.attachment
        ? await receiveMedia(event.attachment, accessToken)
        : undefined;
      const stored = await persistInboundMessage({
        attachment,
        channelId: config.channelId,
        customerMessageAt: timestampFromMeta(event.timestamp),
        customerName: event.customerName,
        externalMessageId: event.messageId,
        phoneE164: event.from.startsWith("+") ? event.from : `+${event.from}`,
        text: event.text ?? "",
        workspaceId: config.workspaceId,
      });
      if (stored.created && stored.ticketId) {
        await publishWidgetEvent(stored.ticketId, {
          type: "message.created",
          data: stored.message,
        });
        await publishTicketQueueEvent(stored.workspaceId);
        await resetTimersAfterCustomerMessage(stored.ticketId, stored.workspaceId);
      }
      sessions.set(stored.sessionId, stored);
      await markRead(config.phoneNumberId, accessToken, event.messageId);
    }
    await Promise.all([...sessions.values()].map(enqueueWhatsAppTurn));
    return c.body(null, 200);
  });

/** The Customer's blue ticks. Meta only shows them when we ask, and a failure
 * here must not fail the webhook, or Meta retries the whole delivery. */
async function markRead(phoneNumberId: string, accessToken: string, messageId: string) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v23.0/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        body: JSON.stringify({
          message_id: messageId,
          messaging_product: "whatsapp",
          status: "read",
        }),
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) console.warn(`WhatsApp read receipt returned HTTP ${response.status}.`);
  } catch (error) {
    console.warn("WhatsApp read receipt failed.", error);
  }
}

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

type ReceivedMedia = Awaited<ReturnType<typeof receiveMedia>>;

/** A refused file is still recorded, as a failed Attachment with nothing
 * stored, so the turn can tell the Customer why instead of leaving them waiting. */
async function receiveMedia(
  media: NonNullable<Extract<WhatsAppInboundEvent, { kind: "message" }>["attachment"]>,
  accessToken: string,
) {
  const mimeType = baseMimeType(media.mimeType);
  const fileName =
    media.fileName ??
    `${media.type === "audio" ? "voice-note" : media.type}.${mimeType.split("/")[1]}`;
  const headers = { authorization: `Bearer ${accessToken}` };
  // Stickers, videos and other types the Channel cannot read are refused here,
  // before spending a Meta round trip on a file we would throw away anyway.
  const refusedType = refuseWhatsAppAttachment(mimeType, 0);
  if (refusedType) {
    return {
      failureReason: refusedType,
      fileName,
      mimeType,
      processingStatus: "FAILED" as const,
      sizeBytes: 0,
      storageKey: "",
    };
  }
  const infoResponse = await fetch(
    `https://graph.facebook.com/v23.0/${encodeURIComponent(media.id)}`,
    { headers, signal: AbortSignal.timeout(15_000) },
  );
  if (!infoResponse.ok) throw new Error(`Meta media lookup returned HTTP ${infoResponse.status}.`);
  const info = (await infoResponse.json()) as { file_size?: number; url?: string };
  const sizeBytes = Number(info.file_size ?? 0);
  const refusal = refuseWhatsAppAttachment(mimeType, sizeBytes);
  if (refusal || !info.url) {
    return {
      failureReason: refusal ?? "Meta did not provide the file.",
      fileName,
      mimeType,
      processingStatus: "FAILED" as const,
      sizeBytes,
      storageKey: "",
    };
  }

  const file = await fetch(info.url, { headers, signal: AbortSignal.timeout(60_000) });
  if (!file.ok) throw new Error(`Meta media download returned HTTP ${file.status}.`);
  const body = new Uint8Array(await file.arrayBuffer());
  const storageKey = `attachments/inbound/${randomUUID()}`;
  await createStorage(storageConfig).putObject({ body, contentType: mimeType, key: storageKey });
  return {
    failureReason: null,
    fileName,
    mimeType,
    processingStatus: "PROCESSING" as const,
    sizeBytes: body.byteLength,
    storageKey,
  };
}

async function persistInboundMessage(input: {
  attachment?: ReceivedMedia;
  channelId: string;
  customerMessageAt: Date;
  customerName?: string;
  externalMessageId: string;
  phoneE164: string;
  text: string;
  workspaceId: string;
}) {
  return unscopedPrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.channelId}), hashtext(${input.phoneE164}))`;
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
        ticketId: existing.ticketId,
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
        ticket: { select: { assignedHumanAgentId: true, id: true, status: true } },
      },
      where: {
        channelId: input.channelId,
        customerIdentityId: identity.id,
        status: "ACTIVE",
        workspaceId: input.workspaceId,
      },
    });
    if (
      session?.customerLastMessageAt &&
      whatsAppTimerDelayMs(
        session.customerLastMessageAt,
        Number.POSITIVE_INFINITY,
        input.customerMessageAt,
      ) === 0
    ) {
      await tx.session.update({
        data: { closedAt: input.customerMessageAt, status: "CLOSED" },
        where: { id: session.id },
      });
      if (session.ticket && session.ticket.status !== "RESOLVED") {
        await tx.ticket.update({
          data: {
            resolvedAt: input.customerMessageAt,
            resolvedBy: "PLATFORM",
            resolutionReason:
              session.ticket.status === "AI_HANDLING"
                ? "CUSTOMER_INACTIVE"
                : session.ticket.assignedHumanAgentId
                  ? "CUSTOMER_INACTIVE_HUMAN_HANDLING"
                  : "CUSTOMER_INACTIVE_SHARED_QUEUE",
            status: "RESOLVED",
          },
          where: { id: session.ticket.id },
        });
      }
      session = null;
    }
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
          ticket: { select: { assignedHumanAgentId: true, id: true, status: true } },
        },
      });
    }
    const message = await tx.message.create({
      data: {
        ...(await claimMessageSlot(tx, session.id)),
        ...(input.attachment
          ? {
              attachments: {
                create: {
                  ...input.attachment,
                  id: randomUUID(),
                  ticketId: session.ticket?.id ?? null,
                  workspaceId: input.workspaceId,
                },
              },
            }
          : {}),
        content: input.text,
        externalMessageId: input.externalMessageId,
        message: { content: input.text },
        role: "user",
        senderType: "CUSTOMER",
        ticketId: session.ticket?.id ?? null,
        workspaceId: input.workspaceId,
      },
    });
    if (!session.customerLastMessageAt || input.customerMessageAt > session.customerLastMessageAt) {
      await tx.session.update({
        data: { customerLastMessageAt: input.customerMessageAt },
        where: { id: session.id },
      });
    }
    return {
      created: true,
      message,
      sessionId: session.id,
      ticketId: session.ticket?.id ?? null,
      workspaceId: input.workspaceId,
    };
  });
}

function timestampFromMeta(value: string) {
  const date = new Date(Number(value) * 1_000);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
