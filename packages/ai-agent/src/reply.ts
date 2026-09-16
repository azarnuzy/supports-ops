import type { AgentResponse, CompletionModel, Message } from "@anvia/core";
import { OpenAIClient } from "@anvia/openai";
import { z } from "zod";

import { replyPrompt } from "./prompts/reply";
import { createAgent } from "./telemetry";
import type { AgentTools } from "./tools";

export type ReplyModel = CompletionModel;

const escalationReasonSchema = z.enum([
  "LOW_KNOWLEDGE_CONFIDENCE",
  "NO_RELEVANT_KNOWLEDGE",
  "CUSTOMER_REQUESTED_HUMAN",
  "AI_FAILED_ATTEMPTS",
  "INTERNAL_ACTION_REQUIRED",
  "BUSINESS_TOOL_FAILURE",
  "CONFLICTING_KNOWLEDGE",
  "AI_GENERATION_FAILED",
  "AI_TIMEOUT",
]);

// Keep the provider schema flat: `z.discriminatedUnion` produces a root
// `oneOf`, which this gateway rejects before it generates a reply.
const replyOutputSchema = z.object({
  content: z.string().trim().min(1),
  decision: z.enum(["REPLY", "CLARIFY", "ESCALATE", "RESOLVE"]),
  escalationReason: escalationReasonSchema.nullable(),
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
  /** Provider generation controls, e.g. `{ reasoningEffort: "low" }`. Part of
   * the prompt-cache key: changing one discards the warm prefix. */
  controls?: Record<string, string>;
  maxOutputTokens?: number;
  attachments: Array<{ id: string; content: string }>;
  clarificationCount: number;
  onDelta(delta: string): Promise<void> | void;
  instructions?: string;
  messages?: Message[];
  onMessages?(messages: Message[]): Promise<void> | void;
  onResult?(result: AgentResponse<ReplyDecision>): Promise<void> | void;
  resolutionMessage?: string;
  sessionId?: string;
  tools?: AgentTools;
  userId?: string;
}): Promise<ReplyDecision> {
  const attachments = params.attachments.length
    ? params.attachments
        .map((attachment) => `[${attachment.id}] ${attachment.content}`)
        .join("\n\n")
    : "No Attachments were provided for this Ticket.";
  const agent = createAgent({
    ...(params.controls ? { controls: params.controls } : {}),
    ...(params.maxOutputTokens ? { maxTokens: params.maxOutputTokens } : {}),
    id: "customer-reply",
    instructions: replyPrompt({
      instructions: params.instructions,
      clarificationCount: params.clarificationCount,
      attachments,
      resolutionMessage: params.resolutionMessage,
    }),
    maxTurns: params.tools?.length ? 5 : 1,
    model: params.model,
    outputSchema: replyOutputSchema,
    sessionId: params.sessionId,
    tools: params.tools,
    userId: params.userId,
  });

  return (async () => {
    try {
      const stream = agent.stream(
        params.messages?.length
          ? {
              messages: [
                ...params.messages,
                { content: params.customerMessage, role: "user" as const },
              ],
            }
          : { prompt: params.customerMessage },
      );
      for await (const event of stream.events) {
        if (event.type === "text_delta") await params.onDelta(event.delta);
      }
      const result = await stream.result;
      if (result.type !== "response") throw new Error(`AI Agent returned ${result.type}.`);
      await params.onResult?.(result);
      await params.onMessages?.(result.messages);
      return result.output;
    } catch (error) {
      throw new ReplyGenerationFailedError({ cause: error });
    }
  })();
}
