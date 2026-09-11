import { randomUUID } from "node:crypto";
import { classifyMessage, createClassificationModel } from "@repo/ai-agent";
import { generateAiReply } from "@repo/api/ai-agent-turn";
import { decryptToolSecret } from "@repo/api/secrets";
import { enqueueWhatsAppDelivery, type WhatsAppDeliveryJob } from "@repo/api/whatsapp-queue";
import { classifyWhatsAppError, renderWhatsAppMessage } from "@repo/channels";
import { UnrecoverableError } from "bullmq";
import { classificationConfig } from "./config";
import { claimMessageSlot } from "./follow-up";
import { prisma } from "./prisma";

export type WhatsAppTurnJob = { sessionId: string; workspaceId: string };

export async function processWhatsAppTurn(job: { data: WhatsAppTurnJob }) {
  const session = await prisma.session.findFirst({
    include: {
      channel: { include: { whatsAppConfig: true } },
      messages: { orderBy: { position: "asc" } },
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

  // Once a Ticket leaves AI_HANDLING the AI Agent never speaks again; a person owns it.
  if (session.ticket && session.ticket.status !== "AI_HANDLING") {
    return deliverPendingMessages(session.id);
  }

  const customerMessage = incoming.map((message) => message.content).join("\n");
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
          content: message.content,
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

async function appendReply(
  sessionId: string,
  workspaceId: string,
  inboundId: string,
  content: string,
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
  for (const message of messages) await enqueueWhatsAppDelivery(message.id);
}

export async function processWhatsAppDelivery(job: {
  attemptsMade: number;
  data: WhatsAppDeliveryJob;
  opts: { attempts?: number };
}) {
  try {
    await deliverMessage(job.data.messageId);
  } catch (error) {
    // A transient failure that exhausts its retries must still end visibly failed.
    if (!(error instanceof UnrecoverableError) && job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
      await prisma.message.update({
        data: {
          deliveryFailureReason: error instanceof Error ? error.message : "Delivery failed.",
          deliveryStatus: "FAILED",
        },
        where: { id: job.data.messageId },
      });
    }
    throw error;
  }
}

async function deliverMessage(messageId: string) {
  const message = await prisma.message.findUniqueOrThrow({
    include: {
      session: {
        include: {
          channel: { include: { whatsAppConfig: true } },
          customerIdentity: { select: { phoneE164: true } },
        },
      },
    },
    where: { id: messageId },
  });
  if (message.deliveryStatus !== "PENDING") return;
  const config = message.session.channel.whatsAppConfig;
  const phone = message.session.customerIdentity.phoneE164;
  if (!config || !phone) {
    throw new UnrecoverableError("WhatsApp delivery configuration is missing.");
  }

  const accessToken = decryptToolSecret(config.accessTokenEncrypted, requiredMasterKey());
  let response: Response;
  try {
    response = await fetch(
      `https://graph.facebook.com/v23.0/${encodeURIComponent(config.phoneNumberId)}/messages`,
      {
        body: JSON.stringify(
          renderWhatsAppMessage({ text: message.content, to: phone.replace(/^\+/, "") }),
        ),
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
    // Meta code 190 / HTTP 401: the access token itself stopped working.
    if (body.error?.code === 190 || response.status === 401) {
      await prisma.whatsAppConfig.update({
        data: { accessTokenFailedAt: new Date() },
        where: { id: config.id },
      });
    }
    if (kind === "permanent") throw new UnrecoverableError(reason);
    throw new Error(reason);
  }

  const providerMessageId = body.messages?.[0]?.id;
  await prisma.message.update({
    data: {
      deliveryAttempts: { increment: 1 },
      deliveryFailureReason: null,
      deliveryStatus: "SENT",
      ...(providerMessageId ? { externalMessageId: providerMessageId } : {}),
    },
    where: { id: message.id },
  });
  if (config.accessTokenFailedAt) {
    await prisma.whatsAppConfig.update({
      data: { accessTokenFailedAt: null },
      where: { id: config.id },
    });
  }
}

function requiredMasterKey() {
  const key = process.env.TOOL_MASTER_KEY;
  if (!key) throw new Error("TOOL_MASTER_KEY is required to decrypt WhatsApp credentials.");
  return key;
}
