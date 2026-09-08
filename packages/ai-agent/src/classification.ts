import { extract } from "@anvia/core/extractor";
import { OpenAIClient } from "@anvia/openai";
import type { CompletionModel } from "@anvia/core";
import { z } from "zod";

export const ticketCategorySchema = z.enum([
  "ACCOUNT",
  "BILLING",
  "SUBSCRIPTION",
  "TECHNICAL",
  "GENERAL",
]);
export const ticketPrioritySchema = z.enum(["LOW", "NORMAL", "HIGH"]);

export type TicketCategory = z.infer<typeof ticketCategorySchema>;
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;

export type ClassificationModel = CompletionModel;

export type ClassificationDecision =
  | { qualifies: true; title: string; category: TicketCategory; priority: TicketPriority }
  | { qualifies: false; reply: string };

const classificationOutputSchema = z.object({
  isSupportRequest: z.boolean(),
  title: z.string().trim().min(1).max(120).nullable(),
  category: ticketCategorySchema.nullable(),
  priority: ticketPrioritySchema.nullable(),
  greetingReply: z.string().trim().min(1).nullable(),
});

/**
 * A flat, fully-nullable object rather than a discriminated union — a
 * `z.discriminatedUnion` outputSchema is rejected by the provider (root-level
 * `oneOf`, see docs/planning/spike-anvia.md finding 1). Narrowed into
 * `ClassificationDecision` by `classifyMessage` below.
 */
const instructions = `You are the classification step of SupportOps' AI Agent. A Customer just sent a message in a Web Session that has no Ticket yet. Decide whether it is a genuine support request or just a greeting, thanks, test message, or other small talk with no real request.

Rules:
- isSupportRequest is true only for a message that describes a problem, question, or need related to the company's product, account, billing, or service — something a support team should act on.
- isSupportRequest is false for greetings, thanks, small talk, or anything with no real request. This holds regardless of whether the Customer wrote in Indonesian, English, or another language.
- When isSupportRequest is true: set title (a concise, specific summary under 120 characters, written in the same language as the Customer's message), category (the closest fit among ACCOUNT, BILLING, SUBSCRIPTION, TECHNICAL, GENERAL — use GENERAL when unsure), and priority (HIGH when the message signals urgency or a blocking problem, LOW for a minor or cosmetic issue, NORMAL otherwise). Leave greetingReply null.
- When isSupportRequest is false: leave title, category, and priority null, and set greetingReply to a short, warm reply in the same language the Customer wrote in, acknowledging them and inviting them to describe what they need help with.
- Never invent facts about the company. A greeting reply is purely conversational and does not answer support questions.`;

const fallbackGreetingReply =
  "Hi! I'm here to help — could you tell me a bit more about what you need?";

export function createClassificationModel(options: {
  apiKey: string;
  modelId: string;
  baseUrl?: string;
}): ClassificationModel {
  const client = new OpenAIClient({ apiKey: options.apiKey, baseUrl: options.baseUrl });
  return client.completionModel({ api: "chat", modelId: options.modelId });
}

export async function classifyMessage(params: {
  model: ClassificationModel;
  content: string;
}): Promise<ClassificationDecision> {
  const { output } = await extract({
    instructions,
    model: params.model,
    outputSchema: classificationOutputSchema,
    retries: { maxAttempts: 2 },
    text: params.content,
  });

  return narrowClassification(output, params.content);
}

function narrowClassification(
  output: z.infer<typeof classificationOutputSchema>,
  originalContent: string,
): ClassificationDecision {
  if (output.isSupportRequest) {
    return {
      category: output.category ?? "GENERAL",
      priority: output.priority ?? "NORMAL",
      qualifies: true,
      title: output.title?.slice(0, 120) ?? originalContent.trim().slice(0, 120),
    };
  }

  return { qualifies: false, reply: output.greetingReply ?? fallbackGreetingReply };
}
