import { beforeEach, describe, expect, it, vi } from "vitest";

const { OpenAIClientMock, embedTexts, embeddingModel } = vi.hoisted(() => {
  const embedTexts = vi.fn();
  const embeddingModel = vi.fn().mockReturnValue({ embedTexts });
  const OpenAIClientMock = vi.fn().mockImplementation(function (this: {
    embeddingModel: typeof embeddingModel;
  }) {
    this.embeddingModel = embeddingModel;
  });

  return { OpenAIClientMock, embedTexts, embeddingModel };
});

vi.mock("@anvia/openai", () => ({
  OpenAIClient: OpenAIClientMock,
}));

const { createOpenAiEmbeddingClient } = await import("./embeddings");

describe("createOpenAiEmbeddingClient", () => {
  beforeEach(() => {
    OpenAIClientMock.mockClear();
    embeddingModel.mockClear();
    embedTexts.mockReset();
  });

  it("configures the client with the given API key and base URL", () => {
    createOpenAiEmbeddingClient({
      apiKey: "sk-test",
      baseUrl: "https://openrouter.ai/api/v1",
      modelId: "openai/text-embedding-3-small",
    });

    expect(OpenAIClientMock).toHaveBeenCalledWith({
      apiKey: "sk-test",
      baseUrl: "https://openrouter.ai/api/v1",
    });
    expect(embeddingModel).toHaveBeenCalledWith({ modelId: "openai/text-embedding-3-small" });
  });

  it("returns bare vectors for a batch of texts", async () => {
    embedTexts.mockResolvedValue([
      { document: "a", vector: [0.1, 0.2] },
      { document: "b", vector: [0.3, 0.4] },
    ]);

    const client = createOpenAiEmbeddingClient({
      apiKey: "sk-test",
      modelId: "openai/text-embedding-3-small",
    });
    const vectors = await client.embed(["a", "b"]);

    expect(embedTexts).toHaveBeenCalledWith(["a", "b"]);
    expect(vectors).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
  });

  it("skips the network call for an empty batch", async () => {
    const client = createOpenAiEmbeddingClient({
      apiKey: "sk-test",
      modelId: "openai/text-embedding-3-small",
    });

    const vectors = await client.embed([]);

    expect(vectors).toEqual([]);
    expect(embedTexts).not.toHaveBeenCalled();
  });

  it("defaults to 1536 dimensions", () => {
    const client = createOpenAiEmbeddingClient({
      apiKey: "sk-test",
      modelId: "openai/text-embedding-3-small",
    });

    expect(client.dimensions).toBe(1536);
  });
});
