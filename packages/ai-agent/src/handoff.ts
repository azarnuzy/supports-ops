import { Agent, type CompletionModel } from "@anvia/core";
import { z } from "zod";

const escalationSummarySchema = z.object({
  summary: z.string().trim().min(1),
});

export class EscalationSummaryGenerationFailedError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("The AI Agent could not generate an Escalation Summary.", options);
    this.name = "EscalationSummaryGenerationFailedError";
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
