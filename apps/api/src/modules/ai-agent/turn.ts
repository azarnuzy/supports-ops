import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  createReplyModel,
  runAiAgentTurn,
  type AgentMessage,
  type AiAgentTurnRuntime,
  type EscalationReason,
} from "@repo/ai-agent";
import { aiAgentConfig, embeddingConfig } from "../../config";
import { unscopedPrisma } from "../../utils/prisma";
import { claimMessageSlot } from "../../utils/session-messages";
import { withWorkspaceContext } from "../../utils/workspace-context";
import {
  cancelFollowUpTimers,
  scheduleFollowUp,
  scheduleIdleClosureForTicket,
} from "../follow-up/queue";
import { enqueueTicketKnowledgeIndex } from "../tickets/queue";
import { createAssignedToolExecutor, describeAssignedTools } from "../tools/orchestration";
import { resolveTools } from "../tools/services";
import {
  isTicketGenerating,
  publishTicketQueueEvent,
  publishWidgetEvent,
  setTicketGenerating,
} from "../widget/realtime";

type TurnTicket = {
  aiAgent: { instructions: string | null };
  aiAgentId: string;
  channel: { type: "WEB" | "WHATSAPP" };
  customerIdentity: { id: string };
};

export function generateAiReply(ticketId: string, workspaceId: string, customerMessage: string) {
  return withWorkspaceContext(workspaceId, () => {
    let ticket: TurnTicket | null = null;
    const modelConfig =
      aiAgentConfig.apiKey && embeddingConfig.apiKey
        ? { ...aiAgentConfig, apiKey: aiAgentConfig.apiKey }
        : undefined;
    const runtime: AiAgentTurnRuntime = {
      countClarifications: () =>
        unscopedPrisma.aiActivity.count({
          where: { eventType: "CLARIFICATION_ASKED", ticketId },
        }),
      escalate: (reason) => escalate(ticketId, workspaceId, reason, customerMessage),
      finish: async () => {
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
      },
      isActive: () => isTicketGenerating(ticketId),
      loadMemory: async () => {
        if (!ticket) throw new Error("AI Agent runtime is not ready.");
        return loadAgentMemory(ticketId, ticket.sessionId);
      },
      loadTicket: async () => {
        const loaded = await unscopedPrisma.ticket.findUnique({
          select: {
            aiAgent: { select: { instructions: true } },
            aiAgentId: true,
            channel: { select: { type: true } },
            customerIdentity: { select: { id: true } },
            sessionId: true,
            status: true,
          },
          where: { id: ticketId },
        });
        if (loaded?.status !== "AI_HANDLING") return null;
        ticket = loaded;
        return {
          instructions: loaded.aiAgent.instructions ?? undefined,
          sessionId: loaded.sessionId,
          userId: loaded.customerIdentity.id,
        };
      },
      publishDelta: (delta, provisionalId) =>
        publishWidgetEvent(ticketId, {
          type: "message.delta",
          data: { delta, provisionalId },
        }),
      reply: async (decision, content, provisionalId) => {
        const message = await appendAiMessage(ticketId, workspaceId, content);
        if (!message) return;
        await unscopedPrisma.aiActivity.create({
          data: {
            eventType: decision === "CLARIFY" ? "CLARIFICATION_ASKED" : "AI_REPLIED",
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
      },
      resolve: () => resolveByAi(ticketId, workspaceId),
      retrieve: async () => {
        if (!ticket) throw new Error("AI Agent runtime is not ready.");
        const attachments = await unscopedPrisma.attachment.findMany({
          select: { extractedText: true, id: true },
          where: {
            deletedAt: null,
            extractedText: { not: null },
            processingStatus: "READY",
            ticketId,
          },
        });
        return {
          attachments: attachments.flatMap((attachment) =>
            attachment.extractedText
              ? [{ content: attachment.extractedText, id: `attachment:${attachment.id}` }]
              : [],
          ),
        };
      },
      saveMemory: async (messages) => {
        if (!ticket) throw new Error("AI Agent runtime is not ready.");
        await unscopedPrisma.conversation.update({
          data: {
            agentMessages: sanitizeAgentMemory(messages) as unknown as Prisma.InputJsonValue,
          },
          where: { sessionId: ticket.sessionId },
        });
      },
      start: async () => {
        setTicketGenerating(ticketId, true);
        await publishWidgetEvent(ticketId, {
          type: "ticket.status",
          data: { status: "generating" },
        });
      },
      tools: async () => {
        if (!ticket) throw new Error("AI Agent runtime is not ready.");
        if (!modelConfig) throw new Error("AI Agent runtime is not ready.");
        const assigned = await resolveTools(ticket.aiAgentId);
        return {
          descriptors: describeAssignedTools(assigned),
          execute: createAssignedToolExecutor({
            aiAgentId: ticket.aiAgentId,
            customerMessage,
            getPriorAiMessage: () => getPriorAiMessage(ticketId),
            model: createReplyModel(modelConfig),
            ticketId,
            tools: assigned,
            workspaceId,
          }),
        };
      },
    };

    return runAiAgentTurn({
      customerMessage,
      modelConfig,
      runtime,
      ticketId,
      workspaceId,
    });
  });
}

/** Tool calls and Tool Results are replayable state; private model reasoning is not. */
function sanitizeAgentMemory(messages: AgentMessage[]): AgentMessage[] {
  return messages.map((message) =>
    message.role === "assistant" && Array.isArray(message.content)
      ? { ...message, content: message.content.filter((part) => part.type !== "reasoning") }
      : message,
  );
}

/** Loads the model-facing history. Before the first AI run snapshot exists,
 * rebuild the pre-Ticket exchange from the Customer-visible transcript and
 * omit the trailing Customer messages that make up the current prompt. */
async function loadAgentMemory(ticketId: string, sessionId: string): Promise<AgentMessage[]> {
  const conversation = await unscopedPrisma.conversation.findUniqueOrThrow({
    select: { agentMessages: true },
    where: { sessionId },
  });
  if (Array.isArray(conversation.agentMessages) && conversation.agentMessages.length) {
    return conversation.agentMessages as unknown as AgentMessage[];
  }

  const messages = await unscopedPrisma.message.findMany({
    orderBy: { position: "asc" },
    select: { content: true, senderType: true },
    where: { deletedAt: null, ticketId },
  });
  while (messages.at(-1)?.senderType === "CUSTOMER") messages.pop();
  return messages.flatMap(({ content, senderType }) => {
    if (senderType === "CUSTOMER") return [{ content, role: "user" as const }];
    if (senderType === "AI_AGENT") return [{ content, role: "assistant" as const }];
    return [];
  });
}

/** The Agent's own prior message in this Ticket — the proposal a
 * MUTATING_IRREVERSIBLE Tool call must point back to before its Customer
 * confirmation counts. Queried lazily: most turns never call such a Tool. */
async function getPriorAiMessage(ticketId: string): Promise<string | null> {
  const message = await unscopedPrisma.message.findFirst({
    orderBy: { position: "desc" },
    select: { content: true },
    where: { senderType: "AI_AGENT", ticketId },
  });
  return message?.content ?? null;
}

async function appendAiMessage(ticketId: string, workspaceId: string, content: string) {
  return unscopedPrisma.$transaction(async (tx) => {
    const transition = await tx.ticket.updateMany({
      data: { status: "AI_HANDLING" },
      where: { id: ticketId, status: "AI_HANDLING" },
    });
    if (!transition.count) return null;
    const ticket = await tx.ticket.findUniqueOrThrow({
      select: { channel: { select: { type: true } }, sessionId: true },
      where: { id: ticketId },
    });
    return tx.message.create({
      data: {
        ...(await claimMessageSlot(tx, ticket.sessionId)),
        content,
        deliveryStatus: ticket.channel.type === "WHATSAPP" ? "PENDING" : "SENT",
        externalMessageId: `ai:${randomUUID()}`,
        message: { content },
        role: "assistant",
        senderType: "AI_AGENT",
        ticketId,
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
      data: { escalatedAt: new Date(), escalationReason: reason, status: "ESCALATED" },
      where: { id: ticketId, status: "AI_HANDLING" },
    });
    if (!transition.count) return null;
    const ticket = await tx.ticket.findUniqueOrThrow({
      select: { channel: { select: { type: true } }, sessionId: true },
      where: { id: ticketId },
    });
    const acknowledgementMessage = await tx.message.create({
      data: {
        ...(await claimMessageSlot(tx, ticket.sessionId)),
        content: acknowledgement,
        deliveryStatus: ticket.channel.type === "WHATSAPP" ? "PENDING" : "SENT",
        externalMessageId: `escalation:${randomUUID()}`,
        message: { content: acknowledgement },
        role: "system",
        senderType: "SYSTEM",
        ticketId,
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
  await scheduleIdleClosureForTicket(ticketId, workspaceId);
  await publishWidgetEvent(ticketId, { type: "message.created", data: result });
  await publishWidgetEvent(ticketId, { type: "ticket.status", data: { status: "escalated" } });
  await publishTicketQueueEvent(workspaceId);
}

export async function resolveByAi(ticketId: string, workspaceId: string) {
  const closing = await unscopedPrisma.$transaction(async (tx) => {
    const transition = await tx.ticket.updateMany({
      data: {
        resolvedAt: new Date(),
        resolvedBy: "AI_AGENT",
        resolutionReason: "CUSTOMER_CONFIRMED",
        status: "RESOLVED",
      },
      where: { id: ticketId, status: "AI_HANDLING" },
    });
    if (!transition.count) return null;
    const ticket = await tx.ticket.findUniqueOrThrow({
      include: {
        aiAgent: { select: { resolutionMessage: true } },
        channel: { select: { type: true } },
      },
      where: { id: ticketId },
    });
    const content = ticket.aiAgent.resolutionMessage ?? "This conversation has been resolved.";
    const closingMessage = await tx.message.create({
      data: {
        ...(await claimMessageSlot(tx, ticket.sessionId)),
        content,
        deliveryStatus: ticket.channel.type === "WHATSAPP" ? "PENDING" : "SENT",
        externalMessageId: `resolution:${randomUUID()}`,
        message: { content },
        role: "system",
        senderType: "SYSTEM",
        ticketId,
        workspaceId,
      },
    });
    await tx.session.update({ data: { status: "CLOSED" }, where: { id: ticket.sessionId } });
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

/** The Customer-visible message an escalation sends. Exported so the eval
 * suite can report the same text a Customer would actually see when the
 * Agent escalates, instead of an empty reply. */
export function acknowledgementFor(customerMessage: string) {
  return /\b(?:saya|aku|mau|tolong|dengan|bicara|hubungkan|masalah|langganan|tagihan)\b/i.test(
    customerMessage,
  )
    ? "Percakapan Anda sudah diteruskan kepada tim kami. Human Agent akan membantu Anda secepatnya."
    : "Your conversation has been passed to our team. A Human Agent will help you as soon as possible.";
}
