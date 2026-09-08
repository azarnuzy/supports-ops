import { describe, expect, it, vi } from "vitest";
import { replaceChunks, searchChunks } from "./vector-store";

function createDb() {
  return {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
}

describe("replaceChunks", () => {
  it("deletes the source's existing chunks before inserting the new set", async () => {
    const db = createDb();

    await replaceChunks(db, {
      chunks: [
        { content: "First.", embedding: [0.1, 0.2], position: 0 },
        { content: "Second.", embedding: [0.3, 0.4], position: 1 },
      ],
      isPublished: true,
      knowledgeSourceId: "ks1",
      visibility: "CUSTOMER_SAFE",
      workspaceId: "ws1",
    });

    // one DELETE, then one INSERT per chunk
    expect(db.$executeRaw).toHaveBeenCalledTimes(3);

    const deleteCall = db.$executeRaw.mock.calls[0];
    expect(deleteCall[0].join("")).toContain('DELETE FROM "Chunk"');
    expect(deleteCall).toContain("ws1");
    expect(deleteCall).toContain("ks1");
  });

  it("writes deterministic ids so re-publishing the same source is idempotent", async () => {
    const db = createDb();

    await replaceChunks(db, {
      chunks: [{ content: "Only chunk.", embedding: [0.1], position: 0 }],
      isPublished: true,
      knowledgeSourceId: "ks1",
      visibility: "CUSTOMER_SAFE",
      workspaceId: "ws1",
    });

    const insertCall = db.$executeRaw.mock.calls[1];
    expect(insertCall).toContain("ks1:0");
  });

  it("writes no rows for a source with no chunks", async () => {
    const db = createDb();

    await replaceChunks(db, {
      chunks: [],
      isPublished: true,
      knowledgeSourceId: "ks1",
      visibility: "CUSTOMER_SAFE",
      workspaceId: "ws1",
    });

    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
  });
});

describe("searchChunks", () => {
  it("scopes the query to the given Workspace and embedding", async () => {
    const db = createDb();
    db.$queryRaw.mockResolvedValue([
      {
        content: "Answer.",
        id: "ks1:0",
        knowledgeSourceId: "ks1",
        position: 0,
        similarity: 0.9,
        visibility: "CUSTOMER_SAFE",
      },
    ]);

    const results = await searchChunks(db, { embedding: [0.1, 0.2], workspaceId: "ws1" });

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const queryCall = db.$queryRaw.mock.calls[0];
    expect(queryCall).toContain("ws1");
    expect(queryCall).toContain("CUSTOMER");
    expect(results).toEqual([
      {
        chunkId: "ks1:0",
        content: "Answer.",
        knowledgeSourceId: "ks1",
        position: 0,
        similarity: 0.9,
        visibility: "CUSTOMER_SAFE",
      },
    ]);
  });

  it("lets the AI Copilot include Internal-Only chunks", async () => {
    const db = createDb();

    await searchChunks(db, {
      embedding: [0.1],
      retrievalMode: "COPILOT",
      workspaceId: "ws1",
    });

    expect(db.$queryRaw.mock.calls[0]).toContain("COPILOT");
  });

  it("filters out results below minSimilarity", async () => {
    const db = createDb();
    db.$queryRaw.mockResolvedValue([
      {
        content: "Close match.",
        id: "ks1:0",
        knowledgeSourceId: "ks1",
        position: 0,
        similarity: 0.5,
        visibility: "CUSTOMER_SAFE",
      },
      {
        content: "Unrelated.",
        id: "ks2:0",
        knowledgeSourceId: "ks2",
        position: 0,
        similarity: 0.05,
        visibility: "CUSTOMER_SAFE",
      },
    ]);

    const results = await searchChunks(db, {
      embedding: [0.1],
      minSimilarity: 0.2,
      workspaceId: "ws1",
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.chunkId).toBe("ks1:0");
  });
});
