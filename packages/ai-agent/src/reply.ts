import type { CompletionModel } from "@anvia/core";
import { OpenAIClient } from "@anvia/openai";
import { z } from "zod";

import { replyPrompt } from "./prompts/reply";
import { createAgent } from "./telemetry";
import type { AgentTools } from "./tools";

export type ReplyModel = CompletionModel;

const replyOutputSchema = z.object({
  decision: z.enum(["REPLY", "CLARIFY", "ESCALATE", "RESOLVE"]),
  content: z.string().trim().min(1).nullable(),
  escalationReason: z
    .enum([
      "LOW_KNOWLEDGE_CONFIDENCE",
      "NO_RELEVANT_KNOWLEDGE",
      "CUSTOMER_REQUESTED_HUMAN",
      "AI_FAILED_ATTEMPTS",
      "INTERNAL_ACTION_REQUIRED",
      "BUSINESS_TOOL_FAILURE",
      "CONFLICTING_KNOWLEDGE",
      "AI_GENERATION_FAILED",
      "AI_TIMEOUT",
    ])
    .nullable(),
});

export type ReplyDecision = z.infer<typeof replyOutputSchema>;

export class ReplyGenerationFailedError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("The AI Agent could not generate a reply.", options);
    this.name = "ReplyGenerationFailedError";
  }
}

export function createReplyModel(options: {
  apiKey: string;
  modelId: string;
  baseUrl?: string;
}): ReplyModel {
  const client = new OpenAIClient({ apiKey: options.apiKey, baseUrl: options.baseUrl });
  return client.completionModel({ api: "chat", modelId: options.modelId });
}

export function streamReply(params: {
  model: ReplyModel;
  customerMessage: string;
  sources: Array<{ id: string; content: string }>;
  ticketContext?: Array<{ id: string; content: string }>;
  clarificationCount: number;
  onDelta(delta: string): Promise<void> | void;
  instructions?: string;
  sessionId?: string;
  tools?: AgentTools;
}): Promise<ReplyDecision> {
  const sources = params.sources.length
    ? params.sources.map((source) => `[${source.id}] ${source.content}`).join("\n\n")
    : "No published Customer-Safe Knowledge Source was retrieved.";
  const ticketContext = params.ticketContext?.length
    ? params.ticketContext.map((entry) => `[${entry.id}] ${entry.content}`).join("\n\n")
    : undefined;
  const agent = createAgent({
    id: "customer-reply",
    instructions: replyPrompt({
      instructions: params.instructions,
      clarificationCount: params.clarificationCount,
      sources,
      ticketContext,
    }),
    maxTurns: params.tools?.length ? 5 : 1,
    model: params.model,
    outputSchema: replyOutputSchema,
    sessionId: params.sessionId,
    tools: params.tools,
  });

  return (async () => {
    try {
      const stream = agent.stream({ prompt: params.customerMessage });
      for await (const event of stream.events) {
        if (event.type === "text_delta") await params.onDelta(event.delta);
      }
      const result = await stream.result;
      if (result.type !== "response") throw new Error(`AI Agent returned ${result.type}.`);
      return result.output;
    } catch (error) {
      throw new ReplyGenerationFailedError({ cause: error });
    }
  })();
}
