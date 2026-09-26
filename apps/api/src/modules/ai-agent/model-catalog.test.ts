import { beforeEach, expect, it, vi } from "vitest";

const gateway = vi.hoisted(() => ({ baseUrl: "https://gateway.devscale.id/v1" }));

vi.mock("../../config", () => ({
  aiAgentConfig: {
    get baseUrl() {
      return gateway.baseUrl;
    },
  },
}));

beforeEach(() => vi.resetModules());

it("uses Devscale model IDs and offers its eligible chat models", async () => {
  gateway.baseUrl = "https://gateway.devscale.id/v1";
  const { gatewayModelId, modelCatalog } = await import("./model-catalog");

  expect(gatewayModelId("openai/gpt-5.6-luna")).toBe("gpt-5.6-luna");
  expect(modelCatalog.map((model) => model.devscaleId)).toContain("muse-spark-1.3-contributor");
  expect(modelCatalog).toHaveLength(6);
});

it("uses OpenRouter model IDs and hides Devscale-only models", async () => {
  gateway.baseUrl = "https://openrouter.ai/api/v1";
  const { gatewayModelId, modelCatalog, resolveAgentModelId } = await import("./model-catalog");

  expect(gatewayModelId("openai/gpt-5.6-luna")).toBe("openai/gpt-5.6-luna");
  expect(modelCatalog.map((model) => model.id)).not.toContain("muse-spark-1.3-contributor");
  expect(resolveAgentModelId("muse-spark-1.3-contributor")).toBe("openai/gpt-5.6-luna");
  expect(modelCatalog).toHaveLength(5);
});
