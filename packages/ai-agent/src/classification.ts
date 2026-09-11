import { extract } from "@anvia/core/extractor";
import { OpenAIClient } from "@anvia/openai";
import type { CompletionModel } from "@anvia/core";
import { withSpan } from "@repo/logger/telemetry";
import { z } from "zod";

export const ticketPrioritySchema = z.enum(["LOW", "NORMAL", "HIGH"]);

/** Categories are configured per Workspace, so the classifier is told about them at call time
 * instead of carrying a fixed list. `key` is the stable identifier stored on the Ticket. */
export type TicketCategoryOption = {
  description: string;
  isFallback: boolean;
  key: string;
  label: string;
};

export type TicketCategory = string;
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;

export type ClassificationModel = CompletionModel;

export type ClassificationDecision =
  | { qualifies: true; title: string; category: TicketCategory; priority: TicketPriority }
  | { qualifies: false; reply: string };

/**
 * The model provider rejected the call outright (bad/revoked API key, rate
 * limit, transport failure) or kept returning output that failed schema
 * validation across every retry. Distinct from a missing API key, which the
 * caller can detect before ever reaching the provider.
 */
export class ClassificationFailedError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("The AI Agent could not classify this message.", options);
    this.name = "ClassificationFailedError";
  }
}

const classificationOutputSchema = z.object({
  isSupportRequest: z.boolean(),
  title: z.string().trim().min(1).max(120).nullable(),
  category: z.string().trim().min(1).nullable(),
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
- When isSupportRequest is true: set title (a concise, specific summary under 120 characters, written in the same language as the Customer's message), category (exactly one of the keys listed under Categories below — copy the key verbatim, and use the fallback key when unsure), and priority (HIGH when the message signals urgency or a blocking problem, LOW for a minor or cosmetic issue, NORMAL otherwise). Leave greetingReply null.
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

function describeCategories(categories: readonly TicketCategoryOption[]) {
  const lines = categories.map(
    (category) =>
      `- ${category.key}${category.isFallback ? " (fallback)" : ""}: ${category.label} — ${category.description}`,
  );
  return `${instructions}\n\nCategories:\n${lines.join("\n")}`;
}

export async function classifyMessage(params: {
  model: ClassificationModel;
  content: string;
  categories: readonly TicketCategoryOption[];
}): Promise<ClassificationDecision> {
  return withSpan("ai_agent.classify", {}, async (span) => {
    let output: z.infer<typeof classificationOutputSchema>;

    try {
      ({ output } = await extract({
        instructions: describeCategories(params.categories),
        model: params.model,
        outputSchema: classificationOutputSchema,
        retries: { maxAttempts: 2 },
        text: params.content,
      }));
    } catch (error) {
      throw new ClassificationFailedError({ cause: error });
    }

    const decision = narrowClassification(output, params.content, params.categories);
    span.setAttribute("ai_agent.qualifies", decision.qualifies);
    if (decision.qualifies) {
      span.setAttributes({
        "ai_agent.category": decision.category,
        "ai_agent.priority": decision.priority,
      });
    }
    return decision;
  });
}

/** A model that invents a category name must not write it onto a Ticket, because filters and
 * Routing Rules only recognise configured keys. Anything unrecognised lands on the fallback. */
function narrowClassification(
  output: z.infer<typeof classificationOutputSchema>,
  originalContent: string,
  categories: readonly TicketCategoryOption[],
): ClassificationDecision {
  if (output.isSupportRequest) {
    const fallbackKey = (categories.find((category) => category.isFallback) ?? categories[0])?.key;
    const matched = categories.find((category) => category.key === output.category)?.key;
    return {
      category: matched ?? fallbackKey ?? "GENERAL",
      priority: output.priority ?? "NORMAL",
      qualifies: true,
      title: output.title?.slice(0, 120) ?? originalContent.trim().slice(0, 120),
    };
  }

  return { qualifies: false, reply: output.greetingReply ?? fallbackGreetingReply };
}
