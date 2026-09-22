import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { Usage } from "@anvia/core";
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
import { creditBalance, spendForTurn } from "../credits/services";
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
import { resolveAgentModelId } from "./model-catalog";

// Credit Exhaustion is a pre-flight guard in this module, never a decision
// the model itself makes, so it lives outside `@repo/ai-agent`'s decision schema.
export type ApiEscalationReason = EscalationReason | "CREDIT_EXHAUSTION";

type TurnSpend = { agentModel: string; aiAgentId: string; usage?: Usage };

type TurnTicket = {
  aiAgent: { instructions: string | null; resolutionMessage: string | null };
  aiAgentId: string;
  channel: { type: "WEB" | "WHATSAPP" };
  customerIdentity: { id: string };
  sessionId: string;
};

export function generateAiReply(ticketId: string, workspaceId: string, customerMessage: string) {
  return withWorkspaceContext(workspaceId, async () => {
    // Zero or below escalates before the model is ever called; a Turn already
    // running is unaffected since this only gates a Turn's start.
    if ((await creditBalance(workspaceId)) <= 0) {
      await escalate(ticketId, workspaceId, "CREDIT_EXHAUSTION", customerMessage);
      return;
    }
    let ticket: TurnTicket | null = null;
    // Set by the model run before any decision callback fires, so every spend below sees it.
    let usage: Usage | undefined;
    const agentModelId = resolveAgentModelId(
      (
        await unscopedPrisma.ticket.findUnique({
          select: { aiAgent: { select: { agentModel: true } } },
          where: { id: ticketId },
        })
      )?.aiAgent.agentModel,
    );
    const modelConfig =
      aiAgentConfig.apiKey && embeddingConfig.apiKey
        ? { ...aiAgentConfig, apiKey: aiAgentConfig.apiKey, modelId: agentModelId }
        : undefined;
    const runtime: AiAgentTurnRuntime = {
      countClarifications: () =>
        unscopedPrisma.aiActivity.count({
          where: { eventType: "CLARIFICATION_ASKED", ticketId },
        }),
      escalate: (reason, content) => {
        if (!ticket) throw new Error("AI Agent runtime is not ready.");
        // AI_GENERATION_FAILED and AI_TIMEOUT are the Turn giving up before the
        // model ever produced a decision — a provider failure, not one of the
        // outcomes an AI Turn spends Credits for.
        const isProviderFailure = reason === "AI_GENERATION_FAILED" || reason === "AI_TIMEOUT";
        return escalate(
          ticketId,
          workspaceId,
          reason,
          customerMessage,
          content,
          isProviderFailure
            ? undefined
            : { agentModel: agentModelId, aiAgentId: ticket.aiAgentId, usage },
        );
      },
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
            aiAgent: { select: { instructions: true, resolutionMessage: true } },
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
          resolutionMessage: loaded.aiAgent.resolutionMessage ?? undefined,
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
        if (!ticket) throw new Error("AI Agent runtime is not ready.");
        const message = await appendAiMessage(ticketId, workspaceId, content, {
          agentModel: agentModelId,
          aiAgentId: ticket.aiAgentId,
          usage,
        });
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
      resolve: (content) => {
        if (!ticket) throw new Error("AI Agent runtime is not ready.");
        return resolveByAi(ticketId, workspaceId, content, {
          agentModel: agentModelId,
          aiAgentId: ticket.aiAgentId,
          usage,
        });
      },
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
      onResult: (result) => {
        usage = result.usage;
      },
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
  return messages.flatMap(({ content, senderType }): AgentMessage[] => {
    if (senderType === "CUSTOMER") return [{ content, role: "user" }];
    if (senderType === "AI_AGENT") return [{ content, role: "assistant" }];
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

async function appendAiMessage(
  ticketId: string,
  workspaceId: string,
  content: string,
  spend: TurnSpend,
) {
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
    const message = await tx.message.create({
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
    await spendForTurn(tx, {
      agentModel: spend.agentModel,
      aiAgentId: spend.aiAgentId,
      channel: ticket.channel.type,
      sessionId: ticket.sessionId,
      ticketId,
      usage: spend.usage,
      workspaceId,
    });
    return message;
  });
}

export async function escalate(
  ticketId: string,
  workspaceId: string,
  reason: ApiEscalationReason,
  customerMessage: string,
  content?: string,
  spend?: TurnSpend,
) {
  const acknowledgement = content?.trim() || acknowledgementFor(customerMessage, reason);
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
    if (spend) {
      await spendForTurn(tx, {
        agentModel: spend.agentModel,
        aiAgentId: spend.aiAgentId,
        channel: ticket.channel.type,
        sessionId: ticket.sessionId,
        ticketId,
        usage: spend.usage,
        workspaceId,
      });
    }
    return acknowledgementMessage;
  });
  if (!result) return;
  await cancelFollowUpTimers(ticketId);
  await scheduleIdleClosureForTicket(ticketId, workspaceId);
  await publishWidgetEvent(ticketId, { type: "message.created", data: result });
  await publishWidgetEvent(ticketId, { type: "ticket.status", data: { status: "escalated" } });
  await publishTicketQueueEvent(workspaceId);
}

export async function resolveByAi(
  ticketId: string,
  workspaceId: string,
  content: string,
  spend: TurnSpend,
) {
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
      include: { channel: { select: { type: true } } },
      where: { id: ticketId },
    });
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
    await spendForTurn(tx, {
      agentModel: spend.agentModel,
      aiAgentId: spend.aiAgentId,
      channel: ticket.channel.type,
      sessionId: ticket.sessionId,
      ticketId,
      usage: spend.usage,
      workspaceId,
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
export function acknowledgementFor(customerMessage: string, reason: ApiEscalationReason) {
  const isIndonesian =
    /\b(?:saya|aku|mau|tolong|dengan|bicara|hubungkan|masalah|pesanan|pengiriman|tagihan)\b/i.test(
      customerMessage,
    );
  const explanations: Record<ApiEscalationReason, [string, string]> = {
    CREDIT_EXHAUSTION: [
      "Kredit AI untuk workspace ini telah habis, jadi percakapan ini akan dilanjutkan oleh Human Agent.",
      "This workspace's AI Credits are exhausted, so this conversation will continue with a Human Agent.",
    ],
    AI_FAILED_ATTEMPTS: [
      "Saya belum mendapat informasi yang cukup untuk melanjutkan dengan aman.",
      "I still do not have enough information to continue safely.",
    ],
    AI_GENERATION_FAILED: [
      "Saya tidak dapat menyelesaikan permintaan ini secara otomatis karena kendala teknis.",
      "I could not complete this request automatically because of a technical issue.",
    ],
    AI_TIMEOUT: [
      "Saya tidak dapat menyelesaikan pemeriksaan ini dalam waktu yang tersedia.",
      "I could not complete this check in the available time.",
    ],
    BUSINESS_TOOL_FAILURE: [
      "Saya tidak dapat mengakses informasi terbaru yang diperlukan untuk memastikan jawabannya.",
      "I could not access the current information needed to verify the answer.",
    ],
    CONFLICTING_KNOWLEDGE: [
      "Informasi yang tersedia saling bertentangan, jadi saya tidak dapat memastikan jawaban yang akurat.",
      "The available information conflicts, so I cannot confirm an accurate answer.",
    ],
    CUSTOMER_REQUESTED_HUMAN: [
      "Sesuai permintaan Anda, percakapan ini perlu dilanjutkan oleh Human Agent.",
      "As requested, this conversation needs to continue with a Human Agent.",
    ],
    INTERNAL_ACTION_REQUIRED: [
      "Permintaan ini memerlukan pemeriksaan atau tindakan oleh Human Agent.",
      "This request needs review or action by a Human Agent.",
    ],
    LOW_KNOWLEDGE_CONFIDENCE: [
      "Saya tidak memiliki informasi terverifikasi yang cukup untuk memberikan jawaban yang dapat diandalkan.",
      "I do not have enough verified information to give a reliable answer.",
    ],
    NO_RELEVANT_KNOWLEDGE: [
      "Saya tidak menemukan informasi terverifikasi yang menjawab permintaan ini.",
      "I could not find verified information that answers this request.",
    ],
  };
  const explanation = explanations[reason][isIndonesian ? 0 : 1];
  return isIndonesian
    ? `${explanation} Percakapan Anda sudah diteruskan kepada Human Agent untuk ditinjau.`
    : `${explanation} Your conversation has been passed to a Human Agent for review.`;
}
