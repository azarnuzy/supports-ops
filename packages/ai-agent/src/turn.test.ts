import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiAgentTurnRuntime } from "./turn";

const { createReplyModelMock, streamReplyMock } = vi.hoisted(() => ({
  createReplyModelMock: vi.fn(() => ({ id: "fake-model" })),
  streamReplyMock: vi.fn<typeof import("./reply").streamReply>(),
}));

vi.mock("./reply", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./reply")>();
  return { ...actual, createReplyModel: createReplyModelMock, streamReply: streamReplyMock };
});

const { runAiAgentTurn } = await import("./turn");

function baseRuntime(overrides: Partial<AiAgentTurnRuntime> = {}): AiAgentTurnRuntime {
  return {
    countClarifications: vi.fn(async () => 0),
    escalate: vi.fn(async () => undefined),
    finish: vi.fn(async () => undefined),
    isActive: vi.fn(() => true),
    loadMemory: vi.fn(async () => []),
    loadTicket: vi.fn(async () => ({ sessionId: "session-1", userId: "customer-1" })),
    publishDelta: vi.fn(),
    reply: vi.fn(async () => undefined),
    resolve: vi.fn(async () => undefined),
    retrieve: vi.fn(async () => ({ attachments: [] })),
    saveMemory: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
    tools: vi.fn(async () => ({ descriptors: [], execute: vi.fn() })),
    ...overrides,
  };
}

describe("runAiAgentTurn", () => {
  beforeEach(() => {
    streamReplyMock.mockReset();
    createReplyModelMock.mockClear();
  });

  it("always invokes the model, even when retrieval and tools are both empty", async () => {
    streamReplyMock.mockResolvedValue({
      content: "I could not verify this, so a Human Agent will review it.",
      decision: "ESCALATE",
      escalationReason: "NO_RELEVANT_KNOWLEDGE",
    });
    const runtime = baseRuntime();

    await runAiAgentTurn({
      customerMessage: "Where is my invoice?",
      modelConfig: { apiKey: "test", modelId: "test" },
      runtime,
      ticketId: "ticket-1",
      workspaceId: "workspace-1",
    });

    expect(streamReplyMock).toHaveBeenCalledOnce();
    expect(runtime.escalate).toHaveBeenCalledWith(
      "NO_RELEVANT_KNOWLEDGE",
      "I could not verify this, so a Human Agent will review it.",
    );
    expect(runtime.reply).not.toHaveBeenCalled();
    expect(runtime.finish).toHaveBeenCalledOnce();
  });

  it("forwards the completed Agent result observer", async () => {
    streamReplyMock.mockResolvedValue({
      content: "Done.",
      decision: "REPLY",
      escalationReason: null,
    });
    const onResult = vi.fn();

    await runAiAgentTurn({
      customerMessage: "Help",
      modelConfig: { apiKey: "test", modelId: "test" },
      onResult,
      runtime: baseRuntime(),
      ticketId: "ticket-1",
      workspaceId: "workspace-1",
    });

    expect(streamReplyMock).toHaveBeenCalledWith(expect.objectContaining({ onResult }));
  });

  it("reuses the Session's structured history, including Tool Results", async () => {
    const messages = [
      { content: "Add it", role: "user" as const },
      {
        content: [
          {
            input: { quantity: 1 },
            toolCallId: "call-1",
            toolName: "create_cart",
            type: "tool-call" as const,
          },
        ],
        role: "assistant" as const,
      },
      {
        content: [
          {
            output: { type: "text" as const, value: '{"cartId":"cart-1"}' },
            toolCallId: "call-1",
            toolName: "create_cart",
            type: "tool-result" as const,
          },
        ],
        role: "tool" as const,
      },
    ];
    const runtime = baseRuntime({ loadMemory: vi.fn(async () => messages) });
    streamReplyMock.mockImplementation(async (params) => {
      await params.onMessages?.(messages);
      return { content: "One item.", decision: "REPLY", escalationReason: null };
    });

    await runAiAgentTurn({
      customerMessage: "What's currently in my cart?",
      modelConfig: { apiKey: "test", modelId: "test" },
      runtime,
      ticketId: "ticket-1",
      workspaceId: "workspace-1",
    });

    expect(streamReplyMock).toHaveBeenCalledWith(
      expect.objectContaining({ messages, userId: "customer-1" }),
    );
    expect(runtime.saveMemory).toHaveBeenCalledWith(messages);
  });

  it("escalates with the model's own reason when it decides ESCALATE", async () => {
    streamReplyMock.mockResolvedValue({
      content: "As requested, a Human Agent will continue this conversation.",
      decision: "ESCALATE",
      escalationReason: "CUSTOMER_REQUESTED_HUMAN",
    });
    const runtime = baseRuntime();

    await runAiAgentTurn({
      customerMessage: "Let me talk to a human",
      modelConfig: { apiKey: "test", modelId: "test" },
      runtime,
      ticketId: "ticket-1",
      workspaceId: "workspace-1",
    });

    expect(runtime.escalate).toHaveBeenCalledWith(
      "CUSTOMER_REQUESTED_HUMAN",
      "As requested, a Human Agent will continue this conversation.",
    );
  });

  it("escalates with AI_FAILED_ATTEMPTS after two clarifications and another CLARIFY", async () => {
    streamReplyMock.mockResolvedValue({
      content: "Could you clarify?",
      decision: "CLARIFY",
      escalationReason: null,
    });
    const runtime = baseRuntime({ countClarifications: vi.fn(async () => 2) });

    await runAiAgentTurn({
      customerMessage: "It's broken",
      modelConfig: { apiKey: "test", modelId: "test" },
      runtime,
      ticketId: "ticket-1",
      workspaceId: "workspace-1",
    });

    expect(runtime.escalate).toHaveBeenCalledWith("AI_FAILED_ATTEMPTS", undefined);
    expect(runtime.reply).not.toHaveBeenCalled();
  });

  it("replies with a CLARIFY decision under the clarification limit", async () => {
    streamReplyMock.mockResolvedValue({
      content: "Which plan are you on?",
      decision: "CLARIFY",
      escalationReason: null,
    });
    const runtime = baseRuntime({ countClarifications: vi.fn(async () => 1) });

    await runAiAgentTurn({
      customerMessage: "It's broken",
      modelConfig: { apiKey: "test", modelId: "test" },
      runtime,
      ticketId: "ticket-1",
      workspaceId: "workspace-1",
    });

    expect(runtime.reply).toHaveBeenCalledWith(
      "CLARIFY",
      "Which plan are you on?",
      expect.any(String),
    );
    expect(runtime.escalate).not.toHaveBeenCalled();
  });

  it("replies with a REPLY decision", async () => {
    streamReplyMock.mockResolvedValue({
      content: "Here's the answer.",
      decision: "REPLY",
      escalationReason: null,
    });
    const runtime = baseRuntime();

    await runAiAgentTurn({
      customerMessage: "How do I reset my password?",
      modelConfig: { apiKey: "test", modelId: "test" },
      runtime,
      ticketId: "ticket-1",
      workspaceId: "workspace-1",
    });

    expect(runtime.reply).toHaveBeenCalledWith("REPLY", "Here's the answer.", expect.any(String));
  });

  it("resolves when the model decides RESOLVE", async () => {
    streamReplyMock.mockResolvedValue({
      content: "Glad that's sorted — this conversation is now resolved.",
      decision: "RESOLVE",
      escalationReason: null,
    });
    const runtime = baseRuntime();

    await runAiAgentTurn({
      customerMessage: "That fixed it, thanks!",
      modelConfig: { apiKey: "test", modelId: "test" },
      runtime,
      ticketId: "ticket-1",
      workspaceId: "workspace-1",
    });

    expect(runtime.resolve).toHaveBeenCalledWith(
      "Glad that's sorted — this conversation is now resolved.",
    );
    expect(runtime.reply).not.toHaveBeenCalled();
    expect(runtime.escalate).not.toHaveBeenCalled();
  });

  it("escalates with AI_GENERATION_FAILED when the model errors on every attempt", async () => {
    streamReplyMock.mockRejectedValue(new Error("provider down"));
    const runtime = baseRuntime();

    await runAiAgentTurn({
      customerMessage: "How do I reset my password?",
      modelConfig: { apiKey: "test", modelId: "test" },
      runtime,
      ticketId: "ticket-1",
      workspaceId: "workspace-1",
    });

    expect(streamReplyMock).toHaveBeenCalledTimes(2);
    expect(runtime.escalate).toHaveBeenCalledWith("AI_GENERATION_FAILED");
  });

  it("escalates with AI_GENERATION_FAILED without ever invoking the model when no model is configured", async () => {
    const runtime = baseRuntime();

    await runAiAgentTurn({
      customerMessage: "How do I reset my password?",
      modelConfig: undefined,
      runtime,
      ticketId: "ticket-1",
      workspaceId: "workspace-1",
    });

    expect(streamReplyMock).not.toHaveBeenCalled();
    expect(runtime.escalate).toHaveBeenCalledWith("AI_GENERATION_FAILED");
  });
});
