import type { CompletionModel } from "@anvia/core";
import { z } from "zod";
import { mutationIntentPrompt } from "./prompts/mutation-intent";
import { createAgent } from "./telemetry";

const mutationIntentSchema = z.object({ explicit: z.boolean() });

export class MutationIntentClassificationFailedError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("Could not classify Customer intent for a Mutating Tool.", options);
    this.name = "MutationIntentClassificationFailedError";
  }
}

/**
 * Decides whether the current turn actually authorizes a Mutating Tool call,
 * replacing a hardcoded `explicitCustomerRequest: false`. Reuses the Agent's
 * own reply model rather than a separate small-model configuration — this is
 * one cheap structured-output call, not a multi-turn generation.
 *
 * `requireConfirmation` (MUTATING_IRREVERSIBLE Tools) demands a two-step
 * exchange. A reversible MUTATING Tool accepts either a direct request in the
 * current message or a clear confirmation of the exact action proposed in the
 * AI Agent's immediately preceding message.
 */
export async function classifyExplicitMutationRequest(params: {
  customerMessage: string;
  model: CompletionModel;
  priorAiMessage: string | null;
  requireConfirmation: boolean;
  toolDescription: string;
  toolName: string;
}): Promise<boolean> {
  const agent = createAgent({
    id: "mutation-intent",
    instructions: mutationIntentPrompt({
      priorAiMessage: params.priorAiMessage,
      requireConfirmation: params.requireConfirmation,
      toolDescription: params.toolDescription,
      toolName: params.toolName,
    }),
    maxTurns: 1,
    model: params.model,
    outputSchema: mutationIntentSchema,
  });
  try {
    const result = await agent.generate({ prompt: params.customerMessage });
    if (result.type !== "response") throw new Error(`Classifier returned ${result.type}.`);
    return result.output.explicit;
  } catch (error) {
    throw new MutationIntentClassificationFailedError({ cause: error });
  }
}
