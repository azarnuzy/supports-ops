import { randomUUID } from "node:crypto";
import { classifyMessage, createClassificationModel } from "@repo/ai-agent";
import { generateAiReply } from "@repo/api/ai-agent-turn";
import { decryptToolSecret } from "@repo/api/secrets";
import { classifyWhatsAppError, renderWhatsAppMessage } from "@repo/channels";
import { createStorage } from "@repo/storage";
import { UnrecoverableError } from "bullmq";
import { extractAttachment } from "./attachment-process";
import { classificationConfig, storageConfig } from "./config";
import { claimMessageSlot } from "./follow-up";
import { prisma } from "./prisma";

export type WhatsAppTurnJob = { sessionId: string; workspaceId: string };

export async function processWhatsAppTurn(job: { data: WhatsAppTurnJob }) {
  const session = await prisma.session.findFirst({
    include: {
      channel: { include: { whatsAppConfig: true } },
      messages: {
        include: { attachments: { where: { deletedAt: null } } },
        orderBy: { position: "asc" },
      },
      ticket: true,
    },
    where: { id: job.data.sessionId, status: "ACTIVE", workspaceId: job.data.workspaceId },
  });
  if (!session?.channel.whatsAppConfig) return;

  const lastReplyPosition =
    [...session.messages].reverse().find((message) => message.senderType !== "CUSTOMER")
      ?.position ?? 0;
  const incoming = session.messages.filter(
    (message) => message.senderType === "CUSTOMER" && message.position > lastReplyPosition,
  );
  if (!incoming.length) return deliverPendingMessages(session.id);

  for (const attachment of incoming.flatMap((message) => message.attachments)) {
    if (attachment.processingStatus === "PROCESSING") Object.assign(attachment, await read(attachment));
  }
  const unreadable = incoming.flatMap((message) => message.attachments);
  if (
    !incoming.some(
      (message) =>
        message.content.trim() ||
        message.attachments.some((attachment) => attachment.processingStatus === "READY"),
    )
  ) {
    await appendReply(
      session.id,
      session.workspaceId,
      incoming.at(-1)?.externalMessageId ?? randomUUID(),
      unreadable.map(customerFacingFailure).join("\n"),
      session.ticket?.id ?? null,
    );
    return deliverPendingMessages(session.id);
  }

  const customerMessage = incoming.map(describeCustomerMessage).join("\n");
  let ticketId = session.ticket?.id;
  if (!ticketId) {
    if (!classificationConfig.apiKey) throw new Error("OPENROUTER_API_KEY is required.");
    const categories = await prisma.ticketCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      where: { workspaceId: session.workspaceId },
    });
    const decision = await classifyMessage({
      categories: categories.length
        ? categories.map(({ description, isFallback, key, label }) => ({
            description,
            isFallback,
            key,
            label,
          }))
        : [
            {
              description: "Other support requests",
              isFallback: true,
              key: "GENERAL",
              label: "General",
            },
          ],
      content: customerMessage,
      history: session.messages
        .filter((message) => message.position < incoming[0].position)
        .map((message) => ({
          content:
            message.senderType === "CUSTOMER" ? describeCustomerMessage(message) : message.content,
          role: message.senderType === "CUSTOMER" ? ("customer" as const) : ("agent" as const),
        })),
      model: createClassificationModel({
        ...classificationConfig,
        apiKey: classificationConfig.apiKey,
      }),
    });
    if (!decision.qualifies) {
      await appendReply(
        session.id,
        session.workspaceId,
        incoming.at(-1)?.externalMessageId ?? randomUUID(),
        decision.reply,
      );
      return deliverPendingMessages(session.id);
    }
    ticketId = await createTicket(session.id, decision);
  }

  await generateAiReply(ticketId, session.workspaceId, customerMessage);
  await deliverPendingMessages(session.id);
}

async function createTicket(
  sessionId: string,
  decision: { category: string; priority: "LOW" | "NORMAL" | "HIGH"; title: string },
) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.session.findUniqueOrThrow({
      include: { channel: { select: { aiAgentId: true } } },
      where: { id: sessionId },
    });
    const ticketId = randomUUID();
    await tx.ticket.create({
      data: {
        aiAgentId: session.channel.aiAgentId,
        category: decision.category,
        channelId: session.channelId,
        customerIdentityId: session.customerIdentityId,
        id: ticketId,
        priority: decision.priority,
        sessionId,
        title: decision.title,
        workspaceId: session.workspaceId,
      },
    });
    await tx.message.updateMany({ data: { ticketId }, where: { sessionId, ticketId: null } });
    await tx.attachment.updateMany({
      data: { ticketId },
      where: { message: { sessionId }, ticketId: null },
    });
    await tx.aiActivity.createMany({
      data: [
        {
          eventType: "TICKET_CREATED",
          id: randomUUID(),
          metadata: decision,
          ticketId,
          workspaceId: session.workspaceId,
        },
        {
          eventType: "CLASSIFIED",
          id: randomUUID(),
          metadata: { ...decision, isSupportRequest: true },
          ticketId,
          workspaceId: session.workspaceId,
        },
      ],
    });
    return ticketId;
  });
}

type TurnAttachment = {
  extractedText: string | null;
  failureReason: string | null;
  fileName: string;
  id: string;
  mimeType: string;
  processingStatus: "PROCESSING" | "READY" | "FAILED";
  storageKey: string;
};

/** Extraction happens before the turn so the AI Agent never reasons over an
 * empty context; a failure is recorded rather than silently skipped. */
async function read(attachment: TurnAttachment) {
  try {
    const extractedText = await extractAttachment(attachment.storageKey, attachment.mimeType);
    if (!extractedText.trim()) throw new Error("The attachment did not contain readable text.");
    return prisma.attachment.update({
      data: { extractedText, failureReason: null, processingStatus: "READY" },
      where: { id: attachment.id },
    });
  } catch (error) {
    return prisma.attachment.update({
      data: {
        failureReason: error instanceof Error ? error.message : "Attachment processing failed.",
        processingStatus: "FAILED",
      },
      where: { id: attachment.id },
    });
  }
}

/** A transcript stays labelled as Attachment content, so a mis-heard word is
 * never mistaken for something the Customer typed. */
function describeCustomerMessage(message: { attachments: TurnAttachment[]; content: string }) {
  return [
    message.content,
    ...message.attachments.map((attachment) =>
      attachment.processingStatus === "READY"
        ? `[${attachment.mimeType.startsWith("audio/") ? "Automatic transcript of a voice note — may contain mistakes" : `Content of attached file ${attachment.fileName}`}]\n${attachment.extractedText}`
        : `[Attached file ${attachment.fileName} could not be read. Tell the Customer.]`,
    ),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function customerFacingFailure(attachment: TurnAttachment) {
  // Nothing is stored for a file the Channel refused; its reason is already Customer-facing.
  return !attachment.storageKey && attachment.failureReason
    ? attachment.failureReason
    : `Sorry, we couldn't read ${attachment.fileName}. Could you describe the problem in a message?`;
}

async function appendReply(
  sessionId: string,
  workspaceId: string,
  inboundId: string,
  content: string,
  ticketId: string | null = null,
) {
  await prisma.$transaction(async (tx) => {
    const externalMessageId = `whatsapp-reply:${inboundId}`;
    if (
      await tx.message.findUnique({
        where: { workspaceId_externalMessageId: { externalMessageId, workspaceId } },
      })
    )
      return;
    const memory = await tx.conversation.findUniqueOrThrow({ where: { sessionId } });
    await tx.message.create({
      data: {
        ...(await claimMessageSlot(tx, sessionId, memory.id)),
        content,
        deliveryStatus: "PENDING",
        externalMessageId,
        message: { content },
        role: "assistant",
        senderType: "AI_AGENT",
        ticketId,
        workspaceId,
      },
    });
  });
}

async function deliverPendingMessages(sessionId: string) {
  const messages = await prisma.message.findMany({
    orderBy: { position: "asc" },
    where: { deliveryStatus: "PENDING", senderType: { not: "CUSTOMER" }, sessionId },
  });
  for (const message of messages) await deliverMessage(message.id);
}

async function deliverMessage(messageId: string) {
  const message = await prisma.message.findUniqueOrThrow({
    include: {
      attachments: { where: { deletedAt: null } },
      session: {
        include: {
          channel: { include: { whatsAppConfig: true } },
          customerIdentity: { select: { phoneE164: true } },
        },
      },
    },
    where: { id: messageId },
  });
  const config = message.session.channel.whatsAppConfig;
  const phone = message.session.customerIdentity.phoneE164;
  if (!config || !phone) {
    throw new UnrecoverableError("WhatsApp delivery configuration is missing.");
  }

  const accessToken = decryptToolSecret(config.accessTokenEncrypted, requiredMasterKey());
  const to = phone.replace(/^\+/, "");
  const [attachment] = message.attachments;
  let response: Response;
  try {
    const payload = attachment
      ? renderWhatsAppMessage({
          attachment: {
            caption: message.content || undefined,
            fileName: attachment.fileName,
            id: await uploadMedia(config.phoneNumberId, accessToken, attachment),
            type: attachment.mimeType.startsWith("image/")
              ? "image"
              : attachment.mimeType.startsWith("audio/")
                ? "audio"
                : "document",
          },
          to,
        })
      : renderWhatsAppMessage({ text: message.content, to });
    response = await fetch(
      `https://graph.facebook.com/v23.0/${encodeURIComponent(config.phoneNumberId)}/messages`,
      {
        body: JSON.stringify(payload),
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch (error) {
    await prisma.message.update({
      data: { deliveryAttempts: { increment: 1 } },
      where: { id: message.id },
    });
    throw error;
  }

  const body = (await response.json().catch(() => ({}))) as {
    error?: { code?: number; message?: string };
    messages?: { id?: string }[];
  };
  if (!response.ok) {
    const reason = body.error?.message ?? `Meta returned HTTP ${response.status}.`;
    const kind = classifyWhatsAppError({ code: body.error?.code, status: response.status });
    await prisma.message.update({
      data: {
        deliveryAttempts: { increment: 1 },
        ...(kind === "permanent" ? { deliveryFailureReason: reason, deliveryStatus: "FAILED" } : {}),
      },
      where: { id: message.id },
    });
    if (kind === "permanent") throw new UnrecoverableError(reason);
    throw new Error(reason);
  }

  const providerMessageId = body.messages?.[0]?.id;
  await prisma.message.update({
    data: {
      deliveryAttempts: { increment: 1 },
      deliveryStatus: "SENT",
      ...(providerMessageId ? { externalMessageId: providerMessageId } : {}),
    },
    where: { id: message.id },
  });
}

/** Meta's media id is used for this one send and then discarded; storage
 * stays the source of truth for the file. */
async function uploadMedia(
  phoneNumberId: string,
  accessToken: string,
  attachment: { fileName: string; mimeType: string; storageKey: string },
) {
  const object = await createStorage(storageConfig).getObject(attachment.storageKey);
  if (!object.Body) throw new UnrecoverableError("Attachment file is missing.");
  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", attachment.mimeType);
  form.set(
    "file",
    new Blob([new Uint8Array(await object.Body.transformToByteArray())], {
      type: attachment.mimeType,
    }),
    attachment.fileName,
  );
  const response = await fetch(
    `https://graph.facebook.com/v23.0/${encodeURIComponent(phoneNumberId)}/media`,
    {
      body: form,
      headers: { authorization: `Bearer ${accessToken}` },
      method: "POST",
      signal: AbortSignal.timeout(60_000),
    },
  );
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    id?: string;
  };
  if (!response.ok || !body.id)
    throw new Error(body.error?.message ?? `Meta media upload returned HTTP ${response.status}.`);
  return body.id;
}

function requiredMasterKey() {
  const key = process.env.TOOL_MASTER_KEY;
  if (!key) throw new Error("TOOL_MASTER_KEY is required to decrypt WhatsApp credentials.");
  return key;
}
