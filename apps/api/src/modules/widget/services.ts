import { randomBytes, randomUUID } from "node:crypto";
import { webAttachmentCapability } from "@repo/channels";
import {
  ClassificationFailedError,
  classifyMessage,
  createClassificationModel,
  createReplyModel,
  ReplyGenerationFailedError,
  streamReply,
} from "@repo/ai-agent";
import {
  createOpenAiEmbeddingClient as createEmbeddingClient,
  searchChunks as findKnowledgeChunks,
  searchTicketChunks as findTicketKnowledgeChunks,
} from "@repo/knowledge";
import { BusinessToolError, createBusinessTools } from "@repo/tools";
import { createStorage } from "@repo/storage";
import { type Span, withSpan } from "@repo/logger/telemetry";
import {
  aiAgentConfig,
  apiConfig,
  classificationConfig,
  embeddingConfig,
  storageConfig,
} from "../../config";
import { type Message, unscopedPrisma } from "../../utils/prisma";
import { enqueueSessionEmail } from "./session-email";
import type { CustomerMessageInput, PreChatInput } from "./schema";
import {
  isTicketGenerating,
  publishTicketQueueEvent,
  publishWidgetEvent,
  setTicketGenerating,
} from "./realtime";
import { enqueueAttachmentProcess } from "./attachment-queue";
import { cancelFollowUpTimers, scheduleFollowUp } from "../follow-up/queue";
import { enqueueTicketKnowledgeIndex } from "../tickets/queue";

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

export class InvalidAttachmentError extends Error {}

const escalationReasons = [
  "LOW_KNOWLEDGE_CONFIDENCE",
  "NO_RELEVANT_KNOWLEDGE",
  "CUSTOMER_REQUESTED_HUMAN",
  "AI_FAILED_ATTEMPTS",
  "INTERNAL_ACTION_REQUIRED",
  "BUSINESS_TOOL_FAILURE",
  "CONFLICTING_KNOWLEDGE",
  "AI_GENERATION_FAILED",
  "AI_TIMEOUT",
] as const;

type EscalationReason = (typeof escalationReasons)[number];


export type CreateCustomerMessageResult =
  | { kind: "message"; created: boolean; message: Message }
  | { kind: "reply"; reply: string };

export function customerRequestedHuman(content: string) {
  return /\b(?:human|real (?:person|agent)|live (?:agent|person)|customer service|representative|(?:speak|talk) (?:to|with) (?:a )?(?:human|person|someone|agent)|connect (?:me )?to (?:a )?(?:human|person|agent)|(?:bicara|ngobrol) (?:dengan|sama) (?:human|manusia|orang|cs|customer service)|hubungkan (?:saya|aku) (?:ke|dengan) (?:human|manusia|orang|cs|customer service)|orangnya|cs)\b/i.test(
    content,
  );
}

/** Broad, low-precision signal that a message might be a resolution
 * confirmation or a bare thanks. Used only to let such messages reach the
 * reply Agent even when retrieval finds no supporting Knowledge; the Agent
 * makes the actual REPLY/RESOLVE/CLARIFY distinction. */
function looksLikeResolutionSignal(content: string) {
  return /\b(?:thanks?|thank you|solved|resolved|fixed|working|works now|got it|all good|that('?s| is) (?:it|all)|makasih|terima kasih|sudah (?:selesai|beres|bisa|oke?)|beres|selesai|berhasil)\b/i.test(
    content,
  );
}

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
  const businessTools = createBusinessTools(apiConfig.businessSystemUrl);
  const customer = await businessTools.getCustomerByEmail(input.email).catch(() => null);

  const session = await unscopedPrisma.$transaction(async (tx) => {
    const customerIdentity = await tx.customerIdentity.create({
      data: {
        channelType: "WEB",
        email: input.email,
        externalCustomerId: customer?.id,
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
      channel: {
        select: {
          webWidgetConfig: { select: { botName: true, primaryColor: true, welcomeMessage: true } },
        },
      },
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
  if (session?.status !== "ACTIVE") return null;

  if (session.ticket) {
    const message = await appendMessage(session.ticket.id, session.workspaceId, input);
    if (message.created) void cancelFollowUpTimers(session.ticket.id);
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

export async function createCustomerAttachment(
  accessToken: string,
  input: { content?: string; file: File },
) {
  if (!webAttachmentCapability.mimeTypes.includes(input.file.type)) {
    throw new InvalidAttachmentError("Attach a PDF, plain text, JPEG, or PNG file.");
  }
  if (input.file.size === 0 || input.file.size > webAttachmentCapability.maxFileSizeBytes) {
    throw new InvalidAttachmentError("Attachment must be between 1 byte and 10 MB.");
  }

  const content = input.content?.trim() || `I need help with the attached file: ${input.file.name}`;
  const result = await createCustomerMessage(accessToken, {
    content,
    idempotencyKey: randomUUID(),
  });
  if (!result) return null;
  if (result.kind === "reply") {
    throw new InvalidAttachmentError("Please describe the support problem with the attachment.");
  }

  const id = randomUUID();
  const storageKey = `attachments/${result.message.workspaceId}/${result.message.ticketId}/${id}`;
  await createStorage(storageConfig).putObject({
    body: Buffer.from(await input.file.arrayBuffer()),
    contentType: input.file.type,
    key: storageKey,
  });
  const attachment = await unscopedPrisma.attachment.create({
    data: {
      fileName: input.file.name,
      id,
      messageId: result.message.id,
      mimeType: input.file.type,
      sizeBytes: input.file.size,
      storageKey,
      ticketId: result.message.ticketId,
      workspaceId: result.message.workspaceId,
    },
  });
  await enqueueAttachmentProcess({
    attachmentId: id,
    ticketId: attachment.ticketId,
    workspaceId: attachment.workspaceId,
  });
  return { attachment, message: result.message };
}

async function appendMessage(ticketId: string, workspaceId: string, input: CustomerMessageInput) {
  return unscopedPrisma.$transaction(async (tx) => {
    const existing = await tx.message.findUnique({
      where: {
        workspaceId_externalMessageId: { externalMessageId: input.idempotencyKey, workspaceId },
      },
    });
    if (existing) return { created: false, message: existing };

    const ticket = await tx.ticket.update({
      data: { messageSeq: { increment: 1 } },
      where: { id: ticketId },
    });
    const conversation = await tx.conversation.findUniqueOrThrow({ where: { ticketId } });

    const message = await tx.message.create({
      data: {
        content: input.content,
        externalMessageId: input.idempotencyKey,
        id: randomUUID(),
        memorySessionId: conversation.id,
        message: { content: input.content },
        position: ticket.messageSeq,
        role: "user",
        runId: randomUUID(),
        senderType: "CUSTOMER",
        ticketId: ticket.id,
        turn: ticket.messageSeq,
        workspaceId,
      },
    });
    return { created: true, message };
  });
}

/** Starts after the Customer message has been committed. Streaming fragments
 * never acquire a Message position; only the completed AI Agent reply does. */
export async function generateAiReply(
  ticketId: string,
  workspaceId: string,
  customerMessage: string,
) {
  return withSpan(
    "ai_agent.run",
    { "supportops.ticket_id": ticketId, "supportops.workspace_id": workspaceId },
    (run) => generateAiReplyRun(run, ticketId, workspaceId, customerMessage),
  );
}

/** The run itself. Retrieval, Business Tool calls, generation, and the final
 * decision all nest under the caller's `ai_agent.run` span. */
async function generateAiReplyRun(
  run: Span,
  ticketId: string,
  workspaceId: string,
  customerMessage: string,
) {
  const ticket = await unscopedPrisma.ticket.findUnique({
    select: {
      channel: { select: { type: true } },
      customerIdentity: { select: { email: true, externalCustomerId: true, id: true } },
      status: true,
    },
    where: { id: ticketId },
  });
  if (ticket?.status !== "AI_HANDLING") {
    run.setAttribute("ai_agent.decision", "SKIPPED");
    return;
  }
  if (!aiAgentConfig.apiKey || !embeddingConfig.apiKey) {
    await escalate(ticketId, workspaceId, "AI_GENERATION_FAILED", customerMessage);
    return;
  }

  const provisionalId = randomUUID();
  setTicketGenerating(ticketId, true);
  await publishWidgetEvent(ticketId, { type: "ticket.status", data: { status: "generating" } });

  try {
    // The guard above narrows the key; closures do not inherit that narrowing.
    const embeddingApiKey = embeddingConfig.apiKey;
    const [, sources, attachments, ticketKnowledge] = await withSpan(
      "ai_agent.retrieve_knowledge",
      {},
      async (retrieval) => {
        const embeddingClient = createEmbeddingClient({
          ...embeddingConfig,
          apiKey: embeddingApiKey,
        });
        const [embedding] = await embeddingClient.embed([customerMessage]);
        const sources = embedding
          ? await findKnowledgeChunks(unscopedPrisma, {
              embedding,
              workspaceId,
              retrievalMode: "CUSTOMER",
            })
          : [];
        const attachments = await unscopedPrisma.attachment.findMany({
          select: { extractedText: true, id: true },
          where: {
            deletedAt: null,
            extractedText: { not: null },
            processingStatus: "READY",
            ticketId,
          },
        });
        const ticketKnowledge = embedding
          ? await findTicketKnowledgeChunks(unscopedPrisma, {
              channelType: ticket.channel.type,
              customerIdentityId: ticket.customerIdentity.id,
              embedding,
              excludeTicketId: ticketId,
              workspaceId,
            })
          : [];
        retrieval.setAttributes({
          "ai_agent.knowledge_chunks": sources.length,
          "ai_agent.attachments": attachments.length,
          "ai_agent.ticket_knowledge_chunks": ticketKnowledge.length,
        });
        return [embedding, sources, attachments, ticketKnowledge] as const;
      },
    );

    await unscopedPrisma.aiActivity.create({
      data: {
        eventType: "KNOWLEDGE_RETRIEVED",
        id: randomUUID(),
        metadata: {
          chunkIds: sources.map((source) => source.chunkId),
          knowledgeSourceIds: sources.map((source) => source.knowledgeSourceId),
        },
        ticketId,
        workspaceId,
      },
    });
    if (ticketKnowledge.length) {
      await unscopedPrisma.aiActivity.create({
        data: {
          eventType: "TICKET_KNOWLEDGE_RETRIEVED",
          id: randomUUID(),
          metadata: {
            chunkIds: ticketKnowledge.map((chunk) => chunk.chunkId),
            ticketIds: ticketKnowledge.map((chunk) => chunk.ticketId),
          },
          ticketId,
          workspaceId,
        },
      });
    }

    const clarificationCount = await unscopedPrisma.aiActivity.count({
      where: { eventType: "CLARIFICATION_ASKED", ticketId },
    });
    const businessData = await getBusinessToolData(ticketId, workspaceId, ticket.customerIdentity);
    run.setAttribute("ai_agent.business_tool_data", Boolean(businessData));
    if (!sources.length && !businessData && !looksLikeResolutionSignal(customerMessage)) {
      run.setAttributes({
        "ai_agent.decision": "ESCALATE",
        "ai_agent.escalation_reason": "NO_RELEVANT_KNOWLEDGE",
      });
      await escalate(ticketId, workspaceId, "NO_RELEVANT_KNOWLEDGE", customerMessage);
      return;
    }
    const model = createReplyModel({ ...aiAgentConfig, apiKey: aiAgentConfig.apiKey });
    let decision: Awaited<ReturnType<typeof streamReply>> | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        decision = await streamReply({
          clarificationCount,
          customerMessage,
          model,
          onDelta: (delta) => {
            if (!isTicketGenerating(ticketId)) return;
            return publishWidgetEvent(ticketId, {
              type: "message.delta",
              data: { delta, provisionalId },
            });
          },
          businessData,
          sources: [
            ...sources.map((source) => ({ id: source.chunkId, content: source.content })),
            ...attachments.flatMap((attachment) =>
              attachment.extractedText
                ? [{ id: `attachment:${attachment.id}`, content: attachment.extractedText }]
                : [],
            ),
          ],
          ticketContext: ticketKnowledge.map((chunk) => ({
            id: chunk.chunkId,
            content: chunk.content,
          })),
        });
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!decision) throw lastError ?? new ReplyGenerationFailedError();
    run.setAttributes({
      "ai_agent.decision": decision.decision,
      ...(decision.escalationReason
        ? { "ai_agent.escalation_reason": decision.escalationReason }
        : {}),
    });

    if (
      decision.decision === "ESCALATE" ||
      (decision.decision === "CLARIFY" && clarificationCount >= 2)
    ) {
      const reason =
        decision.decision === "CLARIFY"
          ? "AI_FAILED_ATTEMPTS"
          : (decision.escalationReason ?? "NO_RELEVANT_KNOWLEDGE");
      run.setAttribute("ai_agent.escalation_reason", reason);
      await escalate(ticketId, workspaceId, reason, customerMessage);
      return;
    }
    if (decision.decision === "RESOLVE") {
      await resolveByAi(ticketId, workspaceId);
      return;
    }
    if (!decision.content) throw new ReplyGenerationFailedError();

    const message = await appendAiMessage(ticketId, workspaceId, decision.content);
    if (!message) return;
    await unscopedPrisma.aiActivity.create({
      data: {
        eventType: decision.decision === "CLARIFY" ? "CLARIFICATION_ASKED" : "AI_REPLIED",
        id: randomUUID(),
        metadata: { provisionalId },
        ticketId,
        workspaceId,
      },
    });
    await publishWidgetEvent(ticketId, { type: "message.created", data: message });
    const settings = await unscopedPrisma.aiSettings.findUnique({ where: { workspaceId } });
    await scheduleFollowUp(
      { aiMessageId: message.id, ticketId, workspaceId },
      settings?.followUpAfterSeconds ?? 900,
    );
    await publishTicketQueueEvent(workspaceId);
  } catch (error) {
    const reason =
      error instanceof BusinessToolError ? "BUSINESS_TOOL_FAILURE" : "AI_GENERATION_FAILED";
    run.recordException(error instanceof Error ? error : new Error(String(error)));
    run.setAttributes({ "ai_agent.decision": "ESCALATE", "ai_agent.escalation_reason": reason });
    await escalate(ticketId, workspaceId, reason, customerMessage);
  } finally {
    setTicketGenerating(ticketId, false);
    const finalTicket = await unscopedPrisma.ticket.findUnique({
      select: { status: true },
      where: { id: ticketId },
    });
    await publishWidgetEvent(ticketId, {
      type: "ticket.status",
      data: {
        status:
          finalTicket?.status === "ESCALATED"
            ? "escalated"
            : finalTicket?.status === "RESOLVED"
              ? "resolved"
              : "ready",
      },
    });
  }
}

async function getBusinessToolData(
  ticketId: string,
  workspaceId: string,
  identity: { email: string; externalCustomerId: string | null; id: string },
) {
  const tools = createBusinessTools(apiConfig.businessSystemUrl);
  try {
    let customerId = identity.externalCustomerId;
    if (!customerId) {
      const customer = await tools.getCustomerByEmail(identity.email);
      await unscopedPrisma.aiActivity.create({
        data: {
          eventType: "TOOL_CALLED",
          id: randomUUID(),
          metadata: { outcome: "SUCCESS", tool: "getCustomerByEmail" },
          ticketId,
          workspaceId,
        },
      });
      if (!customer) return undefined;
      customerId = customer.id;
      await unscopedPrisma.customerIdentity.update({
        data: { externalCustomerId: customerId },
        where: { id: identity.id },
      });
    }
    const [subscription, invoice] = await Promise.all([
      tools.getSubscriptionStatus(customerId),
      tools.getInvoiceStatus(customerId),
    ]);
    await unscopedPrisma.aiActivity.createMany({
      data: [
        {
          eventType: "TOOL_CALLED",
          id: randomUUID(),
          metadata: { outcome: "SUCCESS", tool: "getSubscriptionStatus" },
          ticketId,
          workspaceId,
        },
        {
          eventType: "TOOL_CALLED",
          id: randomUUID(),
          metadata: { outcome: "SUCCESS", tool: "getInvoiceStatus" },
          ticketId,
          workspaceId,
        },
      ],
    });
    return JSON.stringify({ invoice, subscription });
  } catch (error) {
    await unscopedPrisma.aiActivity.create({
      data: {
        eventType: "TOOL_FAILED",
        id: randomUUID(),
        metadata: { outcome: "FAILED", tool: "Business System" },
        ticketId,
        workspaceId,
      },
    });
    throw error instanceof BusinessToolError
      ? error
      : new BusinessToolError("Business Tool failed.", { cause: error });
  }
}

async function appendAiMessage(ticketId: string, workspaceId: string, content: string) {
  return unscopedPrisma.$transaction(async (tx) => {
    const transition = await tx.ticket.updateMany({
      data: { messageSeq: { increment: 1 } },
      where: { id: ticketId, status: "AI_HANDLING" },
    });
    if (!transition.count) return null;
    const ticket = await tx.ticket.findUniqueOrThrow({
      select: { messageSeq: true },
      where: { id: ticketId },
    });
    const conversation = await tx.conversation.findUniqueOrThrow({ where: { ticketId } });
    return tx.message.create({
      data: {
        content,
        externalMessageId: `ai:${randomUUID()}`,
        id: randomUUID(),
        memorySessionId: conversation.id,
        message: { content },
        position: ticket.messageSeq,
        role: "assistant",
        runId: randomUUID(),
        senderType: "AI_AGENT",
        ticketId,
        turn: ticket.messageSeq,
        workspaceId,
      },
    });
  });
}

export async function escalate(
  ticketId: string,
  workspaceId: string,
  reason: EscalationReason,
  customerMessage: string,
) {
  const acknowledgement = acknowledgementFor(customerMessage);
  const result = await unscopedPrisma.$transaction(async (tx) => {
    const transition = await tx.ticket.updateMany({
      data: {
        escalatedAt: new Date(),
        escalationReason: reason,
        messageSeq: { increment: 1 },
        status: "ESCALATED",
      },
      where: { id: ticketId, status: "AI_HANDLING" },
    });
    if (!transition.count) return null;
    const ticket = await tx.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      select: { messageSeq: true },
    });
    const conversation = await tx.conversation.findUniqueOrThrow({ where: { ticketId } });
    const acknowledgementMessage = await tx.message.create({
      data: {
        content: acknowledgement,
        externalMessageId: `escalation:${randomUUID()}`,
        id: randomUUID(),
        memorySessionId: conversation.id,
        message: { content: acknowledgement },
        position: ticket.messageSeq,
        role: "system",
        runId: randomUUID(),
        senderType: "SYSTEM",
        ticketId,
        turn: ticket.messageSeq,
        workspaceId,
      },
    });
    await tx.aiActivity.create({
      data: {
        eventType: "ESCALATED",
        id: randomUUID(),
        metadata: { reason },
        ticketId,
        workspaceId,
      },
    });
    return acknowledgementMessage;
  });
  if (!result) return;
  await cancelFollowUpTimers(ticketId);
  await publishWidgetEvent(ticketId, { type: "message.created", data: result });
  await publishWidgetEvent(ticketId, { type: "ticket.status", data: { status: "escalated" } });
  await publishTicketQueueEvent(workspaceId);
}

export async function resolveByAi(ticketId: string, workspaceId: string) {
  const closing = await unscopedPrisma.$transaction(async (tx) => {
    const transition = await tx.ticket.updateMany({
      data: {
        messageSeq: { increment: 1 },
        resolvedAt: new Date(),
        resolvedBy: "AI_AGENT",
        resolutionReason: "CUSTOMER_CONFIRMED",
        status: "RESOLVED",
      },
      where: { id: ticketId, status: "AI_HANDLING" },
    });
    if (!transition.count) return null;
    const ticket = await tx.ticket.findUniqueOrThrow({
      include: { workspace: { select: { closingMessage: true } } },
      where: { id: ticketId },
    });
    const conversation = await tx.conversation.findUniqueOrThrow({ where: { ticketId } });
    const content = ticket.workspace.closingMessage ?? "This conversation has been resolved.";
    const closingMessage = await tx.message.create({
      data: {
        content,
        externalMessageId: `resolution:${randomUUID()}`,
        id: randomUUID(),
        memorySessionId: conversation.id,
        message: { content },
        position: ticket.messageSeq,
        role: "system",
        runId: randomUUID(),
        senderType: "SYSTEM",
        ticketId,
        turn: ticket.messageSeq,
        workspaceId,
      },
    });
    await tx.webSession.update({ data: { status: "CLOSED" }, where: { id: ticket.webSessionId } });
    await tx.aiActivity.create({
      data: {
        eventType: "RESOLVED",
        id: randomUUID(),
        metadata: { reason: "CUSTOMER_CONFIRMED" },
        ticketId,
        workspaceId,
      },
    });
    return closingMessage;
  });
  if (!closing) return;
  await cancelFollowUpTimers(ticketId);
  await enqueueTicketKnowledgeIndex({ ticketId, workspaceId });
  await publishWidgetEvent(ticketId, { type: "message.created", data: closing });
  await publishWidgetEvent(ticketId, { type: "ticket.status", data: { status: "resolved" } });
  await publishTicketQueueEvent(workspaceId);
}

function acknowledgementFor(customerMessage: string) {
  const indonesian =
    /\b(?:saya|aku|mau|tolong|dengan|bicara|hubungkan|masalah|langganan|tagihan)\b/i.test(
      customerMessage,
    );
  return indonesian
    ? "Percakapan Anda sudah diteruskan kepada tim kami. Human Agent akan membantu Anda secepatnya."
    : "Your conversation has been passed to our team. A Human Agent will help you as soon as possible.";
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
        id: randomUUID(),
        metadata: {},
        scopeKey: `ticket:${ticketId}`,
        sessionId: ticketId,
        ticketId,
        userId: session.customerIdentityId,
        workspaceId: session.workspaceId,
      },
    });

    const message = await tx.message.create({
      data: {
        content: input.content,
        externalMessageId: input.idempotencyKey,
        id: randomUUID(),
        memorySessionId: conversation.id,
        message: { content: input.content },
        position: 1,
        role: "user",
        runId: randomUUID(),
        senderType: "CUSTOMER",
        ticketId: ticket.id,
        turn: 1,
        workspaceId: session.workspaceId,
      },
    });

    await tx.aiActivity.createMany({
      data: [
        {
          eventType: "TICKET_CREATED",
          id: randomUUID(),
          metadata: {
            category: decision.category,
            priority: decision.priority,
            title: decision.title,
          },
          ticketId: ticket.id,
          workspaceId: session.workspaceId,
        },
        {
          eventType: "CLASSIFIED",
          id: randomUUID(),
          metadata: {
            category: decision.category,
            isSupportRequest: true,
            priority: decision.priority,
            title: decision.title,
          },
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
    where: { accessToken },
    select: { status: true, ticket: { select: { id: true, status: true } } },
  });
  if (!session) return null;
  if (!session.ticket) {
    return {
      messages: [],
      sessionStatus: session.status,
      ticketId: null,
      ticketStatus: null,
    };
  }
  const messages = await unscopedPrisma.message.findMany({
    include: { attachments: { select: { fileName: true, id: true } } },
    where: { deletedAt: null, ticketId: session.ticket.id, position: { gt: afterPosition } },
    orderBy: { position: "asc" },
  });
  return {
    messages,
    sessionStatus: session.status,
    ticketId: session.ticket.id,
    ticketStatus: session.ticket.status,
  };
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
    return (
      (url.protocol === "http:" || url.protocol === "https:") && allowedDomains.includes(url.host)
    );
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
