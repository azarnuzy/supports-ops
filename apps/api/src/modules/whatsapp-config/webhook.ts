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
import {
  injectTraceContext,
  sessionAttributes,
  withSpan,
  withTraceContext,
} from "@repo/logger/telemetry";
import { Hono } from "hono";
import { storageConfig, toolEncryptionConfig } from "../../config";
import { unscopedPrisma } from "../../utils/prisma";
import {
  externalErrorCode,
  externalHttpStatus,
  recordExternalError,
} from "../../utils/external-errors";
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
    const sessions = new Map<
      string,
      { sessionId: string; workspaceId: string; traceContext?: Record<string, string> }
    >();
    for (const event of parseWhatsAppWebhook(payload)) {
      if (event.kind === "delivery") {
        // A delivery callback names the id Meta gave the Message it carried,
        // which is recorded as `providerMessageId`. The inbound branch below
        // matches on `externalMessageId` instead, where an inbound Message's
        // Meta id is its idempotency key.
        const message = await unscopedPrisma.message.findFirst({
          where: { providerMessageId: event.messageId, workspaceId: config.workspaceId },
        });
        if (!message) continue;
        await withSpan(
          "support.whatsapp_delivery_callback",
          {
            ...sessionAttributes(message.sessionId),
            "anvia.trace.name": "support.whatsapp_delivery_callback",
            "langfuse.trace.name": "support.whatsapp_delivery_callback",
            "supportops.workspace_id": config.workspaceId,
            "supportops.message_id": message.id,
          },
          async (span) => {
            const updated = await unscopedPrisma.message.update({
              data: {
                deliveryFailureReason: event.failureReason ?? null,
                deliveryStatus: event.deliveryStatus,
              },
              where: { id: message.id },
            });
            if (event.deliveryStatus === "FAILED")
              await recordExternalError(unscopedPrisma, {
                provider: "META_WHATSAPP",
                operation: "DELIVERY_CALLBACK",
                workspaceId: config.workspaceId,
                resourceType: "MESSAGE",
                resourceId: message.id,
                code: "DELIVERY_FAILED",
              });
            span.setAttribute("supportops.delivery_status", event.deliveryStatus);
            if (updated.ticketId)
              await publishWidgetEvent(updated.ticketId, {
                type: "message.updated",
                data: updated,
              });
            return event.deliveryStatus;
          },
          false,
          (status) => status === "FAILED",
        );
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

      const stored = await withSpan(
        "support.whatsapp_inbound",
        {
          "anvia.trace.name": "support.whatsapp_inbound",
          "langfuse.trace.name": "support.whatsapp_inbound",
          "supportops.workspace_id": config.workspaceId,
          "supportops.provider_message_id": event.messageId,
        },
        async (span) => {
          // Meta's media URLs expire, so copy the file while it can still be fetched.
          const media = event.attachment;
          const attachment = media
            ? await withSpan(
                "external.meta_whatsapp.media_receive",
                {
                  "external.provider": "META_WHATSAPP",
                  "external.operation": "MEDIA_RECEIVE",
                  "supportops.media_id": media.id,
                },
                async () => receiveMedia(media, accessToken, config.workspaceId),
                false,
              )
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
          span.setAttributes(sessionAttributes(stored.sessionId));
          if (stored.created && stored.ticketId) {
            await publishWidgetEvent(stored.ticketId, {
              type: "message.created",
              data: stored.message,
            });
            await publishTicketQueueEvent(stored.workspaceId);
            await resetTimersAfterCustomerMessage(stored.ticketId, stored.workspaceId);
          }
          await markRead(
            config.phoneNumberId,
            accessToken,
            event.messageId,
            config.workspaceId,
            stored.sessionId,
          );
          return { ...stored, traceContext: injectTraceContext() };
        },
        false,
      );
      sessions.set(stored.sessionId, stored);
    }
    await Promise.all(
      [...sessions.values()].map((session) =>
        withTraceContext(session.traceContext, () =>
          withSpan(
            "support.whatsapp_enqueue",
            {
              ...sessionAttributes(session.sessionId),
              "anvia.trace.name": "support.whatsapp_turn",
              "langfuse.trace.name": "support.whatsapp_turn",
              "supportops.workspace_id": session.workspaceId,
            },
            async () => enqueueWhatsAppTurn(session),
            false,
          ),
        ),
      ),
    );
    return c.body(null, 200);
  });

/** The Customer's blue ticks. Meta only shows them when we ask, and a failure
 * here must not fail the webhook, or Meta retries the whole delivery. */
async function markRead(
  phoneNumberId: string,
  accessToken: string,
  messageId: string,
  workspaceId: string,
  sessionId: string,
) {
  return withSpan(
    "external.meta_whatsapp.read_receipt",
    {
      ...sessionAttributes(sessionId),
      "external.provider": "META_WHATSAPP",
      "external.operation": "READ_RECEIPT",
      "supportops.workspace_id": workspaceId,
      "supportops.provider_message_id": messageId,
    },
    async (span) => {
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
        span.setAttribute("http.response.status_code", response.status);
        span.setAttribute("supportops.read_receipt_sent", response.ok);
        if (!response.ok)
          await recordExternalError(unscopedPrisma, {
            provider: "META_WHATSAPP",
            operation: "READ_RECEIPT",
            workspaceId,
            resourceType: "MESSAGE",
            resourceId: messageId,
            httpStatus: response.status,
          });
        return response.ok;
      } catch (error) {
        span.setAttribute("supportops.read_receipt_sent", false);
        const httpStatus = externalHttpStatus(error);
        if (httpStatus) span.setAttribute("http.response.status_code", httpStatus);
        await recordExternalError(unscopedPrisma, {
          provider: "META_WHATSAPP",
          operation: "READ_RECEIPT",
          workspaceId,
          resourceType: "MESSAGE",
          resourceId: messageId,
          code: externalErrorCode(error),
          httpStatus: externalHttpStatus(error),
        });
        console.warn("WhatsApp read receipt failed.", error);
        return false;
      }
    },
    false,
    (ok) => !ok,
  );
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
  workspaceId: string,
) {
  let receivingFromMeta = true;
  try {
    const mimeType = baseMimeType(media.mimeType);
    const fileName =
      media.fileName ??
      `${media.type === "audio" ? "voice-note" : media.type}.${mimeType.split("/")[1]}`;
    const headers = { authorization: `Bearer ${accessToken}` };
    const infoResponse = await fetch(
      `https://graph.facebook.com/v23.0/${encodeURIComponent(media.id)}`,
      { headers, signal: AbortSignal.timeout(15_000) },
    );
    if (!infoResponse.ok)
      throw Object.assign(new Error("Meta media lookup failed."), { status: infoResponse.status });
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
    if (!file.ok)
      throw Object.assign(new Error("Meta media download failed."), { status: file.status });
    const body = new Uint8Array(await file.arrayBuffer());
    const storageKey = `attachments/inbound/${randomUUID()}`;
    receivingFromMeta = false;
    await createStorage(storageConfig).putObject({ body, contentType: mimeType, key: storageKey });
    return {
      failureReason: null,
      fileName,
      mimeType,
      processingStatus: "PROCESSING" as const,
      sizeBytes: body.byteLength,
      storageKey,
    };
  } catch (error) {
    if (receivingFromMeta)
      await recordExternalError(unscopedPrisma, {
        provider: "META_WHATSAPP",
        operation: "MEDIA_RECEIVE",
        workspaceId,
        resourceType: "META_MEDIA",
        resourceId: media.id,
        code: externalErrorCode(error),
        httpStatus: externalHttpStatus(error),
      });
    throw error;
  }
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
