import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chunkText: vi.fn(),
  create: vi.fn(),
  createOpenAiEmbeddingClient: vi.fn(),
  embed: vi.fn(),
  findFirst: vi.fn(),
  publish: vi.fn(),
  queueAdd: vi.fn(),
  replaceChunks: vi.fn(),
  txKnowledgeSourceFindFirst: vi.fn(),
  txKnowledgeSourceUpdate: vi.fn(),
  update: vi.fn(),
}));

vi.mock("ioredis", () => ({
  default: class {
    publish = mocks.publish;
  },
}));

vi.mock("@repo/knowledge", () => ({
  chunkText: mocks.chunkText,
  createOpenAiEmbeddingClient: mocks.createOpenAiEmbeddingClient,
  replaceChunks: mocks.replaceChunks,
}));

vi.mock("bullmq", () => ({
  Queue: class {
    add = mocks.queueAdd;
  },
}));

vi.mock("./config", () => ({
  embeddingConfig: {
    apiKey: "sk-test",
    baseUrl: "https://openrouter.ai/api/v1",
    modelId: "openai/text-embedding-3-small",
  },
  ingestionConfig: {
    mistralApiKey: "mistral-test",
    tavilyApiKey: "tavily-test",
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
    knowledgeSource: { create: mocks.create, findFirst: mocks.findFirst, update: mocks.update },
  },
}));

const { processKnowledgeIngestJob } = await import("./knowledge-ingest");

const baseJob = {
  data: {
    content: "Click the forgot password link.",
    kind: "CONTENT" as const,
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
  mocks.create.mockReset();
  mocks.createOpenAiEmbeddingClient.mockReset().mockReturnValue({ embed: mocks.embed });
  mocks.embed.mockReset().mockResolvedValue([[0.1, 0.2]]);
  mocks.findFirst.mockReset().mockResolvedValue({ id: "ks-1" });
  mocks.publish.mockReset().mockResolvedValue(1);
  mocks.queueAdd.mockReset().mockResolvedValue(undefined);
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
      data: {
        content: "Click the forgot password link.",
        publishedAt: expect.any(Date),
        stage: "PUBLISHED",
        status: "PUBLISHED",
      },
      where: { id: "ks-1" },
    });
  });

  it("persists re-extracted PDF/URL content as the new canonical content on success", async () => {
    mocks.findFirst.mockResolvedValue({ id: "ks-1", sourceUrl: "https://docs.example.com" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            results: [
              {
                raw_content: "Getting started content.",
                title: "Docs",
                url: "https://docs.example.com",
              },
            ],
          }),
        ok: true,
      }),
    );

    await processKnowledgeIngestJob({
      data: {
        kind: "URL",
        knowledgeSourceId: "ks-1",
        title: "Docs",
        visibility: "CUSTOMER_SAFE",
        workspaceId: "ws-1",
      },
    });

    expect(mocks.txKnowledgeSourceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: "Getting started content." }),
      }),
    );
  });

  it("persists and publishes each ingest stage in order before its work begins", async () => {
    await processKnowledgeIngestJob(baseJob);

    expect(mocks.update.mock.calls.map((call) => call[0])).toEqual([
      { data: { stage: "CHUNKING" }, where: { id: "ks-1" } },
      { data: { stage: "EMBEDDING" }, where: { id: "ks-1" } },
      { data: { stage: "INDEXING" }, where: { id: "ks-1" } },
    ]);

    const [chunkingUpdate, embeddingUpdate, indexingUpdate] = mocks.update.mock.invocationCallOrder;
    expect(chunkingUpdate).toBeLessThan(mocks.chunkText.mock.invocationCallOrder[0]);
    expect(embeddingUpdate).toBeLessThan(mocks.createOpenAiEmbeddingClient.mock.invocationCallOrder[0]);
    expect(indexingUpdate).toBeLessThan(mocks.txKnowledgeSourceFindFirst.mock.invocationCallOrder[0]);

    expect(mocks.publish.mock.calls.map(([, payload]) => JSON.parse(payload as string).data.stage)).toEqual([
      "CHUNKING",
      "EMBEDDING",
      "INDEXING",
      "PUBLISHED",
    ]);
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
      data: { failedStage: "EMBEDDING", failureReason: "provider timed out", status: "FAILED" },
      where: { id: "ks-1" },
    });
    expect(mocks.replaceChunks).not.toHaveBeenCalled();
  });
});

describe("processKnowledgeIngestJob (CRAWL)", () => {
  const crawlJob = {
    data: {
      kind: "CRAWL" as const,
      knowledgeSourceId: "parent-1",
      workspaceId: "ws-1",
    },
  };

  beforeEach(() => {
    resetMocks();
    mocks.findFirst.mockResolvedValue({
      id: "parent-1",
      sourceUrl: "https://docs.example.com",
      visibility: "CUSTOMER_SAFE",
    });
    mocks.create.mockImplementation(({ data }: { data: { id: string } }) =>
      Promise.resolve({ id: data.id }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            results: [
              {
                raw_content: "Getting started content.",
                title: "Getting Started",
                url: "https://docs.example.com/start",
              },
            ],
          }),
        ok: true,
      }),
    );
  });

  it("immediately enqueues ingestion for each crawled page as its own Knowledge Source", async () => {
    await processKnowledgeIngestJob(crawlJob);

    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        parentId: "parent-1",
        sourceType: "URL",
        sourceUrl: "https://docs.example.com/start",
        status: "PROCESSING",
        title: "Getting Started",
        visibility: "CUSTOMER_SAFE",
        workspaceId: "ws-1",
      }),
    });
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "ingest",
      expect.objectContaining({
        content: "Getting started content.",
        kind: "CONTENT",
        title: "Getting Started",
        visibility: "CUSTOMER_SAFE",
        workspaceId: "ws-1",
      }),
      expect.anything(),
    );
    expect(mocks.update).toHaveBeenCalledWith({
      data: { failureReason: null, status: "READY" },
      where: { id: "parent-1" },
    });
  });
});
