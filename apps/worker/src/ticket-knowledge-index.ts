import { randomUUID } from "node:crypto";
import { chunkText, createOpenAiEmbeddingClient, replaceTicketChunks } from "@repo/knowledge";
import { embeddingConfig } from "./config";
import { prisma } from "./prisma";

export type TicketKnowledgeIndexJob = {
  ticketId: string;
  workspaceId: string;
};

const senderLabel: Record<string, string> = {
  AI_AGENT: "AI Agent",
  CUSTOMER: "Customer",
  HUMAN_AGENT: "Human Agent",
};

/**
 * Indexes one resolved Ticket as customer-scoped Ticket Knowledge: the
 * conversation, relevant metadata, and any processed attachment content
 * become embedded Chunks a returning Customer's later Ticket can retrieve —
 * scoped to the same Workspace, Customer Identity, and Channel. A failure
 * here never changes the Ticket's own status (it stays resolved); it is
 * logged and left to BullMQ's retry policy.
 */
export async function processTicketKnowledgeIndexJob(job: {
  data: TicketKnowledgeIndexJob;
}): Promise<void> {
  const { ticketId, workspaceId } = job.data;

  const ticket = await prisma.ticket.findFirst({
    select: {
      category: true,
      channel: { select: { type: true } },
      customerIdentityId: true,
      deletedAt: true,
      status: true,
      title: true,
      attachments: {
        select: { extractedText: true },
        where: { deletedAt: null, extractedText: { not: null }, processingStatus: "READY" },
      },
      messages: {
        orderBy: { position: "asc" },
        select: { content: true, senderType: true },
        where: { deletedAt: null, senderType: { in: ["CUSTOMER", "AI_AGENT", "HUMAN_AGENT"] } },
      },
    },
    where: { id: ticketId, workspaceId },
  });

  if (!ticket || ticket.deletedAt || ticket.status !== "RESOLVED") {
    // The Ticket was soft-deleted or reopened before indexing ran; nothing to index.
    return;
  }

  const content = buildTicketKnowledgeContent(ticket);
  if (!content.trim()) return;

  // Nothing here touches the Ticket's own status: it stays resolved whether
  // this succeeds or throws. A thrown error is logged by `runWorker`'s
  // `.on("failed", ...)` handler and retried by BullMQ (see the enqueue call).
  if (!embeddingConfig.apiKey) {
    throw new Error("Configure OPENROUTER_API_KEY to index Ticket Knowledge.");
  }

  const chunks = chunkText(content);
  const embeddingClient = createOpenAiEmbeddingClient({
    apiKey: embeddingConfig.apiKey,
    baseUrl: embeddingConfig.baseUrl,
    modelId: embeddingConfig.modelId,
  });
  const vectors = chunks.length
    ? await embeddingClient.embed(chunks.map((chunk) => chunk.content))
    : [];

  await prisma.$transaction(async (tx) => {
    // Deletion can happen while embeddings are being generated. Recheck it
    // inside this transaction before writing chunks, otherwise a
    // soft-deleted Ticket could be repopulated with retrievable chunks.
    const stillEligible = await tx.ticket.findFirst({
      select: { id: true },
      where: { deletedAt: null, id: ticketId, status: "RESOLVED", workspaceId },
    });
    if (!stillEligible) return;

    await replaceTicketChunks(tx, {
      channelType: ticket.channel.type,
      chunks: chunks.map((chunk, index) => ({
        content: chunk.content,
        embedding: vectors[index] ?? [],
        position: chunk.position,
      })),
      customerIdentityId: ticket.customerIdentityId,
      ticketId,
      workspaceId,
    });

    await tx.aiActivity.create({
      data: {
        eventType: "TICKET_KNOWLEDGE_INDEXED",
        id: randomUUID(),
        metadata: { chunkCount: chunks.length },
        ticketId,
        workspaceId,
      },
    });
  });
}

function buildTicketKnowledgeContent(ticket: {
  category: string;
  title: string;
  messages: Array<{ content: string; senderType: string }>;
  attachments: Array<{ extractedText: string | null }>;
}): string {
  const sections: string[] = [`Ticket: ${ticket.title} (${ticket.category})`];

  const conversation = ticket.messages
    .map((message) => `${senderLabel[message.senderType] ?? message.senderType}: ${message.content}`)
    .join("\n");
  if (conversation) sections.push(conversation);

  for (const attachment of ticket.attachments) {
    if (attachment.extractedText) sections.push(attachment.extractedText);
  }

  return sections.join("\n\n");
}
