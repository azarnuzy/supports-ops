import { Agent, type CompletionModel } from "@anvia/core";
import { agentObservability } from "./telemetry";
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
}): Promise<string> {
  const agent = new Agent({
    ...agentObservability(),
    id: "suggested-reply",
    instructions: `You are SupportOps' AI Copilot helping a Human Agent draft a reply to a Customer. Write only a concise draft in the Customer's language. Never say you are an AI or address the Human Agent.

Customer-Safe knowledge may be stated directly. Internal-Only knowledge is background for the Human Agent: do not quote, paraphrase closely, name, or reveal it. Do not reveal implementation details, private reasoning, source identifiers, or Business Tool data beyond the Customer-specific facts necessary to answer.

The Human Agent reviews and sends this draft; you cannot message the Customer. Do not claim to perform any change to billing, subscriptions, refunds, or other Business System writes.

Customer-Safe knowledge:
${params.customerSafeSources.join("\n\n") || "None retrieved."}

Internal-Only knowledge (background only):
${params.internalOnlySources.join("\n\n") || "None retrieved."}

Live Business Tool data:
${params.businessData ?? "None available."}

Previous Ticket context for this Customer Identity:
${params.previousTicketContext || "None recorded."}

Current conversation:
${params.currentConversation || "None recorded."}`,
    maxTurns: 1,
    model: params.model,
    outputSchema: suggestedReplySchema,
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
  const agent = new Agent({
    ...agentObservability(),
    id: "escalation-summary",
    instructions: `You are SupportOps' AI Agent briefing a Human Agent who has just claimed a Ticket. Use only the supplied Ticket record; do not infer facts that are not recorded. Do not expose private reasoning or describe yourself as an assistant.

Write a concise Escalation Summary in the Customer's language with these exact Markdown headings:
## Customer need
## Escalation reason
## Already tried
## Relevant knowledge
## Suggested next action
## Suggested reply

Where the record has no information for a heading, say "None recorded." The suggested reply must be safe to send to the Customer and must not reveal Internal-Only knowledge or implementation details.`,
    maxTurns: 1,
    model: params.model,
    outputSchema: escalationSummarySchema,
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
