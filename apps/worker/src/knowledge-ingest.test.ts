import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chunkText: vi.fn(),
  createOpenAiEmbeddingClient: vi.fn(),
  embed: vi.fn(),
  findFirst: vi.fn(),
  replaceChunks: vi.fn(),
  txKnowledgeSourceFindFirst: vi.fn(),
  txKnowledgeSourceUpdate: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@repo/knowledge", () => ({
  chunkText: mocks.chunkText,
  createOpenAiEmbeddingClient: mocks.createOpenAiEmbeddingClient,
  replaceChunks: mocks.replaceChunks,
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
        knowledgeSource: {
          findFirst: mocks.txKnowledgeSourceFindFirst,
          update: mocks.txKnowledgeSourceUpdate,
        },
      }),
    knowledgeSource: { findFirst: mocks.findFirst, update: mocks.update },
  },
}));

const { processKnowledgeIngestJob } = await import("./knowledge-ingest");

const baseJob = {
  data: {
    content: "Click the forgot password link.",
    knowledgeSourceId: "ks-1",
    title: "How to reset password",
    visibility: "CUSTOMER_SAFE" as const,
    workspaceId: "ws-1",
  },
};

function resetMocks() {
  mocks.chunkText
    .mockReset()
    .mockReturnValue([{ content: "Click the forgot password link.", position: 0 }]);
  mocks.createOpenAiEmbeddingClient.mockReset().mockReturnValue({ embed: mocks.embed });
  mocks.embed.mockReset().mockResolvedValue([[0.1, 0.2]]);
  mocks.findFirst.mockReset().mockResolvedValue({ id: "ks-1" });
  mocks.txKnowledgeSourceFindFirst.mockReset().mockResolvedValue({ id: "ks-1" });
  mocks.replaceChunks.mockReset().mockResolvedValue(undefined);
  mocks.txKnowledgeSourceUpdate.mockReset().mockResolvedValue(undefined);
  mocks.update.mockReset().mockResolvedValue(undefined);
}

describe("processKnowledgeIngestJob", () => {
  beforeEach(resetMocks);

  it("chunks, embeds, and indexes an active source before publishing it", async () => {
    await processKnowledgeIngestJob(baseJob);

    expect(mocks.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: { deletedAt: null, id: "ks-1", workspaceId: "ws-1" },
    });
    expect(mocks.embed).toHaveBeenCalledWith(["Click the forgot password link."]);
    expect(mocks.txKnowledgeSourceFindFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: { deletedAt: null, id: "ks-1", status: "PROCESSING", workspaceId: "ws-1" },
    });
    expect(mocks.replaceChunks).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        chunks: [
          { content: "Click the forgot password link.", embedding: [0.1, 0.2], position: 0 },
        ],
        isPublished: true,
        knowledgeSourceId: "ks-1",
        visibility: "CUSTOMER_SAFE",
        workspaceId: "ws-1",
      }),
    );
    expect(mocks.txKnowledgeSourceUpdate).toHaveBeenCalledWith({
      data: { publishedAt: expect.any(Date), status: "PUBLISHED" },
      where: { id: "ks-1" },
    });
  });

  it("does not restore chunks when the source was deleted during embedding", async () => {
    mocks.txKnowledgeSourceFindFirst.mockResolvedValue(null);

    await processKnowledgeIngestJob(baseJob);

    expect(mocks.replaceChunks).not.toHaveBeenCalled();
    expect(mocks.txKnowledgeSourceUpdate).not.toHaveBeenCalled();
  });

  it("refuses to process a source from a different Workspace", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(processKnowledgeIngestJob(baseJob)).rejects.toThrow(/not found/);
    expect(mocks.embed).not.toHaveBeenCalled();
  });

  it("marks the source FAILED and rethrows when embedding fails", async () => {
    mocks.embed.mockRejectedValue(new Error("provider timed out"));

    await expect(processKnowledgeIngestJob(baseJob)).rejects.toThrow("provider timed out");

    expect(mocks.update).toHaveBeenCalledWith({
      data: { failureReason: "provider timed out", status: "FAILED" },
      where: { id: "ks-1" },
    });
    expect(mocks.replaceChunks).not.toHaveBeenCalled();
  });
});
