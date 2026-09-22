import { describe, expect, it } from "vitest";
import { updateAiSettingsSchema } from "./schema";

const input = {
  agentModel: "openai/gpt-5.6-luna",
  aiAgentId: "ai-1",
  autoResolveAfterSeconds: 3600,
  autoResolveEnabled: true,
  followUpAfterSeconds: 900,
  idleCloseAfterSeconds: 28800,
  handoffMessage: "Hi {humanAgentName}",
  instructions: "",
  resolutionMessage: "Resolved.",
};

describe("updateAiSettingsSchema", () => {
  it("allows empty instructions and the supported Handoff variable", () => {
    expect(updateAiSettingsSchema.safeParse(input).success).toBe(true);
  });

  it("rejects unknown Handoff variables and oversized values", () => {
    expect(
      updateAiSettingsSchema.safeParse({ ...input, handoffMessage: "Hi {agentName}" }).success,
    ).toBe(false);
    expect(
      updateAiSettingsSchema.safeParse({ ...input, instructions: "x".repeat(10_001) }).success,
    ).toBe(false);
  });

  it("rejects an Agent Model outside the Model Catalog", () => {
    expect(
      updateAiSettingsSchema.safeParse({ ...input, agentModel: "openai/gpt-4o-mini" }).success,
    ).toBe(false);
  });
});
