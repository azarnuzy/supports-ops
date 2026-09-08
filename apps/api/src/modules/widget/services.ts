import { randomBytes, randomUUID } from "node:crypto";
import {
  ClassificationFailedError,
  classifyMessage,
  createClassificationModel,
  createReplyModel,
  ReplyGenerationFailedError,
  streamReply,
} from "@repo/ai-agent";
import { createOpenAiEmbeddingClient as createEmbeddingClient, searchChunks as findKnowledgeChunks } from "@repo/knowledge";
import { aiAgentConfig, classificationConfig, embeddingConfig } from "../../config";
import { type Message, unscopedPrisma } from "../../utils/prisma";
import { enqueueSessionEmail } from "./session-email";
import type { CustomerMessageInput, PreChatInput } from "./schema";
import { publishWidgetEvent, setTicketGenerating } from "./realtime";

export type PublicWidgetConfig = {
  botName: string;
  primaryColor: string;
  welcomeMessage: string;
};

export class WidgetNotFoundError extends Error {}
export class UnapprovedWidgetOriginError extends Error {}

export class ClassificationNotConfiguredError extends Error {
  constructor() {
    super("Configure OPENROUTER_API_KEY to classify Tickets.");
    this.name = "ClassificationNotConfiguredError";
  }
}

export { ClassificationFailedError };

export class ReplyNotConfiguredError extends Error {
  constructor() {
    super("Configure OPENROUTER_API_KEY to generate AI Agent replies.");
    this.name = "ReplyNotConfiguredError";
  }
}

export type CreateCustomerMessageResult =
  | { kind: "message"; created: boolean; message: Message }
  | { kind: "reply"; reply: string };

export async function getApprovedWidget(widgetKey: string, origin: string) {
  const config = await unscopedPrisma.webWidgetConfig.findUnique({
    where: { widgetKey },
    select: {
      allowedDomains: true,
      botName: true,
      channelId: true,
      primaryColor: true,
      welcomeMessage: true,
      workspaceId: true,
    },
  });

  if (!config) throw new WidgetNotFoundError();
  if (!isAllowedOrigin(origin, config.allowedDomains)) throw new UnapprovedWidgetOriginError();

  return config;
}

export async function createWebSession(input: PreChatInput, origin: string) {
  const config = await getApprovedWidget(input.widgetKey, origin);
  const accessToken = randomBytes(32).toString("base64url");

  const session = await unscopedPrisma.$transaction(async (tx) => {
    const customerIdentity = await tx.customerIdentity.create({
      data: {
        channelType: "WEB",
        email: input.email,
        id: randomUUID(),
        name: input.name,
        workspaceId: config.workspaceId,
      },
    });

    return tx.webSession.create({
      data: {
        accessToken,
        channelId: config.channelId,
        customerIdentityId: customerIdentity.id,
        id: randomUUID(),
        workspaceId: config.workspaceId,
      },
      select: { accessToken: true, id: true, status: true },
    });
  });

  const sessionLink = new URL(
    process.env.SESSION_LINK_BASE_URL ?? "http://localhost:8000/widget/session",
  );
  sessionLink.searchParams.set("token", session.accessToken);

  void enqueueSessionEmail({
    customerName: input.name,
    email: input.email,
    sessionLink: sessionLink.toString(),
  }).catch(() => undefined);

  return session;
}

export async function getWebSession(accessToken: string) {
  return unscopedPrisma.webSession.findUnique({
    where: { accessToken },
    select: {
      accessToken: true,
      createdAt: true,
      status: true,
      customerIdentity: { select: { name: true } },
      channel: { select: { webWidgetConfig: { select: { botName: true, primaryColor: true, welcomeMessage: true } } } },
    },
  });
}

export async function createCustomerMessage(
  accessToken: string,
  input: CustomerMessageInput,
): Promise<CreateCustomerMessageResult | null> {
  const session = await unscopedPrisma.webSession.findUnique({
    where: { accessToken },
    include: { ticket: true },
  });
  if (!session || session.status !== "ACTIVE") return null;

  if (session.ticket) {
    const message = await appendMessage(session.ticket.id, session.workspaceId, input);
    return { created: message.created, kind: "message", message: message.message };
  }

  const apiKey = classificationConfig.apiKey;
  if (!apiKey) throw new ClassificationNotConfiguredError();

  const model = createClassificationModel({ ...classificationConfig, apiKey });
  const decision = await classifyMessage({ content: input.content, model });

  if (!decision.qualifies) {
    return { kind: "reply", reply: decision.reply };
  }

  try {
    const message = await createTicketAndFirstMessage(session.id, decision, input);
    return { created: true, kind: "message", message };
  } catch (error) {
    // Two concurrent first messages on the same Web Session race to create
    // the Ticket; webSessionId is unique, so the loser appends to whichever
    // Ticket won instead of surfacing a spurious failure.
    if (isUniqueConstraintError(error, "webSessionId")) {
      const winner = await unscopedPrisma.webSession.findUniqueOrThrow({
        where: { accessToken },
        include: { ticket: true },
      });
      if (!winner.ticket) throw error;
      const message = await appendMessage(winner.ticket.id, winner.workspaceId, input);
      return { created: message.created, kind: "message", message: message.message };
    }
    throw error;
  }
}

async function appendMessage(ticketId: string, workspaceId: string, input: CustomerMessageInput) {
  return unscopedPrisma.$transaction(async (tx) => {
    const existing = await tx.message.findUnique({
      where: { workspaceId_externalMessageId: { externalMessageId: input.idempotencyKey, workspaceId } },
    });
    if (existing) return { created: false, message: existing };

    const ticket = await tx.ticket.update({
      data: { messageSeq: { increment: 1 } },
      where: { id: ticketId },
    });
    const conversation = await tx.conversation.findUniqueOrThrow({ where: { ticketId } });

    const message = await tx.message.create({
      data: {
        content: input.content, externalMessageId: input.idempotencyKey, id: randomUUID(),
        memorySessionId: conversation.id, message: { content: input.content }, position: ticket.messageSeq,
        role: "user", runId: randomUUID(), senderType: "CUSTOMER", ticketId: ticket.id,
        turn: ticket.messageSeq, workspaceId,
      },
    });
    return { created: true, message };
  });
}

/** Starts after the Customer message has been committed. Streaming fragments
 * never acquire a Message position; only the completed AI Agent reply does. */
export async function generateAiReply(ticketId: string, workspaceId: string, customerMessage: string) {
  const ticket = await unscopedPrisma.ticket.findUnique({ select: { status: true }, where: { id: ticketId } });
  if (!ticket || ticket.status !== "AI_HANDLING") return;
  if (!aiAgentConfig.apiKey || !embeddingConfig.apiKey) {
    await escalate(ticketId, workspaceId, "reply_not_configured");
    return;
  }

  const provisionalId = randomUUID();
  setTicketGenerating(ticketId, true);
  await publishWidgetEvent(ticketId, { type: "ticket.status", data: { status: "generating" } });

  try {
    const embeddingClient = createEmbeddingClient({ ...embeddingConfig, apiKey: embeddingConfig.apiKey });
    const [embedding] = await embeddingClient.embed([customerMessage]);
    const sources = embedding
      ? await findKnowledgeChunks(unscopedPrisma, { embedding, workspaceId, retrievalMode: "CUSTOMER" })
      : [];

    await unscopedPrisma.aiActivity.create({
      data: {
        eventType: "KNOWLEDGE_RETRIEVED",
        id: randomUUID(),
        metadata: { chunkIds: sources.map((source) => source.chunkId), knowledgeSourceIds: sources.map((source) => source.knowledgeSourceId) },
        ticketId,
        workspaceId,
      },
    });

    const clarificationCount = await unscopedPrisma.aiActivity.count({
      where: { eventType: "CLARIFICATION_ASKED", ticketId },
    });
    const model = createReplyModel({ ...aiAgentConfig, apiKey: aiAgentConfig.apiKey });
    let decision: Awaited<ReturnType<typeof streamReply>> | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        decision = await streamReply({
          clarificationCount,
          customerMessage,
          model,
          onDelta: (delta) => publishWidgetEvent(ticketId, { type: "message.delta", data: { delta, provisionalId } }),
          sources: sources.map((source) => ({ id: source.chunkId, content: source.content })),
        });
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!decision) throw lastError ?? new ReplyGenerationFailedError();

    if (decision.decision === "ESCALATE" || (decision.decision === "CLARIFY" && clarificationCount >= 2)) {
      await escalate(ticketId, workspaceId, decision.decision === "CLARIFY" ? "clarification_limit" : "no_grounded_answer");
      return;
    }
    if (!decision.content) throw new ReplyGenerationFailedError();

    const message = await appendAiMessage(ticketId, workspaceId, decision.content);
    await unscopedPrisma.aiActivity.create({
      data: {
        eventType: decision.decision === "CLARIFY" ? "CLARIFICATION_ASKED" : "AI_REPLIED",
        id: randomUUID(), metadata: { provisionalId }, ticketId, workspaceId,
      },
    });
    await publishWidgetEvent(ticketId, { type: "message.created", data: message });
  } catch {
    await escalate(ticketId, workspaceId, "generation_failed");
  } finally {
    setTicketGenerating(ticketId, false);
    await publishWidgetEvent(ticketId, { type: "ticket.status", data: { status: "ready" } });
  }
}

async function appendAiMessage(ticketId: string, workspaceId: string, content: string) {
  return unscopedPrisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.update({ data: { messageSeq: { increment: 1 } }, where: { id: ticketId } });
    const conversation = await tx.conversation.findUniqueOrThrow({ where: { ticketId } });
    return tx.message.create({
      data: {
        content, externalMessageId: `ai:${randomUUID()}`, id: randomUUID(), memorySessionId: conversation.id,
        message: { content }, position: ticket.messageSeq, role: "assistant", runId: randomUUID(),
        senderType: "AI_AGENT", ticketId, turn: ticket.messageSeq, workspaceId,
      },
    });
  });
}

async function escalate(ticketId: string, workspaceId: string, reason: string) {
  await unscopedPrisma.$transaction(async (tx) => {
    await tx.ticket.update({ data: { status: "ESCALATED" }, where: { id: ticketId } });
    await tx.aiActivity.create({
      data: { eventType: "ESCALATED", id: randomUUID(), metadata: { reason }, ticketId, workspaceId },
    });
  });
  await publishWidgetEvent(ticketId, { type: "ticket.status", data: { status: "escalated" } });
}

async function createTicketAndFirstMessage(
  webSessionId: string,
  decision: Extract<Awaited<ReturnType<typeof classifyMessage>>, { qualifies: true }>,
  input: CustomerMessageInput,
) {
  return unscopedPrisma.$transaction(async (tx) => {
    const session = await tx.webSession.findUniqueOrThrow({ where: { id: webSessionId } });
    const ticketId = randomUUID();
    const ticket = await tx.ticket.create({
      data: {
        category: decision.category,
        channelId: session.channelId,
        customerIdentityId: session.customerIdentityId,
        id: ticketId,
        messageSeq: 1,
        priority: decision.priority,
        title: decision.title,
        webSessionId,
        workspaceId: session.workspaceId,
      },
    });
    const conversation = await tx.conversation.create({
      data: {
        id: randomUUID(), metadata: {}, scopeKey: `ticket:${ticketId}`, sessionId: ticketId,
        ticketId, userId: session.customerIdentityId, workspaceId: session.workspaceId,
      },
    });

    const message = await tx.message.create({
      data: {
        content: input.content, externalMessageId: input.idempotencyKey, id: randomUUID(),
        memorySessionId: conversation.id, message: { content: input.content }, position: 1,
        role: "user", runId: randomUUID(), senderType: "CUSTOMER", ticketId: ticket.id,
        turn: 1, workspaceId: session.workspaceId,
      },
    });

    await tx.aiActivity.createMany({
      data: [
        {
          eventType: "CLASSIFIED",
          id: randomUUID(),
          metadata: { category: decision.category, isSupportRequest: true, priority: decision.priority, title: decision.title },
          ticketId: ticket.id,
          workspaceId: session.workspaceId,
        },
        {
          eventType: "TICKET_CREATED",
          id: randomUUID(),
          metadata: { category: decision.category, priority: decision.priority, title: decision.title },
          ticketId: ticket.id,
          workspaceId: session.workspaceId,
        },
      ],
    });

    return message;
  });
}

export async function getMessagesAfter(accessToken: string, afterPosition: number) {
  const session = await unscopedPrisma.webSession.findUnique({
    where: { accessToken }, select: { ticket: { select: { id: true } } },
  });
  if (!session?.ticket) return null;
  const messages = await unscopedPrisma.message.findMany({
    where: { deletedAt: null, ticketId: session.ticket.id, position: { gt: afterPosition } }, orderBy: { position: "asc" },
  });
  return { messages, ticketId: session.ticket.id };
}

export function toPublicWidgetConfig(config: PublicWidgetConfig): PublicWidgetConfig {
  return {
    botName: config.botName,
    primaryColor: config.primaryColor,
    welcomeMessage: config.welcomeMessage,
  };
}

function isAllowedOrigin(origin: string, allowedDomains: string[]) {
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") && allowedDomains.includes(url.host);
  } catch {
    return false;
  }
}

function isUniqueConstraintError(error: unknown, target: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002" &&
    "meta" in error &&
    typeof error.meta === "object" &&
    error.meta !== null &&
    "target" in error.meta &&
    JSON.stringify(error.meta.target).includes(target)
  );
}
