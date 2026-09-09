import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chunkUpdateMany: vi.fn(),
  createOpenAiEmbeddingClient: vi.fn(),
  embed: vi.fn(),
  enqueueKnowledgeIngest: vi.fn(),
  knowledgeSourceCreate: vi.fn(),
  knowledgeSourceFindFirst: vi.fn(),
  knowledgeSourceFindMany: vi.fn(),
  knowledgeSourceUpdate: vi.fn(),
  requireWorkspaceId: vi.fn(),
  searchChunks: vi.fn(),
  transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
}));

vi.mock("../../config", () => ({
  embeddingConfig: {
    apiKey: "sk-test",
    baseUrl: "https://openrouter.ai/api/v1",
    modelId: "openai/text-embedding-3-small",
  },
}));

vi.mock("../../utils/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    chunk: { updateMany: mocks.chunkUpdateMany },
    knowledgeSource: {
      create: mocks.knowledgeSourceCreate,
      findFirst: mocks.knowledgeSourceFindFirst,
      findMany: mocks.knowledgeSourceFindMany,
      update: mocks.knowledgeSourceUpdate,
    },
  },
}));

vi.mock("../../utils/workspace-context", () => ({
  requireWorkspaceId: mocks.requireWorkspaceId,
}));

vi.mock("./queue", () => ({
  enqueueKnowledgeIngest: mocks.enqueueKnowledgeIngest,
}));

vi.mock("@repo/knowledge", () => ({
  createOpenAiEmbeddingClient: mocks.createOpenAiEmbeddingClient,
  searchChunks: mocks.searchChunks,
}));

const {
  createManualFaq,
  deleteKnowledgeSource,
  KnowledgeSourceMissingContentError,
  KnowledgeSourceNotFoundError,
  KnowledgeSourceProcessingError,
  listKnowledgeSources,
  publishKnowledgeSource,
  testRetrieval,
  updateManualFaq,
} = await import("./services");

const draftSource = {
  content: "Click forgot password.",
  createdAt: new Date("2026-01-01"),
  failureReason: null,
  id: "ks-1",
  publishedAt: null,
  sourceType: "MANUAL_FAQ" as const,
  status: "DRAFT" as const,
  title: "How to reset password",
  updatedAt: new Date("2026-01-01"),
  visibility: "CUSTOMER_SAFE" as const,
};

function resetMocks() {
  mocks.chunkUpdateMany.mockReset().mockResolvedValue({ count: 0 });
  mocks.createOpenAiEmbeddingClient.mockReset().mockReturnValue({ embed: mocks.embed });
  mocks.embed.mockReset();
  mocks.enqueueKnowledgeIngest.mockReset().mockResolvedValue(undefined);
  mocks.knowledgeSourceCreate.mockReset();
  mocks.knowledgeSourceFindFirst.mockReset();
  mocks.knowledgeSourceFindMany.mockReset();
  mocks.knowledgeSourceUpdate.mockReset();
  mocks.requireWorkspaceId.mockReset().mockReturnValue("ws-1");
  mocks.searchChunks.mockReset();
  mocks.transaction
    .mockReset()
    .mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
}

describe("createManualFaq", () => {
  beforeEach(resetMocks);

  it("creates a DRAFT Knowledge Source scoped to the current Workspace", async () => {
    mocks.knowledgeSourceCreate.mockResolvedValue(draftSource);

    const result = await createManualFaq({
      content: "Click forgot password.",
      title: "How to reset password",
      visibility: "CUSTOMER_SAFE",
    });

    expect(mocks.knowledgeSourceCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        content: "Click forgot password.",
        sourceType: "MANUAL_FAQ",
        status: "DRAFT",
        title: "How to reset password",
        visibility: "CUSTOMER_SAFE",
        workspaceId: "ws-1",
      }),
    });
    expect(result.status).toBe("DRAFT");
  });
});

describe("listKnowledgeSources", () => {
  beforeEach(resetMocks);

  it("excludes deleted sources and orders by newest first", async () => {
    mocks.knowledgeSourceFindMany.mockResolvedValue([draftSource]);

    const result = await listKnowledgeSources();

    expect(mocks.knowledgeSourceFindMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      where: { deletedAt: null },
    });
    expect(result.knowledgeSources).toHaveLength(1);
  });
});

describe("updateManualFaq", () => {
  beforeEach(resetMocks);

  it("throws when the source does not exist", async () => {
    mocks.knowledgeSourceFindFirst.mockResolvedValue(null);

    await expect(
      updateManualFaq("missing", {
        content: "New content.",
        title: "New title",
        visibility: "CUSTOMER_SAFE",
      }),
    ).rejects.toBeInstanceOf(KnowledgeSourceNotFoundError);
  });

  it("refuses to edit a source that is still processing", async () => {
    mocks.knowledgeSourceFindFirst.mockResolvedValue({ ...draftSource, status: "PROCESSING" });

    await expect(
      updateManualFaq("ks-1", {
        content: "New content.",
        title: "New title",
        visibility: "CUSTOMER_SAFE",
      }),
    ).rejects.toBeInstanceOf(KnowledgeSourceProcessingError);

    expect(mocks.knowledgeSourceUpdate).not.toHaveBeenCalled();
  });

  it("updates a source and its chunks' visibility in one transaction", async () => {
    mocks.knowledgeSourceFindFirst.mockResolvedValue({ ...draftSource, status: "PUBLISHED" });
    mocks.knowledgeSourceUpdate.mockResolvedValue({ ...draftSource, visibility: "INTERNAL_ONLY" });

    await updateManualFaq("ks-1", {
      content: "Click forgot password.",
      title: "How to reset password",
      visibility: "INTERNAL_ONLY",
    });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.chunkUpdateMany).toHaveBeenCalledWith({
      data: { visibility: "INTERNAL_ONLY" },
      where: { knowledgeSourceId: "ks-1" },
    });
  });
});

describe("publishKnowledgeSource", () => {
  beforeEach(resetMocks);

  it("sets the source to PROCESSING and enqueues the ingest job", async () => {
    mocks.knowledgeSourceFindFirst.mockResolvedValue(draftSource);
    mocks.knowledgeSourceUpdate.mockResolvedValue({ ...draftSource, status: "PROCESSING" });

    const result = await publishKnowledgeSource("ks-1");

    expect(mocks.knowledgeSourceUpdate).toHaveBeenCalledWith({
      data: { failedStage: null, failureReason: null, stage: null, status: "PROCESSING" },
      where: { id: "ks-1" },
    });
    expect(mocks.enqueueKnowledgeIngest).toHaveBeenCalledWith({
      content: draftSource.content,
      kind: "CONTENT",
      knowledgeSourceId: "ks-1",
      title: draftSource.title,
      visibility: draftSource.visibility,
      workspaceId: "ws-1",
    });
    expect(result.status).toBe("PROCESSING");
  });

  it("refuses to publish a source with no content", async () => {
    mocks.knowledgeSourceFindFirst.mockResolvedValue({ ...draftSource, content: null });

    await expect(publishKnowledgeSource("ks-1")).rejects.toBeInstanceOf(
      KnowledgeSourceMissingContentError,
    );
    expect(mocks.enqueueKnowledgeIngest).not.toHaveBeenCalled();
  });

  it("refuses to publish a source that is already processing", async () => {
    mocks.knowledgeSourceFindFirst.mockResolvedValue({ ...draftSource, status: "PROCESSING" });

    await expect(publishKnowledgeSource("ks-1")).rejects.toBeInstanceOf(
      KnowledgeSourceProcessingError,
    );
  });
});

describe("deleteKnowledgeSource", () => {
  beforeEach(resetMocks);

  it("soft-deletes the source and every one of its chunks in one transaction", async () => {
    mocks.knowledgeSourceFindFirst.mockResolvedValue({ id: "ks-1" });
    mocks.knowledgeSourceUpdate.mockResolvedValue(draftSource);

    await deleteKnowledgeSource("ks-1", "user-1");

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.knowledgeSourceUpdate).toHaveBeenCalledWith({
      data: { deletedAt: expect.any(Date), deletedBy: "user-1" },
      where: { id: "ks-1" },
    });
    expect(mocks.chunkUpdateMany).toHaveBeenCalledWith({
      data: { deletedAt: expect.any(Date) },
      where: { knowledgeSourceId: "ks-1" },
    });
  });

  it("throws when the source does not exist", async () => {
    mocks.knowledgeSourceFindFirst.mockResolvedValue(null);

    await expect(deleteKnowledgeSource("missing", "user-1")).rejects.toBeInstanceOf(
      KnowledgeSourceNotFoundError,
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("testRetrieval", () => {
  beforeEach(resetMocks);

  it("throws when no embedding credential is configured", async () => {
    vi.doMock("../../config", () => ({
      embeddingConfig: { apiKey: undefined, baseUrl: "", modelId: "" },
    }));
    vi.resetModules();

    const {
      testRetrieval: testRetrievalWithoutKey,
      EmbeddingNotConfiguredError: FreshEmbeddingNotConfiguredError,
    } = await import("./services");

    await expect(testRetrievalWithoutKey("password reset")).rejects.toBeInstanceOf(
      FreshEmbeddingNotConfiguredError,
    );

    vi.doUnmock("../../config");
    vi.resetModules();
  });

  it("embeds the query and returns matches scoped to the current Workspace", async () => {
    mocks.embed.mockResolvedValue([[0.1, 0.2, 0.3]]);
    mocks.searchChunks.mockResolvedValue([
      {
        chunkId: "ks-1:0",
        content: "Click forgot password.",
        knowledgeSourceId: "ks-1",
        position: 0,
        similarity: 0.8,
      },
    ]);
    mocks.knowledgeSourceFindMany.mockResolvedValue([
      { id: "ks-1", title: "How to reset password" },
    ]);

    const result = await testRetrieval("how do I reset my password");

    expect(mocks.embed).toHaveBeenCalledWith(["how do I reset my password"]);
    expect(mocks.searchChunks).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ embedding: [0.1, 0.2, 0.3], workspaceId: "ws-1" }),
    );
    expect(result.results).toEqual([
      {
        chunkContent: "Click forgot password.",
        knowledgeSourceId: "ks-1",
        similarity: 0.8,
        title: "How to reset password",
      },
    ]);
  });
});
