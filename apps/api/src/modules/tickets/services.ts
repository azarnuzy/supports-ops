import { randomUUID } from "node:crypto";
import { webAttachmentCapability } from "@repo/channels";
import { createStorage } from "@repo/storage";
import {
  createReplyModel,
  generateEscalationSummary,
  generateSuggestedReply,
} from "@repo/ai-agent";
import {
  createOpenAiEmbeddingClient as createEmbeddingClient,
  searchChunks as findKnowledgeChunks,
} from "@repo/knowledge";
import { createBusinessTools } from "@repo/tools";
import { aiAgentConfig, apiConfig, embeddingConfig, storageConfig } from "../../config";
import { Prisma, prisma, unscopedPrisma } from "../../utils/prisma";
import { claimMessageSlot } from "../../utils/session-messages";
import type { ListTicketsQuery } from "./schema";
import {
  cancelTicketGeneration,
  publishTicketQueueEvent,
  publishWidgetEvent,
} from "../widget/realtime";
import { cancelFollowUpTimers, scheduleIdleClosureForTicket } from "../follow-up/queue";
import { enqueueTicketKnowledgeIndex } from "./queue";
import { resolveTools } from "../tools/services";
import { executeReadOnlyAssignedTools } from "../tools/orchestration";

const ticketSelect = {
  assignedHumanAgent: { select: { id: true, name: true } },
  category: true,
  customerIdentity: { select: { name: true } },
  id: true,
  priority: true,
  status: true,
  title: true,
  createdAt: true,
  escalatedAt: true,
  escalationSummary: true,
  escalationSummaryStatus: true,
  messages: {
    orderBy: { position: "asc" },
    select: {
      content: true,
      createdAt: true,
      deliveryFailureReason: true,
      deliveryStatus: true,
      position: true,
      senderType: true,
    },
  },
} as const;

export class TicketAlreadyClaimedError extends Error {
  constructor() {
    super("This Ticket was just claimed by another Human Agent.");
  }
}

export class HumanAgentNotFoundError extends Error {}
export class TicketNotOwnedError extends Error {}
export class PendingMessageDeliveryError extends Error {}
export class InvalidHumanAttachmentError extends Error {}
export class SuggestedReplyNotConfiguredError extends Error {}
export class TicketNotAvailableForTakeoverError extends Error {}
export class TicketNotAvailableForAssignmentError extends Error {}
export class TicketNotFoundError extends Error {}
export class InvalidTicketsCursorError extends Error {
  constructor() {
    super("Invalid Tickets cursor.");
  }
}

type InboxUser = { id: string; role: "ADMIN" | "HUMAN_AGENT" };

const ticketListSelect = {
  assignedHumanAgent: { select: { id: true, name: true } },
  category: true,
  createdAt: true,
  channel: { select: { name: true, type: true } },
  customerIdentity: { select: { email: true, id: true, name: true, phoneE164: true } },
  id: true,
  priority: true,
  resolvedAt: true,
  status: true,
  title: true,
  updatedAt: true,
} as const;

const ticketDetailSelect = {
  ...ticketListSelect,
  escalatedAt: true,
  escalationReason: true,
  escalationSummary: true,
  escalationSummaryStatus: true,
  resolutionReason: true,
  resolvedBy: true,
  aiActivities: {
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, eventType: true, id: true, metadata: true },
  },
  session: { select: { createdAt: true, id: true } },
} as const;

const transcriptSelect = {
  attachments: {
    select: {
      fileName: true,
      failureReason: true,
      id: true,
      mimeType: true,
      processingStatus: true,
      sizeBytes: true,
    },
  },
  content: true,
  createdAt: true,
  deliveryFailureReason: true,
  deliveryStatus: true,
  id: true,
  position: true,
  senderType: true,
  senderUserId: true,
} as const;

/** An Admin sees the whole Workspace; a Human Agent sees the queue, their own
 * Tickets, and Tickets they previously resolved — never the whole Workspace. */
export function ticketVisibilityWhere(user: InboxUser): Prisma.TicketWhereInput {
  if (user.role === "ADMIN") return {};
  return {
    OR: [
      { assignedHumanAgentId: null, status: "ESCALATED" },
      { assignedHumanAgentId: user.id },
      { resolvedBy: user.id },
    ],
  };
}

export async function listTickets(user: InboxUser, filters: ListTicketsQuery) {
  const cursorTicket = filters.cursor
    ? await prisma.ticket.findUnique({
        select: { createdAt: true, id: true },
        where: { id: filters.cursor },
      })
    : null;
  if (filters.cursor && !cursorTicket) throw new InvalidTicketsCursorError();

  const where: Prisma.TicketWhereInput = {
    AND: [
      ticketVisibilityWhere(user),
      { deletedAt: null },
      ...(filters.status?.length ? [{ status: { in: filters.status } }] : []),
      ...(filters.category?.length ? [{ category: { in: filters.category } }] : []),
      ...(filters.priority?.length ? [{ priority: { in: filters.priority } }] : []),
      ...(filters.assigneeId ? [{ assignedHumanAgentId: filters.assigneeId }] : []),
      ...(filters.search
        ? [
            {
              customerIdentity: {
                OR: [
                  { name: { contains: filters.search, mode: "insensitive" as const } },
                  { email: { contains: filters.search, mode: "insensitive" as const } },
                  { phoneE164: { contains: filters.search, mode: "insensitive" as const } },
                ],
              },
            },
          ]
        : []),
      ...(cursorTicket
        ? [
            {
              OR: [
                { createdAt: { lt: cursorTicket.createdAt } },
                { AND: [{ createdAt: cursorTicket.createdAt }, { id: { lt: cursorTicket.id } }] },
              ],
            },
          ]
        : []),
    ],
  };

  const tickets = await prisma.ticket.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: ticketListSelect,
    take: filters.limit + 1,
    where,
  });

  const visibleTickets = tickets.slice(0, filters.limit);
  return {
    nextCursor: tickets.length > filters.limit ? (visibleTickets.at(-1)?.id ?? null) : null,
    tickets: await attachUnreadCounts(user.id, visibleTickets),
  };
}

export async function getTicketDetail(ticketId: string, user: InboxUser) {
  const ticket = await prisma.ticket.findFirst({
    select: ticketDetailSelect,
    where: { AND: [{ deletedAt: null, id: ticketId }, ticketVisibilityWhere(user)] },
  });
  if (!ticket) throw new TicketNotFoundError();
  // The transcript spans the whole Session, so Messages persisted before the
  // Ticket existed are part of the same conversation history.
  const messages = await prisma.message.findMany({
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: transcriptSelect,
    where: { deletedAt: null, sessionId: ticket.session.id },
  });
  const [withUnread] = await attachUnreadCounts(user.id, [{ ...ticket, messages }]);
  return withUnread;
}

/** Unread counts are computed against Session.messageSeq positions in one
 * grouped query rather than by loading every transcript. Only Customer
 * Messages count, and the count is personal to `userId` — another Human
 * Agent's read state never affects it. */
async function attachUnreadCounts<T extends { id: string }>(userId: string, tickets: T[]) {
  if (!tickets.length) return tickets.map((ticket) => ({ ...ticket, unreadCount: 0 }));
  const rows = await prisma.$queryRaw<{ ticketId: string; count: bigint }[]>`
    SELECT m."ticketId" as "ticketId", COUNT(*)::bigint as count
    FROM "Message" m
    LEFT JOIN "TicketReadState" r ON r."ticketId" = m."ticketId" AND r."userId" = ${userId}
    WHERE m."ticketId" = ANY(${tickets.map((ticket) => ticket.id)})
      AND m."senderType" = 'CUSTOMER'
      AND m.position > COALESCE(r."lastReadPosition", 0)
    GROUP BY m."ticketId"
  `;
  const counts = new Map(rows.map((row) => [row.ticketId, Number(row.count)]));
  return tickets.map((ticket) => ({ ...ticket, unreadCount: counts.get(ticket.id) ?? 0 }));
}

export async function listSharedHumanQueue(viewerId: string) {
  const tickets = await prisma.ticket.findMany({
    orderBy: { escalatedAt: "asc" },
    select: ticketSelect,
    where: { assignedHumanAgentId: null, status: "ESCALATED" },
  });
  return attachUnreadCounts(viewerId, tickets);
}

export async function listMyTickets(humanAgentId: string) {
  const tickets = await prisma.ticket.findMany({
    orderBy: { updatedAt: "desc" },
    select: ticketSelect,
    where: { assignedHumanAgentId: humanAgentId, status: "HUMAN_HANDLING" },
  });
  return attachUnreadCounts(humanAgentId, tickets);
}

/** Persists the caller's last-read Message position for a Ticket. The
 * ON CONFLICT clause takes the max of the stored and incoming position, so
 * an out-of-order or duplicate call can never regress read state. */
export async function markTicketRead(ticketId: string, user: InboxUser, position: number) {
  const ticket = await prisma.ticket.findFirst({
    select: { session: { select: { messageSeq: true } }, workspaceId: true },
    where: { AND: [{ deletedAt: null, id: ticketId }, ticketVisibilityWhere(user)] },
  });
  if (!ticket) throw new TicketNotFoundError();
  const clamped = Math.min(Math.max(position, 0), ticket.session.messageSeq);
  await prisma.$executeRaw`
    INSERT INTO "TicketReadState" ("id", "workspaceId", "ticketId", "userId", "lastReadPosition", "updatedAt")
    VALUES (${randomUUID()}, ${ticket.workspaceId}, ${ticketId}, ${user.id}, ${clamped}, now())
    ON CONFLICT ("ticketId", "userId") DO UPDATE
      SET "lastReadPosition" = GREATEST("TicketReadState"."lastReadPosition", EXCLUDED."lastReadPosition"),
          "updatedAt" = now()
  `;
  return { lastReadPosition: clamped };
}

export function listAiHandlingTickets(workspaceId: string) {
  return prisma.ticket.findMany({
    orderBy: { updatedAt: "desc" },
    select: ticketSelect,
    where: { status: "AI_HANDLING", workspaceId },
  });
}

/** The conditional transition makes Takeover safe against a concurrent AI
 * completion. Cancelling first prevents any provisional stream from becoming
 * a finished AI message while the transaction is in progress. */
export async function takeOverTicket(ticketId: string, adminId: string, workspaceId: string) {
  cancelTicketGeneration(ticketId);
  const result = await unscopedPrisma.$transaction(async (tx) => {
    const transition = await tx.ticket.updateMany({
      data: { assignedHumanAgentId: adminId, status: "HUMAN_HANDLING" },
      where: { id: ticketId, status: "AI_HANDLING", workspaceId },
    });
    if (!transition.count) throw new TicketNotAvailableForTakeoverError();
    const ticket = await tx.ticket.findUniqueOrThrow({
      select: { sessionId: true },
      where: { id: ticketId },
    });
    const admin = await tx.user.findUniqueOrThrow({
      where: { id: adminId },
      select: { name: true },
    });
    const content = `Hello, I’m ${admin.name} from the support team. I’ve taken over and will continue helping you.`;
    const message = await tx.message.create({
      data: {
        ...(await claimMessageSlot(tx, ticket.sessionId)),
        content,
        deliveryStatus: "PENDING",
        externalMessageId: `takeover:${randomUUID()}`,
        message: { content },
        role: "system",
        senderType: "SYSTEM",
        ticketId,
        workspaceId,
      },
    });
    await tx.aiActivity.create({
      data: {
        eventType: "TAKEN_OVER",
        id: randomUUID(),
        metadata: { adminId },
        ticketId,
        workspaceId,
      },
    });
    return {
      message,
      ticket: await tx.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: ticketSelect }),
    };
  });
  await publishWidgetEvent(ticketId, { type: "message.created", data: result.message });
  await cancelFollowUpTimers(ticketId);
  await scheduleIdleClosureForTicket(ticketId, workspaceId);
  await publishWidgetEvent(ticketId, { type: "ticket.status", data: { status: "ready" } });
  await publishTicketQueueEvent(workspaceId);
  return result.ticket;
}

/** The status predicate is the concurrency guard: exactly one UPDATE can
 * transition an escalated, unassigned Ticket to a named Human Agent. */
export async function claimTicket(ticketId: string, humanAgentId: string, workspaceId: string) {
  const claimed = await prisma.$transaction(async (tx) => {
    const transition = await tx.ticket.updateMany({
      data: { assignedHumanAgentId: humanAgentId, status: "HUMAN_HANDLING" },
      where: { assignedHumanAgentId: null, id: ticketId, status: "ESCALATED" },
    });
    if (!transition.count) throw new TicketAlreadyClaimedError();
    await tx.aiActivity.create({
      data: {
        eventType: "CLAIMED",
        id: randomUUID(),
        metadata: { humanAgentId },
        ticketId,
        workspaceId,
      },
    });
    return tx.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: ticketSelect });
  });
  await publishTicketQueueEvent(workspaceId);
  await cancelFollowUpTimers(ticketId);
  await scheduleIdleClosureForTicket(ticketId, workspaceId);
  return claimed;
}

/** Handoff deliberately happens after the conditional Claim transaction. A
 * summary failure must never take a Ticket away from its Human Agent. */
export async function completeHandoff(ticketId: string, humanAgentId: string, workspaceId: string) {
  const ticket = await unscopedPrisma.ticket.findFirst({
    select: {
      assignedHumanAgent: { select: { name: true } },
      aiAgent: { select: { handoffMessage: true } },
      escalationReason: true,
      id: true,
      messages: {
        orderBy: { position: "asc" },
        select: { content: true, senderType: true },
      },
      aiActivities: {
        orderBy: { createdAt: "asc" },
        select: { eventType: true, metadata: true },
      },
      status: true,
      title: true,
    },
    where: {
      assignedHumanAgentId: humanAgentId,
      id: ticketId,
      status: "HUMAN_HANDLING",
      workspaceId,
    },
  });
  if (!ticket?.assignedHumanAgent || !ticket.escalationReason) return;

  const handoffMessage = await appendHandoffMessage({
    message: ticket.aiAgent.handoffMessage,
    humanAgentName: ticket.assignedHumanAgent.name,
    ticketId,
    workspaceId,
  });
  await publishWidgetEvent(ticketId, { type: "message.created", data: handoffMessage });

  try {
    if (!aiAgentConfig.apiKey) throw new Error("AI Agent is not configured.");
    const summary = await generateEscalationSummary({
      model: createReplyModel({ ...aiAgentConfig, apiKey: aiAgentConfig.apiKey }),
      ticket: {
        escalationReason: ticket.escalationReason,
        messages: ticket.messages,
        recordedActivity: ticket.aiActivities
          .map((activity) => `${activity.eventType}: ${JSON.stringify(activity.metadata)}`)
          .join("\n"),
        title: ticket.title,
      },
    });
    await unscopedPrisma.$transaction(async (tx) => {
      await tx.ticket.update({
        data: { escalationSummary: summary, escalationSummaryStatus: "READY" },
        where: { id: ticketId },
      });
      await tx.aiActivity.create({
        data: {
          eventType: "SUMMARY_GENERATED",
          id: randomUUID(),
          metadata: { outcome: "SUCCESS" },
          ticketId,
          workspaceId,
        },
      });
    });
  } catch {
    await unscopedPrisma.$transaction(async (tx) => {
      await tx.ticket.update({
        data: { escalationSummaryStatus: "FAILED" },
        where: { id: ticketId },
      });
      await tx.aiActivity.create({
        data: {
          eventType: "SUMMARY_GENERATED",
          id: randomUUID(),
          metadata: { outcome: "FAILED" },
          ticketId,
          workspaceId,
        },
      });
    });
  }
  await publishTicketQueueEvent(workspaceId);
}

async function appendHandoffMessage(input: {
  humanAgentName: string;
  message: string | null;
  ticketId: string;
  workspaceId: string;
}) {
  const content = (
    input.message ?? "Hello, I’m {humanAgentName} from the support team. I’ll continue helping you."
  ).replaceAll("{humanAgentName}", input.humanAgentName);
  return unscopedPrisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUniqueOrThrow({
      select: { sessionId: true },
      where: { id: input.ticketId },
    });
    const message = await tx.message.create({
      data: {
        ...(await claimMessageSlot(tx, ticket.sessionId)),
        content,
        externalMessageId: `handoff:${randomUUID()}`,
        message: { content },
        role: "system",
        senderType: "SYSTEM",
        ticketId: input.ticketId,
        workspaceId: input.workspaceId,
      },
    });
    await tx.aiActivity.create({
      data: {
        eventType: "HANDOFF_SENT",
        id: randomUUID(),
        metadata: { humanAgentName: input.humanAgentName },
        ticketId: input.ticketId,
        workspaceId: input.workspaceId,
      },
    });
    return message;
  });
}

export async function reassignTicket(ticketId: string, humanAgentId: string, workspaceId: string) {
  const humanAgent = await prisma.user.findFirst({
    select: { id: true },
    where: { id: humanAgentId, role: "HUMAN_AGENT" },
  });
  if (!humanAgent) throw new HumanAgentNotFoundError();
  const transition = await prisma.ticket.updateMany({
    data: { assignedHumanAgentId: humanAgent.id, status: "HUMAN_HANDLING" },
    where: {
      id: ticketId,
      OR: [{ assignedHumanAgentId: null, status: "ESCALATED" }, { status: "HUMAN_HANDLING" }],
    },
  });
  if (!transition.count) throw new TicketNotAvailableForAssignmentError();
  const ticket = await prisma.ticket.findUniqueOrThrow({
    select: ticketSelect,
    where: { id: ticketId },
  });
  await publishTicketQueueEvent(workspaceId);
  await cancelFollowUpTimers(ticketId);
  await scheduleIdleClosureForTicket(ticketId, workspaceId);
  return ticket;
}

export async function sendHumanReply(
  ticketId: string,
  humanAgentId: string,
  content: string,
  idempotencyKey: string,
) {
  const externalMessageId = `human:${ticketId}:${idempotencyKey}`;
  const create = () =>
    unscopedPrisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findFirst({
        where: { assignedHumanAgentId: humanAgentId, id: ticketId, status: "HUMAN_HANDLING" },
      });
      if (!ticket) throw new TicketNotOwnedError();
      const existing = await tx.message.findFirst({ where: { externalMessageId, ticketId } });
      if (existing) return { deliver: existing.deliveryStatus === "FAILED", message: existing };
      const message = await tx.message.create({
        data: {
          ...(await claimMessageSlot(tx, ticket.sessionId)),
          content,
          deliveryStatus: "PENDING",
          externalMessageId,
          message: { content },
          role: "assistant",
          senderType: "HUMAN_AGENT",
          senderUserId: humanAgentId,
          ticketId,
          workspaceId: ticket.workspaceId,
        },
      });
      return { deliver: true, message };
    });
  let result: Awaited<ReturnType<typeof create>>;
  try {
    result = await create();
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002")
      throw error;
    const message = await unscopedPrisma.message.findFirst({
      where: { externalMessageId, ticketId },
    });
    if (!message) throw error;
    result = { deliver: message.deliveryStatus === "FAILED", message };
  }
  const message = result.deliver ? await deliverMessage(result.message) : result.message;
  await publishTicketQueueEvent(message.workspaceId);
  return message;
}

export async function sendHumanAttachmentReply(
  ticketId: string,
  humanAgentId: string,
  content: string | undefined,
  files: File[],
  idempotencyKey: string,
) {
  if (!files.length) throw new InvalidHumanAttachmentError();
  if (files.length > webAttachmentCapability.maxFilesPerMessage)
    throw new InvalidHumanAttachmentError();
  if (
    files.some(
      (file) =>
        !webAttachmentCapability.mimeTypes.includes(file.type) ||
        !file.size ||
        file.size > webAttachmentCapability.maxFileSizeBytes,
    )
  )
    throw new InvalidHumanAttachmentError();
  const text = content?.trim() ?? "";
  const externalMessageId = `human:${ticketId}:${idempotencyKey}`;
  const owner = await unscopedPrisma.ticket.findFirst({
    where: { assignedHumanAgentId: humanAgentId, id: ticketId, status: "HUMAN_HANDLING" },
  });
  if (!owner) throw new TicketNotOwnedError();
  const existing = await unscopedPrisma.message.findFirst({
    where: { externalMessageId, ticketId },
  });
  if (existing) return existing.deliveryStatus === "FAILED" ? deliverMessage(existing) : existing;
  const uploads = await Promise.all(
    files.map(async (file) => {
      const id = randomUUID();
      const key = `attachments/outbound/${ticketId}/${id}`;
      await createStorage(storageConfig).putObject({
        body: Buffer.from(await file.arrayBuffer()),
        contentType: file.type,
        key,
      });
      return { file, id, key };
    }),
  );
  const message = await unscopedPrisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findFirst({
      where: { assignedHumanAgentId: humanAgentId, id: ticketId, status: "HUMAN_HANDLING" },
    });
    if (!ticket) throw new TicketNotOwnedError();
    return tx.message.create({
      data: {
        ...(await claimMessageSlot(tx, ticket.sessionId)),
        attachments: {
          create: uploads.map(({ file, id, key }) => ({
            fileName: file.name,
            id,
            mimeType: file.type,
            processingStatus: "READY",
            sizeBytes: file.size,
            storageKey: key,
            ticketId,
            workspaceId: ticket.workspaceId,
          })),
        },
        content: text,
        deliveryStatus: "PENDING",
        externalMessageId,
        message: { content: text },
        role: "assistant",
        senderType: "HUMAN_AGENT",
        senderUserId: humanAgentId,
        ticketId,
        workspaceId: ticket.workspaceId,
      },
      include: { attachments: true },
    });
  });
  const delivered = await deliverMessage(message);
  await publishTicketQueueEvent(delivered.workspaceId);
  return delivered;
}

export async function retryHumanReply(ticketId: string, humanAgentId: string, messageId: string) {
  const message = await unscopedPrisma.message.findFirst({
    include: { attachments: true },
    where: {
      deliveryStatus: "FAILED",
      id: messageId,
      senderType: "HUMAN_AGENT",
      ticket: { assignedHumanAgentId: humanAgentId, id: ticketId, status: "HUMAN_HANDLING" },
    },
  });
  if (!message) throw new TicketNotOwnedError();
  const delivered = await deliverMessage(message);
  await publishTicketQueueEvent(message.workspaceId);
  return delivered;
}

export async function suggestReply(ticketId: string, humanAgentId: string, workspaceId: string) {
  if (!aiAgentConfig.apiKey || !embeddingConfig.apiKey)
    throw new SuggestedReplyNotConfiguredError();
  const ticket = await unscopedPrisma.ticket.findFirst({
    select: {
      aiAgentId: true,
      customerIdentity: { select: { email: true, externalCustomerId: true, id: true } },
      id: true,
      messages: {
        orderBy: { position: "asc" },
        select: { content: true, senderType: true },
      },
    },
    where: {
      assignedHumanAgentId: humanAgentId,
      id: ticketId,
      status: "HUMAN_HANDLING",
      workspaceId,
    },
  });
  if (!ticket) throw new TicketNotOwnedError();

  const customerMessage = [...ticket.messages]
    .reverse()
    .find((message) => message.senderType === "CUSTOMER")?.content;
  if (!customerMessage) throw new Error("A Customer message is required to draft a reply.");

  const embeddingClient = createEmbeddingClient({
    ...embeddingConfig,
    apiKey: embeddingConfig.apiKey,
  });
  const [embedding] = await embeddingClient.embed([customerMessage]);
  const sources = embedding
    ? await findKnowledgeChunks(unscopedPrisma, {
        embedding,
        retrievalMode: "COPILOT",
        workspaceId,
      })
    : [];
  const previousTickets = await unscopedPrisma.ticket.findMany({
    orderBy: { resolvedAt: "desc" },
    select: {
      messages: { orderBy: { position: "asc" }, select: { content: true, senderType: true } },
      title: true,
    },
    take: 3,
    where: {
      customerIdentityId: ticket.customerIdentity.id,
      id: { not: ticketId },
      resolvedAt: { not: null },
      workspaceId,
    },
  });
  const businessData = await getCopilotToolData(
    ticketId,
    workspaceId,
    ticket.aiAgentId,
    ticket.customerIdentity,
  );
  const draft = await generateSuggestedReply({
    businessData,
    customerMessage,
    customerSafeSources: sources
      .filter((source) => source.visibility === "CUSTOMER_SAFE")
      .map((source) => source.content),
    currentConversation: ticket.messages
      .map((message) => `${message.senderType}: ${message.content}`)
      .join("\n"),
    internalOnlySources: sources
      .filter((source) => source.visibility === "INTERNAL_ONLY")
      .map((source) => source.content),
    model: createReplyModel({ ...aiAgentConfig, apiKey: aiAgentConfig.apiKey }),
    previousTicketContext: previousTickets
      .map(
        (previous) =>
          `${previous.title}\n${previous.messages.map((message) => `${message.senderType}: ${message.content}`).join("\n")}`,
      )
      .join("\n\n"),
  });
  await unscopedPrisma.aiActivity.createMany({
    data: [
      {
        eventType: "KNOWLEDGE_RETRIEVED",
        id: randomUUID(),
        metadata: {
          chunkIds: sources.map((source) => source.chunkId),
          knowledgeSourceIds: sources.map((source) => source.knowledgeSourceId),
          retrievalMode: "COPILOT",
        },
        ticketId,
        workspaceId,
      },
      {
        eventType: "SUGGESTED_REPLY_GENERATED",
        id: randomUUID(),
        metadata: { outcome: "SUCCESS" },
        ticketId,
        workspaceId,
      },
    ],
  });
  return { content: draft };
}

/** AI Copilot has no model-directed tool-calling loop of its own, so it
 * resolves Tools through the same assignment service as the AI Agent runtime
 * and eagerly runs every assigned, non-BUILT_IN, READ_ONLY Tool (Knowledge
 * retrieval already happens separately above); it never executes a MUTATING
 * Tool. */
async function getCopilotToolData(
  ticketId: string,
  workspaceId: string,
  aiAgentId: string,
  identity: { email: string | null; externalCustomerId: string | null; id: string },
) {
  const assignedTools = (await resolveTools(aiAgentId)).filter(
    (tool) => tool.origin !== "BUILT_IN" && tool.risk === "READ_ONLY",
  );
  if (!assignedTools.length) return undefined;

  let customerId = identity.externalCustomerId;
  if (!customerId) {
    if (!identity.email) return undefined;
    const businessTools = createBusinessTools(apiConfig.businessSystemUrl);
    const customer = await businessTools.getCustomerByEmail(identity.email);
    if (!customer) return undefined;
    customerId = customer.id;
    await unscopedPrisma.customerIdentity.update({
      data: { externalCustomerId: customerId },
      where: { id: identity.id },
    });
  }

  const results = await executeReadOnlyAssignedTools({
    aiAgentId,
    input: { customerId },
    ticketId,
    tools: assignedTools,
    workspaceId,
  });
  return Object.keys(results).length ? JSON.stringify(results) : undefined;
}

export async function resolveTicket(
  ticketId: string,
  humanAgentId: string,
  resolutionReason: "HUMAN_RESOLVED",
) {
  const closing = await unscopedPrisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findFirst({
      include: { workspace: { select: { closingMessage: true } } },
      where: { assignedHumanAgentId: humanAgentId, id: ticketId, status: "HUMAN_HANDLING" },
    });
    if (!ticket) throw new TicketNotOwnedError();
    if (
      await tx.message.findFirst({
        where: { deliveryStatus: "PENDING", senderType: "HUMAN_AGENT", ticketId },
      })
    )
      throw new PendingMessageDeliveryError();
    await tx.ticket.update({
      data: {
        resolvedAt: new Date(),
        resolvedBy: humanAgentId,
        resolutionReason,
        status: "RESOLVED",
      },
      where: { id: ticketId },
    });
    const content = ticket.workspace.closingMessage ?? "This conversation has been resolved.";
    const message = await tx.message.create({
      data: {
        ...(await claimMessageSlot(tx, ticket.sessionId)),
        content,
        deliveryStatus: "PENDING",
        externalMessageId: `resolution:${randomUUID()}`,
        message: { content },
        role: "system",
        senderType: "SYSTEM",
        ticketId,
        workspaceId: ticket.workspaceId,
      },
    });
    await tx.session.update({ data: { status: "CLOSED" }, where: { id: ticket.sessionId } });
    await tx.aiActivity.create({
      data: {
        eventType: "RESOLVED",
        id: randomUUID(),
        metadata: { reason: resolutionReason },
        ticketId,
        workspaceId: ticket.workspaceId,
      },
    });
    return message;
  });
  const delivered = await deliverMessage(closing);
  await cancelFollowUpTimers(ticketId);
  await enqueueTicketKnowledgeIndex({ ticketId, workspaceId: closing.workspaceId });
  await publishWidgetEvent(ticketId, { type: "ticket.status", data: { status: "resolved" } });
  await publishTicketQueueEvent(closing.workspaceId);
  return delivered;
}

/**
 * Soft-deletes a Ticket and, in the same transaction, its indexed Ticket
 * Knowledge chunks — so the retrieval a returning Customer relies on stops
 * seeing this Ticket's content immediately, not on the next re-index.
 */
export async function deleteTicket(ticketId: string, adminId: string, workspaceId: string) {
  await unscopedPrisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findFirst({
      select: { id: true },
      where: { deletedAt: null, id: ticketId, status: "RESOLVED", workspaceId },
    });
    if (!ticket) throw new TicketNotFoundError();

    await tx.ticket.update({
      data: { deletedAt: new Date(), deletedBy: adminId },
      where: { id: ticketId },
    });
    await tx.chunk.updateMany({
      data: { deletedAt: new Date() },
      where: { deletedAt: null, kind: "TICKET", ticketId, workspaceId },
    });
  });
  await cancelFollowUpTimers(ticketId);
  await publishTicketQueueEvent(workspaceId);
}

async function deliverMessage(message: Awaited<ReturnType<typeof unscopedPrisma.message.create>>) {
  if (!message.ticketId) return message;
  let attempts = 0;
  while (attempts < 3) {
    attempts += 1;
    try {
      await publishWidgetEvent(message.ticketId, { type: "message.created", data: message });
      return unscopedPrisma.message.update({
        data: { deliveryAttempts: attempts, deliveryStatus: "SENT" },
        where: { id: message.id },
      });
    } catch {
      // The message remains durable and will also replay when the Widget reconnects.
    }
  }
  return unscopedPrisma.message.update({
    data: { deliveryAttempts: attempts, deliveryStatus: "FAILED" },
    where: { id: message.id },
  });
}
