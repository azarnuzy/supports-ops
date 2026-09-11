import { describe, expect, it, vi } from "vitest";
import { runAiAgentTurn, type AiAgentTurnRuntime } from "./turn";

describe("runAiAgentTurn", () => {
  it("escalates an ungrounded turn before generation", async () => {
    const runtime: AiAgentTurnRuntime = {
      countClarifications: vi.fn(async () => 0),
      escalate: vi.fn(async () => undefined),
      finish: vi.fn(async () => undefined),
      isActive: vi.fn(() => true),
      loadTicket: vi.fn(async () => ({})),
      publishDelta: vi.fn(),
      reply: vi.fn(async () => undefined),
      resolve: vi.fn(async () => undefined),
      retrieve: vi.fn(async () => ({ attachments: [], sources: [], ticketContext: [] })),
      start: vi.fn(async () => undefined),
      tools: vi.fn(async () => ({ descriptors: [], execute: vi.fn() })),
    };

    await runAiAgentTurn({
      customerMessage: "Where is my invoice?",
      modelConfig: { apiKey: "test", modelId: "test" },
      runtime,
      ticketId: "ticket-1",
      workspaceId: "workspace-1",
    });

    expect(runtime.escalate).toHaveBeenCalledWith("NO_RELEVANT_KNOWLEDGE");
    expect(runtime.reply).not.toHaveBeenCalled();
    expect(runtime.finish).toHaveBeenCalledOnce();
  });
});
