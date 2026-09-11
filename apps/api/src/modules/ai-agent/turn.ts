import { randomUUID } from "node:crypto";
import { runAiAgentTurn, type AiAgentTurnRuntime, type EscalationReason } from "@repo/ai-agent";
import { createOpenAiEmbeddingClient, searchChunks, searchTicketChunks } from "@repo/knowledge";
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
      loadTicket: async () => {
        const loaded = await unscopedPrisma.ticket.findUnique({
          select: {
            aiAgent: { select: { instructions: true } },
            aiAgentId: true,
            channel: { select: { type: true } },
            customerIdentity: { select: { id: true } },
            status: true,
          },
          where: { id: ticketId },
        });
        if (loaded?.status !== "AI_HANDLING") return null;
        ticket = loaded;
        return { instructions: loaded.aiAgent.instructions ?? undefined };
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
        if (!ticket || !embeddingConfig.apiKey) throw new Error("AI Agent runtime is not ready.");
        const [embedding] = await createOpenAiEmbeddingClient({
          ...embeddingConfig,
          apiKey: embeddingConfig.apiKey,
        }).embed([customerMessage]);
        const sources = embedding
          ? await searchChunks(unscopedPrisma, {
              embedding,
              retrievalMode: "CUSTOMER",
              workspaceId,
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
        const ticketContext = embedding
          ? await searchTicketChunks(unscopedPrisma, {
              channelType: ticket.channel.type,
              customerIdentityId: ticket.customerIdentity.id,
              embedding,
              excludeTicketId: ticketId,
              workspaceId,
            })
          : [];
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
        if (ticketContext.length) {
          await unscopedPrisma.aiActivity.create({
            data: {
              eventType: "TICKET_KNOWLEDGE_RETRIEVED",
              id: randomUUID(),
              metadata: {
                chunkIds: ticketContext.map((chunk) => chunk.chunkId),
                ticketIds: ticketContext.map((chunk) => chunk.ticketId),
              },
              ticketId,
              workspaceId,
            },
          });
        }
        return {
          attachments: attachments.flatMap((attachment) =>
            attachment.extractedText
              ? [{ content: attachment.extractedText, id: `attachment:${attachment.id}` }]
              : [],
          ),
          sources: sources.map((source) => ({ content: source.content, id: source.chunkId })),
          ticketContext: ticketContext.map((chunk) => ({
            content: chunk.content,
            id: chunk.chunkId,
          })),
        };
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
        const assigned = await resolveTools(ticket.aiAgentId);
        return {
          descriptors: describeAssignedTools(assigned),
          execute: createAssignedToolExecutor({
            aiAgentId: ticket.aiAgentId,
            ticketId,
            tools: assigned,
            workspaceId,
          }),
        };
      },
    };

    return runAiAgentTurn({
      customerMessage,
      modelConfig:
        aiAgentConfig.apiKey && embeddingConfig.apiKey
          ? { ...aiAgentConfig, apiKey: aiAgentConfig.apiKey }
          : undefined,
      runtime,
      ticketId,
      workspaceId,
    });
  });
}

async function appendAiMessage(ticketId: string, workspaceId: string, content: string) {
  return unscopedPrisma.$transaction(async (tx) => {
    const transition = await tx.ticket.updateMany({
      data: { status: "AI_HANDLING" },
      where: { id: ticketId, status: "AI_HANDLING" },
    });
    if (!transition.count) return null;
    const ticket = await tx.ticket.findUniqueOrThrow({
      select: { sessionId: true },
      where: { id: ticketId },
    });
    return tx.message.create({
      data: {
        ...(await claimMessageSlot(tx, ticket.sessionId)),
        content,
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
      select: { sessionId: true },
      where: { id: ticketId },
    });
    const acknowledgementMessage = await tx.message.create({
      data: {
        ...(await claimMessageSlot(tx, ticket.sessionId)),
        content: acknowledgement,
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
      include: { aiAgent: { select: { resolutionMessage: true } } },
      where: { id: ticketId },
    });
    const content = ticket.aiAgent.resolutionMessage ?? "This conversation has been resolved.";
    const closingMessage = await tx.message.create({
      data: {
        ...(await claimMessageSlot(tx, ticket.sessionId)),
        content,
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

function acknowledgementFor(customerMessage: string) {
  return /\b(?:saya|aku|mau|tolong|dengan|bicara|hubungkan|masalah|langganan|tagihan)\b/i.test(
    customerMessage,
  )
    ? "Percakapan Anda sudah diteruskan kepada tim kami. Human Agent akan membantu Anda secepatnya."
    : "Your conversation has been passed to our team. A Human Agent will help you as soon as possible.";
}
