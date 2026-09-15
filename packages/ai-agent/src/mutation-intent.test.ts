import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAgentMock, generateMock } = vi.hoisted(() => ({
  createAgentMock: vi.fn(),
  generateMock: vi.fn(),
}));

vi.mock("./telemetry", () => ({ createAgent: createAgentMock }));

const { classifyExplicitMutationRequest, MutationIntentClassificationFailedError } = await import(
  "./mutation-intent"
);

beforeEach(() => {
  createAgentMock.mockReset().mockReturnValue({ generate: generateMock });
  generateMock.mockReset();
});

describe("classifyExplicitMutationRequest", () => {
  it("returns true when the model says the current message explicitly requests it", async () => {
    generateMock.mockResolvedValue({ output: { explicit: true }, type: "response" });

    const result = await classifyExplicitMutationRequest({
      customerMessage: "Please add one pair to my cart.",
      model: {} as never,
      priorAiMessage: null,
      requireConfirmation: false,
      toolDescription: "Creates a Shopify cart.",
      toolName: "create_cart",
    });

    expect(result).toBe(true);
    expect(generateMock).toHaveBeenCalledWith({ prompt: "Please add one pair to my cart." });
  });

  it("puts requireConfirmation and the prior Agent proposal into the prompt", async () => {
    generateMock.mockResolvedValue({ output: { explicit: true }, type: "response" });

    await classifyExplicitMutationRequest({
      customerMessage: "Yes, go ahead.",
      model: {} as never,
      priorAiMessage: "I'll charge $29.99 for 1x Pampi Shoes, confirm?",
      requireConfirmation: true,
      toolDescription: "Charges the Customer's card.",
      toolName: "create_checkout",
    });

    const { instructions } = createAgentMock.mock.calls[0][0];
    expect(instructions).toContain("two-step confirmation");
    expect(instructions).toContain("I'll charge $29.99 for 1x Pampi Shoes, confirm?");
  });

  it("puts the prior Agent proposal into a reversible mutation prompt", async () => {
    generateMock.mockResolvedValue({ output: { explicit: true }, type: "response" });

    await classifyExplicitMutationRequest({
      customerMessage: "yes please",
      model: {} as never,
      priorAiMessage: "May I update the checkout with this shipping information?",
      requireConfirmation: false,
      toolDescription: "Updates a checkout.",
      toolName: "update_checkout",
    });

    const { instructions } = createAgentMock.mock.calls[0][0];
    expect(instructions).toContain("May I update the checkout with this shipping information?");
    expect(instructions).toContain('"yes please"');
  });

  it("returns false when the model says the request is not explicit", async () => {
    generateMock.mockResolvedValue({ output: { explicit: false }, type: "response" });

    const result = await classifyExplicitMutationRequest({
      customerMessage: "What shoes do you have?",
      model: {} as never,
      priorAiMessage: null,
      requireConfirmation: false,
      toolDescription: "Creates a Shopify cart.",
      toolName: "create_cart",
    });

    expect(result).toBe(false);
  });

  it("wraps a provider failure in MutationIntentClassificationFailedError", async () => {
    const providerError = new Error("401 Unauthorized.");
    generateMock.mockRejectedValue(providerError);

    const rejection = classifyExplicitMutationRequest({
      customerMessage: "Add it to my cart.",
      model: {} as never,
      priorAiMessage: null,
      requireConfirmation: false,
      toolDescription: "Creates a Shopify cart.",
      toolName: "create_cart",
    });

    await expect(rejection).rejects.toBeInstanceOf(MutationIntentClassificationFailedError);
    await expect(rejection).rejects.toMatchObject({ cause: providerError });
  });
});
