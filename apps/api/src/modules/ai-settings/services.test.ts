import { beforeEach, describe, expect, it, vi } from "vitest";
import { withWorkspaceContext } from "../../utils/workspace-context";

const mocks = vi.hoisted(() => ({
  aiAgentFindFirst: vi.fn(),
  aiAgentUpdate: vi.fn(),
  aiSettingsFindFirst: vi.fn(),
  aiSettingsUpsert: vi.fn(),
  transaction: vi.fn(),
}));

const tx = {
  aiAgent: { update: mocks.aiAgentUpdate },
  aiSettings: { upsert: mocks.aiSettingsUpsert },
};

vi.mock("../../utils/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    aiAgent: { findFirst: mocks.aiAgentFindFirst },
    aiSettings: { findFirst: mocks.aiSettingsFindFirst },
  },
}));

vi.mock("../follow-up/queue", () => ({ rescheduleIdleClosures: vi.fn() }));

const { getAiSettings, updateAiSettings } = await import("./services");

describe("AI Agent settings", () => {
  beforeEach(() => {
    mocks.aiAgentFindFirst.mockReset();
    mocks.aiAgentUpdate.mockReset();
    mocks.aiSettingsFindFirst.mockReset();
    mocks.aiSettingsUpsert.mockReset();
    mocks.transaction.mockReset().mockImplementation((callback) => callback(tx));
  });

  it("returns migration fallbacks for an unconfigured Workspace AI Agent", async () => {
    mocks.aiSettingsFindFirst.mockResolvedValue(null);
    mocks.aiAgentFindFirst.mockResolvedValue({
      agentModel: "openai/gpt-5.6-luna",
      handoffMessage: null,
      id: "ai-1",
      instructions: null,
      resolutionMessage: null,
    });

    const settings = await withWorkspaceContext("ws-1", getAiSettings);

    expect(settings).toMatchObject({
      agentModel: "openai/gpt-5.6-luna",
      aiAgentId: "ai-1",
      handoffMessage: expect.stringContaining("{humanAgentName}"),
      idleCloseAfterSeconds: 28_800,
      instructions: "",
      modelCatalog: expect.arrayContaining([
        expect.objectContaining({ id: "openai/gpt-5.6-luna" }),
      ]),
      resolutionMessage: "This conversation has been resolved.",
      workspaceId: "ws-1",
    });
  });

  it("falls back to the default when the stored Agent Model has left the catalog", async () => {
    mocks.aiSettingsFindFirst.mockResolvedValue(null);
    mocks.aiAgentFindFirst.mockResolvedValue({
      agentModel: "openai/retired-model",
      handoffMessage: null,
      id: "ai-1",
      instructions: null,
      resolutionMessage: null,
    });

    const settings = await withWorkspaceContext("ws-1", getAiSettings);

    expect(settings.agentModel).toBe("openai/gpt-5.6-luna");
  });

  it("updates only the selected AI Agent in the current Workspace", async () => {
    mocks.aiAgentUpdate.mockResolvedValue({ id: "ai-1" });
    mocks.aiSettingsUpsert.mockResolvedValue({ workspaceId: "ws-1" });
    const input = {
      agentModel: "openai/gpt-5.6-luna",
      aiAgentId: "ai-1",
      autoResolveAfterSeconds: 60,
      autoResolveEnabled: true,
      followUpAfterSeconds: 30,
      idleCloseAfterSeconds: 28_800,
      handoffMessage: "Hi {humanAgentName}",
      instructions: "Be concise.",
      resolutionMessage: "All done.",
    };

    const settings = await withWorkspaceContext("ws-1", () => updateAiSettings(input));

    expect(mocks.aiAgentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ agentModel: "openai/gpt-5.6-luna" }),
        where: { workspaceId_id: { id: "ai-1", workspaceId: "ws-1" } },
      }),
    );
    expect(settings.modelCatalog).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "openai/gpt-5.6-luna" })]),
    );
  });
});
