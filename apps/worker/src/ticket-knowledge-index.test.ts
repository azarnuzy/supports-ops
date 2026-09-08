import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  aiActivityCreate: vi.fn(),
  chunkText: vi.fn(),
  createOpenAiEmbeddingClient: vi.fn(),
  embed: vi.fn(),
  replaceTicketChunks: vi.fn(),
  ticketFindFirst: vi.fn(),
  txTicketFindFirst: vi.fn(),
}));

vi.mock("@repo/knowledge", () => ({
  chunkText: mocks.chunkText,
  createOpenAiEmbeddingClient: mocks.createOpenAiEmbeddingClient,
  replaceTicketChunks: mocks.replaceTicketChunks,
}));

vi.mock("./config", () => ({
  embeddingConfig: {
    apiKey: "sk-test",
    baseUrl: "https://openrouter.ai/api/v1",
    modelId: "openai/text-embedding-3-small",
  },
}));

vi.mock("./prisma", () => ({
  prisma: {
    $transaction: (operation: (tx: unknown) => Promise<unknown>) =>
      operation({
        aiActivity: { create: mocks.aiActivityCreate },
        ticket: { findFirst: mocks.txTicketFindFirst },
      }),
    ticket: { findFirst: mocks.ticketFindFirst },
  },
}));

const { processTicketKnowledgeIndexJob } = await import("./ticket-knowledge-index");

const baseJob = { data: { ticketId: "t-1", workspaceId: "ws-1" } };

const resolvedTicket = {
  attachments: [{ extractedText: "Invoice #123 shows a duplicate charge." }],
  category: "BILLING",
  channel: { type: "WEB" as const },
  customerIdentityId: "cust-1",
  deletedAt: null,
  messages: [
    { content: "I was charged twice.", senderType: "CUSTOMER" },
    { content: "I've refunded the duplicate charge.", senderType: "AI_AGENT" },
  ],
  status: "RESOLVED",
  title: "Duplicate charge",
};

function resetMocks() {
  mocks.ticketFindFirst.mockReset().mockResolvedValue(resolvedTicket);
  mocks.chunkText.mockReset().mockReturnValue([{ content: "I was charged twice.", position: 0 }]);
  mocks.createOpenAiEmbeddingClient.mockReset().mockReturnValue({ embed: mocks.embed });
  mocks.embed.mockReset().mockResolvedValue([[0.1, 0.2]]);
  mocks.txTicketFindFirst.mockReset().mockResolvedValue({ id: "t-1" });
  mocks.replaceTicketChunks.mockReset().mockResolvedValue(undefined);
  mocks.aiActivityCreate.mockReset().mockResolvedValue(undefined);
}

describe("processTicketKnowledgeIndexJob", () => {
  beforeEach(resetMocks);

  it("chunks, embeds, and indexes a resolved Ticket's conversation and attachments", async () => {
    await processTicketKnowledgeIndexJob(baseJob);

    expect(mocks.embed).toHaveBeenCalledTimes(1);
    const call = mocks.embed.mock.calls[0] as [string[]];
    const [indexedText] = call[0];
    expect(indexedText).toContain("I was charged twice.");

    expect(mocks.replaceTicketChunks).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        channelType: "WEB",
        customerIdentityId: "cust-1",
        ticketId: "t-1",
        workspaceId: "ws-1",
      }),
    );
    expect(mocks.aiActivityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "TICKET_KNOWLEDGE_INDEXED",
        ticketId: "t-1",
        workspaceId: "ws-1",
      }),
    });
  });

  it("skips a Ticket that is no longer resolved", async () => {
    mocks.ticketFindFirst.mockResolvedValue({ ...resolvedTicket, status: "AI_HANDLING" });

    await processTicketKnowledgeIndexJob(baseJob);

    expect(mocks.embed).not.toHaveBeenCalled();
    expect(mocks.replaceTicketChunks).not.toHaveBeenCalled();
  });

  it("skips a Ticket that was soft-deleted", async () => {
    mocks.ticketFindFirst.mockResolvedValue({ ...resolvedTicket, deletedAt: new Date() });

    await processTicketKnowledgeIndexJob(baseJob);

    expect(mocks.embed).not.toHaveBeenCalled();
  });

  it("does not restore chunks when the Ticket was deleted during embedding", async () => {
    mocks.txTicketFindFirst.mockResolvedValue(null);

    await processTicketKnowledgeIndexJob(baseJob);

    expect(mocks.replaceTicketChunks).not.toHaveBeenCalled();
    expect(mocks.aiActivityCreate).not.toHaveBeenCalled();
  });

  it("leaves the Ticket resolved and rethrows when embedding fails", async () => {
    mocks.embed.mockRejectedValue(new Error("provider timed out"));

    await expect(processTicketKnowledgeIndexJob(baseJob)).rejects.toThrow("provider timed out");

    expect(mocks.replaceTicketChunks).not.toHaveBeenCalled();
  });
});
