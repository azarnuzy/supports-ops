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
  knowledgeSourceUpdateMany: vi.fn(),
  putObject: vi.fn(),
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
  storageConfig: { bucket: "test-bucket" },
}));

vi.mock("@repo/storage", () => ({
  createStorage: () => ({ putObject: mocks.putObject }),
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
      updateMany: mocks.knowledgeSourceUpdateMany,
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
  createPdfKnowledgeSource,
  deleteKnowledgeSource,
  KnowledgeSourceMissingContentError,
  KnowledgeSourceNotEditableError,
  KnowledgeSourceNotFoundError,
  KnowledgeSourceNotRefreshableError,
  KnowledgeSourceProcessingError,
  listKnowledgeSources,
  publishKnowledgeSource,
  refreshKnowledgeSource,
  testRetrieval,
  updateKnowledgeSource,
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
  mocks.knowledgeSourceUpdateMany.mockReset().mockResolvedValue({ count: 0 });
  mocks.putObject.mockReset().mockResolvedValue(undefined);
  mocks.requireWorkspaceId.mockReset().mockReturnValue("ws-1");
  mocks.searchChunks.mockReset();
  mocks.transaction
    .mockReset()
    .mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
}

describe("createManualFaq", () => {
  beforeEach(resetMocks);

  it("creates a PROCESSING Knowledge Source and immediately enqueues ingestion", async () => {
    mocks.knowledgeSourceCreate.mockResolvedValue({ ...draftSource, status: "PROCESSING" });

    const result = await createManualFaq({
      content: "Click forgot password.",
      title: "How to reset password",
      visibility: "CUSTOMER_SAFE",
    });

    expect(mocks.knowledgeSourceCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        content: "Click forgot password.",
        sourceType: "MANUAL_FAQ",
        status: "PROCESSING",
        title: "How to reset password",
        visibility: "CUSTOMER_SAFE",
        workspaceId: "ws-1",
      }),
    });
    expect(mocks.enqueueKnowledgeIngest).toHaveBeenCalledWith({
      content: "Click forgot password.",
      kind: "CONTENT",
      knowledgeSourceId: "ks-1",
      title: "How to reset password",
      visibility: "CUSTOMER_SAFE",
      workspaceId: "ws-1",
    });
    expect(result.status).toBe("PROCESSING");
  });
});

describe("createPdfKnowledgeSource", () => {
  beforeEach(resetMocks);

  function pdfFile() {
    return new File([new Uint8Array([1, 2, 3])], "manual.pdf", { type: "application/pdf" });
  }

  it("stores the file, creates a PROCESSING source, and immediately enqueues ingestion", async () => {
    mocks.knowledgeSourceCreate.mockResolvedValue({
      ...draftSource,
      sourceType: "PDF",
      status: "PROCESSING",
      title: "manual.pdf",
    });

    const result = await createPdfKnowledgeSource(pdfFile(), "CUSTOMER_SAFE");

    expect(mocks.putObject).toHaveBeenCalledTimes(1);
    expect(mocks.knowledgeSourceCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceType: "PDF",
        status: "PROCESSING",
        title: "manual.pdf",
        visibility: "CUSTOMER_SAFE",
        workspaceId: "ws-1",
      }),
    });
    expect(mocks.enqueueKnowledgeIngest).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "PDF",
        title: "manual.pdf",
        visibility: "CUSTOMER_SAFE",
        workspaceId: "ws-1",
      }),
    );
    expect(result.status).toBe("PROCESSING");
  });

  it("rejects a non-PDF file without touching storage or the queue", async () => {
    const file = new File([new Uint8Array([1])], "manual.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    await expect(createPdfKnowledgeSource(file, "CUSTOMER_SAFE")).rejects.toThrow(
      "Upload a PDF file.",
    );
    expect(mocks.putObject).not.toHaveBeenCalled();
    expect(mocks.enqueueKnowledgeIngest).not.toHaveBeenCalled();
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

describe("updateKnowledgeSource", () => {
  beforeEach(resetMocks);

  it("throws when the source does not exist", async () => {
    mocks.knowledgeSourceFindFirst.mockResolvedValue(null);

    await expect(
      updateKnowledgeSource("missing", {
        content: "New content.",
        title: "New title",
        visibility: "CUSTOMER_SAFE",
      }),
    ).rejects.toBeInstanceOf(KnowledgeSourceNotFoundError);
  });

  it("refuses to edit a source that is still processing", async () => {
    mocks.knowledgeSourceFindFirst.mockResolvedValue({ ...draftSource, status: "PROCESSING" });

    await expect(
      updateKnowledgeSource("ks-1", {
        content: "New content.",
        title: "New title",
        visibility: "CUSTOMER_SAFE",
      }),
    ).rejects.toBeInstanceOf(KnowledgeSourceProcessingError);

    expect(mocks.knowledgeSourceUpdate).not.toHaveBeenCalled();
  });

  it("refuses to edit a HELP_CENTER parent, which has no leaf content of its own", async () => {
    mocks.knowledgeSourceFindFirst.mockResolvedValue({
      ...draftSource,
      sourceType: "HELP_CENTER",
      status: "READY",
    });

    await expect(
      updateKnowledgeSource("ks-1", {
        content: "New content.",
        title: "New title",
        visibility: "CUSTOMER_SAFE",
      }),
    ).rejects.toBeInstanceOf(KnowledgeSourceNotEditableError);

    expect(mocks.knowledgeSourceUpdate).not.toHaveBeenCalled();
  });

  it("saves a title-only edit without re-indexing", async () => {
    mocks.knowledgeSourceFindFirst.mockResolvedValue({ ...draftSource, status: "PUBLISHED" });
    mocks.knowledgeSourceUpdate.mockResolvedValue({ ...draftSource, title: "New title" });

    const result = await updateKnowledgeSource("ks-1", {
      content: draftSource.content,
      title: "New title",
      visibility: draftSource.visibility,
    });

    expect(mocks.knowledgeSourceUpdate).toHaveBeenCalledWith({
      data: { content: draftSource.content, title: "New title", visibility: draftSource.visibility },
      where: { id: "ks-1" },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.chunkUpdateMany).not.toHaveBeenCalled();
    expect(mocks.enqueueKnowledgeIngest).not.toHaveBeenCalled();
    expect(result.status).not.toBe("PROCESSING");
  });

  it("re-indexes and syncs Chunk visibility atomically when Visibility changes", async () => {
    mocks.knowledgeSourceFindFirst.mockResolvedValue({ ...draftSource, status: "PUBLISHED" });
    mocks.knowledgeSourceUpdate.mockResolvedValue({
      ...draftSource,
      status: "PROCESSING",
      visibility: "INTERNAL_ONLY",
    });

    const result = await updateKnowledgeSource("ks-1", {
      content: draftSource.content,
      title: draftSource.title,
      visibility: "INTERNAL_ONLY",
    });

    expect(mocks.knowledgeSourceUpdate).toHaveBeenCalledWith({
      data: {
        content: draftSource.content,
        failedStage: null,
        failureReason: null,
        status: "PROCESSING",
        title: draftSource.title,
        visibility: "INTERNAL_ONLY",
      },
      where: { id: "ks-1" },
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.chunkUpdateMany).toHaveBeenCalledWith({
      data: { visibility: "INTERNAL_ONLY" },
      where: { knowledgeSourceId: "ks-1" },
    });
    expect(mocks.enqueueKnowledgeIngest).toHaveBeenCalledWith({
      content: draftSource.content,
      kind: "CONTENT",
      knowledgeSourceId: "ks-1",
      title: draftSource.title,
      visibility: "INTERNAL_ONLY",
      workspaceId: "ws-1",
    });
    expect(result.status).toBe("PROCESSING");
  });

  it("re-indexes without a Chunk transaction when only content changes", async () => {
    mocks.knowledgeSourceFindFirst.mockResolvedValue({ ...draftSource, status: "PUBLISHED" });
    mocks.knowledgeSourceUpdate.mockResolvedValue({ ...draftSource, status: "PROCESSING" });

    await updateKnowledgeSource("ks-1", {
      content: "Updated content.",
      title: draftSource.title,
      visibility: draftSource.visibility,
    });

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.chunkUpdateMany).not.toHaveBeenCalled();
    expect(mocks.enqueueKnowledgeIngest).toHaveBeenCalledWith({
      content: "Updated content.",
      kind: "CONTENT",
      knowledgeSourceId: "ks-1",
      title: draftSource.title,
      visibility: draftSource.visibility,
      workspaceId: "ws-1",
    });
  });

  it("allows editing canonical content for a PDF Knowledge Source", async () => {
    mocks.knowledgeSourceFindFirst.mockResolvedValue({
      ...draftSource,
      sourceType: "PDF",
      status: "PUBLISHED",
    });
    mocks.knowledgeSourceUpdate.mockResolvedValue({
      ...draftSource,
      sourceType: "PDF",
      status: "PROCESSING",
    });

    await updateKnowledgeSource("ks-1", {
      content: "Corrected extracted text.",
      title: draftSource.title,
      visibility: draftSource.visibility,
    });

    expect(mocks.enqueueKnowledgeIngest).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Corrected extracted text.", kind: "CONTENT" }),
    );
  });
});

describe("refreshKnowledgeSource", () => {
  beforeEach(resetMocks);

  it("re-extracts a PDF source from its stored file, ignoring any edited content", async () => {
    mocks.knowledgeSourceFindFirst.mockResolvedValue({
      ...draftSource,
      sourceType: "PDF",
      status: "PUBLISHED",
    });
    mocks.knowledgeSourceUpdate.mockResolvedValue({
      ...draftSource,
      sourceType: "PDF",
      status: "PROCESSING",
    });

    const result = await refreshKnowledgeSource("ks-1");

    expect(mocks.enqueueKnowledgeIngest).toHaveBeenCalledWith({
      kind: "PDF",
      knowledgeSourceId: "ks-1",
      title: draftSource.title,
      visibility: draftSource.visibility,
      workspaceId: "ws-1",
    });
    expect(result.status).toBe("PROCESSING");
  });

  it("refuses to refresh a Create Text source, which has no original source to re-extract", async () => {
    mocks.knowledgeSourceFindFirst.mockResolvedValue({ ...draftSource, status: "PUBLISHED" });

    await expect(refreshKnowledgeSource("ks-1")).rejects.toBeInstanceOf(
      KnowledgeSourceNotRefreshableError,
    );
    expect(mocks.enqueueKnowledgeIngest).not.toHaveBeenCalled();
  });

  it("refuses to refresh a source that is still processing", async () => {
    mocks.knowledgeSourceFindFirst.mockResolvedValue({
      ...draftSource,
      sourceType: "PDF",
      status: "PROCESSING",
    });

    await expect(refreshKnowledgeSource("ks-1")).rejects.toBeInstanceOf(
      KnowledgeSourceProcessingError,
    );
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

  it("retries a PDF source from its stored content instead of silently re-extracting an edit away", async () => {
    mocks.knowledgeSourceFindFirst.mockResolvedValue({
      ...draftSource,
      content: "Manually corrected text.",
      sourceType: "PDF",
      status: "FAILED",
    });
    mocks.knowledgeSourceUpdate.mockResolvedValue({
      ...draftSource,
      sourceType: "PDF",
      status: "PROCESSING",
    });

    await publishKnowledgeSource("ks-1");

    expect(mocks.enqueueKnowledgeIngest).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Manually corrected text.", kind: "CONTENT" }),
    );
  });

  it("retries a PDF source by re-extracting when it never produced content", async () => {
    mocks.knowledgeSourceFindFirst.mockResolvedValue({
      ...draftSource,
      content: null,
      sourceType: "PDF",
      status: "FAILED",
    });
    mocks.knowledgeSourceUpdate.mockResolvedValue({
      ...draftSource,
      sourceType: "PDF",
      status: "PROCESSING",
    });

    await publishKnowledgeSource("ks-1");

    expect(mocks.enqueueKnowledgeIngest).toHaveBeenCalledWith(
      expect.objectContaining({ content: undefined, kind: "PDF" }),
    );
  });
});

describe("deleteKnowledgeSource", () => {
  beforeEach(resetMocks);

  it("soft-deletes a child and only its chunks in one transaction", async () => {
    mocks.knowledgeSourceFindFirst.mockResolvedValue({ id: "ks-1" });
    mocks.knowledgeSourceUpdate.mockResolvedValue(draftSource);

    await deleteKnowledgeSource("ks-1", "user-1");

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.knowledgeSourceUpdateMany).toHaveBeenCalledWith({
      data: { deletedAt: expect.any(Date), deletedBy: "user-1" },
      where: { id: { in: ["ks-1"] } },
    });
    expect(mocks.chunkUpdateMany).toHaveBeenCalledWith({
      data: { deletedAt: expect.any(Date) },
      where: { knowledgeSourceId: { in: ["ks-1"] } },
    });
  });

  it("soft-deletes a website parent and all of its children", async () => {
    mocks.knowledgeSourceFindFirst.mockResolvedValue({ id: "parent-1", sourceType: "HELP_CENTER" });
    mocks.knowledgeSourceFindMany.mockResolvedValue([{ id: "child-1" }, { id: "child-2" }]);

    await deleteKnowledgeSource("parent-1", "user-1");

    expect(mocks.knowledgeSourceFindMany).toHaveBeenCalledWith({
      select: { id: true },
      where: { deletedAt: null, parentId: "parent-1" },
    });
    expect(mocks.knowledgeSourceUpdateMany).toHaveBeenCalledWith({
      data: { deletedAt: expect.any(Date), deletedBy: "user-1" },
      where: { id: { in: ["parent-1", "child-1", "child-2"] } },
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
