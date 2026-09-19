import type { CompletionModel } from "@anvia/core";
import { escalationSummaryPrompt } from "./prompts/escalation-summary";
import { suggestedReplyPrompt } from "./prompts/suggested-reply";
import { createAgent } from "./telemetry";
import { z } from "zod";

const suggestedReplySchema = z.object({
  content: z.string().trim().min(1),
});

const escalationSummarySchema = z.object({
  summary: z.string().trim().min(1),
});

export class EscalationSummaryGenerationFailedError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("The AI Agent could not generate an Escalation Summary.", options);
    this.name = "EscalationSummaryGenerationFailedError";
  }
}

export class SuggestedReplyGenerationFailedError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("The AI Copilot could not generate a Suggested Reply.", options);
    this.name = "SuggestedReplyGenerationFailedError";
  }
}

/** A Copilot draft may learn from Internal-Only material, but it must never
 * quote it. Rejecting five-word overlaps makes that boundary enforceable even
 * if a model disregards its instructions. */
function containsInternalQuote(draft: string, internalSources: string[]) {
  const words = (value: string) => value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const draftWords = words(draft).join(" ");
  return internalSources.some((source) => {
    const sourceWords = words(source);
    for (let index = 0; index <= sourceWords.length - 5; index += 1) {
      if (draftWords.includes(sourceWords.slice(index, index + 5).join(" "))) return true;
    }
    return false;
  });
}

export async function generateSuggestedReply(params: {
  businessData?: string;
  customerMessage: string;
  customerSafeSources: string[];
  currentConversation: string;
  internalOnlySources: string[];
  model: CompletionModel;
  previousTicketContext: string;
  sessionId?: string;
}): Promise<string> {
  const agent = createAgent({
    id: "suggested-reply",
    instructions: suggestedReplyPrompt({
      customerSafeSources: params.customerSafeSources,
      internalOnlySources: params.internalOnlySources,
      businessData: params.businessData,
      previousTicketContext: params.previousTicketContext,
      currentConversation: params.currentConversation,
    }),
    maxTurns: 1,
    model: params.model,
    outputSchema: suggestedReplySchema,
    sessionId: params.sessionId,
  });

  try {
    const result = await agent.generate({ prompt: params.customerMessage });
    if (result.type !== "response") throw new Error(`AI Copilot returned ${result.type}.`);
    if (containsInternalQuote(result.output.content, params.internalOnlySources)) {
      throw new Error("Suggested Reply quoted Internal-Only knowledge.");
    }
    return result.output.content;
  } catch (error) {
    throw new SuggestedReplyGenerationFailedError({ cause: error });
  }
}

export function generateEscalationSummary(params: {
  model: CompletionModel;
  sessionId?: string;
  ticket: {
    escalationReason: string;
    messages: Array<{ content: string; senderType: string }>;
    recordedActivity: string;
    title: string;
  };
}): Promise<string> {
  const transcript = params.ticket.messages
    .map((message) => `${message.senderType}: ${message.content}`)
    .join("\n");
  const agent = createAgent({
    id: "escalation-summary",
    instructions: escalationSummaryPrompt(),
    maxTurns: 1,
    model: params.model,
    outputSchema: escalationSummarySchema,
    sessionId: params.sessionId,
  });

  return (async () => {
    try {
      const result = await agent.generate({
        prompt: `Ticket title: ${params.ticket.title}
Escalation reason: ${params.ticket.escalationReason}

Transcript:
${transcript || "None recorded."}

Recorded AI Activity:
${params.ticket.recordedActivity || "None recorded."}`,
      });
      if (result.type !== "response") throw new Error(`AI Agent returned ${result.type}.`);
      return result.output.summary;
    } catch (error) {
      throw new EscalationSummaryGenerationFailedError({ cause: error });
    }
  })();
}
