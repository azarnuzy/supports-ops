import { beforeEach, describe, expect, it, vi } from "vitest";

const { extractMock, OpenAIClientMock, completionModel } = vi.hoisted(() => {
  const extractMock = vi.fn();
  const completionModel = vi.fn().mockReturnValue({ id: "fake-model" });
  const OpenAIClientMock = vi.fn().mockImplementation(function (this: {
    completionModel: typeof completionModel;
  }) {
    this.completionModel = completionModel;
  });

  return { OpenAIClientMock, completionModel, extractMock };
});

vi.mock("@anvia/core/extractor", () => ({ extract: extractMock }));
vi.mock("@anvia/openai", () => ({ OpenAIClient: OpenAIClientMock }));

const { ClassificationFailedError, classifyMessage, createClassificationModel } = await import(
  "./classification"
);

describe("createClassificationModel", () => {
  beforeEach(() => {
    OpenAIClientMock.mockClear();
    completionModel.mockClear();
  });

  it("configures the client with the given API key and base URL", () => {
    createClassificationModel({
      apiKey: "sk-test",
      baseUrl: "https://openrouter.ai/api/v1",
      modelId: "openai/gpt-4.1-nano",
    });

    expect(OpenAIClientMock).toHaveBeenCalledWith({
      apiKey: "sk-test",
      baseUrl: "https://openrouter.ai/api/v1",
    });
    expect(completionModel).toHaveBeenCalledWith({ api: "chat", modelId: "openai/gpt-4.1-nano" });
  });
});

const categories = [
  {
    description: "Invoices and payments.",
    isFallback: false,
    key: "BILLING",
    label: "Billing",
  },
  {
    description: "Anything else.",
    isFallback: true,
    key: "GENERAL",
    label: "General",
  },
];

describe("classifyMessage", () => {
  beforeEach(() => {
    extractMock.mockReset();
  });

  it("qualifies a genuine support request and carries its classification", async () => {
    extractMock.mockResolvedValue({
      output: {
        category: "BILLING",
        greetingReply: null,
        isSupportRequest: true,
        priority: "HIGH",
        title: "Invoice charged twice this month",
      },
    });

    const decision = await classifyMessage({
      categories,
      content: "I was charged twice for my invoice this month, please help urgently",
      model: { id: "fake-model" } as never,
    });

    expect(decision).toEqual({
      category: "BILLING",
      priority: "HIGH",
      qualifies: true,
      title: "Invoice charged twice this month",
    });
  });

  it("does not qualify a greeting and returns a warm reply instead", async () => {
    extractMock.mockResolvedValue({
      output: {
        category: null,
        greetingReply: "Hai! Ada yang bisa saya bantu?",
        isSupportRequest: false,
        priority: null,
        title: null,
      },
    });

    const decision = await classifyMessage({
      categories,
      content: "halo",
      model: { id: "fake-model" } as never,
    });

    expect(decision).toEqual({ qualifies: false, reply: "Hai! Ada yang bisa saya bantu?" });
  });

  it("falls back to GENERAL/NORMAL and a truncated title when the model omits them", async () => {
    extractMock.mockResolvedValue({
      output: {
        category: null,
        greetingReply: null,
        isSupportRequest: true,
        priority: null,
        title: null,
      },
    });

    const decision = await classifyMessage({
      categories,
      content: "x".repeat(200),
      model: { id: "fake-model" } as never,
    });

    expect(decision).toMatchObject({ category: "GENERAL", priority: "NORMAL", qualifies: true });
    if (decision.qualifies) {
      expect(decision.title).toHaveLength(120);
    }
  });

  it("falls back to a canned reply when the model omits greetingReply", async () => {
    extractMock.mockResolvedValue({
      output: {
        category: null,
        greetingReply: null,
        isSupportRequest: false,
        priority: null,
        title: null,
      },
    });

    const decision = await classifyMessage({
      categories,
      content: "thanks!",
      model: { id: "fake-model" } as never,
    });

    expect(decision.qualifies).toBe(false);
    if (!decision.qualifies) {
      expect(decision.reply.length).toBeGreaterThan(0);
    }
  });

  it("wraps a provider failure (e.g. a revoked API key) in ClassificationFailedError", async () => {
    const providerError = new Error("401 User not found.");
    extractMock.mockRejectedValue(providerError);

    const rejection = classifyMessage({ categories, content: "hello", model: { id: "fake-model" } as never });

    await expect(rejection).rejects.toBeInstanceOf(ClassificationFailedError);
    await expect(rejection).rejects.toMatchObject({ cause: providerError });
  });
});

describe("category safety", () => {
  beforeEach(() => {
    extractMock.mockReset();
  });

  it("falls back when the model answers with a category that is not configured", async () => {
    extractMock.mockResolvedValue({
      output: {
        category: "REFUNDS",
        greetingReply: null,
        isSupportRequest: true,
        priority: "NORMAL",
        title: "Where is my refund",
      },
    });

    const decision = await classifyMessage({
      categories,
      content: "where is my refund",
      model: { id: "fake-model" } as never,
    });

    expect(decision.qualifies).toBe(true);
    if (decision.qualifies) expect(decision.category).toBe("GENERAL");
  });

  it("puts every configured category and its description in the prompt", async () => {
    extractMock.mockResolvedValue({
      output: {
        category: "BILLING",
        greetingReply: null,
        isSupportRequest: true,
        priority: "NORMAL",
        title: "Double charge",
      },
    });

    await classifyMessage({
      categories,
      content: "charged twice",
      model: { id: "fake-model" } as never,
    });

    const { instructions } = extractMock.mock.calls[0][0];
    expect(instructions).toContain("BILLING");
    expect(instructions).toContain("Invoices and payments.");
    expect(instructions).toContain("GENERAL (fallback)");
  });
});
