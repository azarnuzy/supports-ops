import type { EvalTarget } from "@anvia/core/evals";
import {
  classifyMessage,
  type ClassificationDecision,
  type ClassificationModel,
  type TicketCategoryOption,
} from "../classification";
import { generateEscalationSummary, generateSuggestedReply } from "../handoff";
import { streamReply, type ReplyDecision, type ReplyModel } from "../reply";
import { createAssignedTools } from "../tools";

/**
 * The eval suite calls the same production functions the AI Agent runs in
 * apps/api — `streamReply`, `classifyMessage`, `generateSuggestedReply` —
 * with a model, a fixed set of sources, and canned Tools whose results are
 * fixed instead of fetched. None of them reach a database or the network beyond the
 * model call itself, which is what lets an Eval Case stand in for a live
 * Workspace.
 */

/** An assigned Tool with a fixed result, standing in for a live HTTP or MCP call.
 * `result: Error` stands in for a Tool call that fails at runtime. */
export type ReplyEvalTool = {
  description: string;
  name: string;
  result: string | Error;
};

export type ReplyEvalInput = {
  clarificationCount?: number;
  customerMessage: string;
  sources: Array<{ id: string; content: string }>;
  ticketContext?: Array<{ id: string; content: string }>;
  tools?: ReplyEvalTool[];
};

function stubTools(tools: ReplyEvalTool[] | undefined) {
  if (!tools?.length) return undefined;
  const byId = new Map(tools.map((tool) => [tool.name, tool]));
  return createAssignedTools(
    tools.map((tool) => ({
      description: tool.description,
      id: tool.name,
      inputSchema: { properties: {}, type: "object" },
      name: tool.name,
    })),
    async ({ toolId }) => {
      const result = byId.get(toolId)?.result;
      if (result instanceof Error) throw result;
      return result ?? "";
    },
  );
}

export function createReplyTarget(model: ReplyModel): EvalTarget<ReplyEvalInput, ReplyDecision> {
  return (input) =>
    streamReply({
      clarificationCount: input.clarificationCount ?? 0,
      customerMessage: input.customerMessage,
      model,
      onDelta: () => {},
      sources: input.sources,
      ticketContext: input.ticketContext,
      tools: stubTools(input.tools),
    });
}

export type ClassificationEvalInput = { content: string };

const defaultEvalCategories: TicketCategoryOption[] = [
  {
    description: "Sign-in problems, profile changes, access, and account security.",
    isFallback: false,
    key: "ACCOUNT",
    label: "Account",
  },
  {
    description: "Invoices, payments, refunds, and anything about money already charged.",
    isFallback: false,
    key: "BILLING",
    label: "Billing",
  },
  {
    description: "Plans, upgrades, downgrades, renewals, and cancellations.",
    isFallback: false,
    key: "SUBSCRIPTION",
    label: "Subscription",
  },
  {
    description: "Bugs, errors, outages, and the product not behaving as expected.",
    isFallback: false,
    key: "TECHNICAL",
    label: "Technical",
  },
  {
    description: "Anything that does not clearly belong to another category.",
    isFallback: true,
    key: "GENERAL",
    label: "General",
  },
];

export function createClassificationTarget(
  model: ClassificationModel,
): EvalTarget<ClassificationEvalInput, ClassificationDecision> {
  // The eval suite grades against the shipped defaults, which are what a new Workspace starts with.
  return (input) =>
    classifyMessage({ categories: defaultEvalCategories, content: input.content, model });
}

export type SuggestedReplyEvalInput = {
  businessData?: string;
  currentConversation: string;
  customerMessage: string;
  customerSafeSources: string[];
  internalOnlySources: string[];
  previousTicketContext: string;
};

export function createSuggestedReplyTarget(
  model: ReplyModel,
): EvalTarget<SuggestedReplyEvalInput, string> {
  return (input) =>
    generateSuggestedReply({
      businessData: input.businessData,
      currentConversation: input.currentConversation,
      customerMessage: input.customerMessage,
      customerSafeSources: input.customerSafeSources,
      internalOnlySources: input.internalOnlySources,
      model,
      previousTicketContext: input.previousTicketContext,
    });
}

export type EscalationSummaryEvalInput = {
  ticket: {
    escalationReason: string;
    messages: Array<{ content: string; senderType: string }>;
    recordedActivity: string;
    title: string;
  };
};

export function createEscalationSummaryTarget(
  model: ReplyModel,
): EvalTarget<EscalationSummaryEvalInput, string> {
  return (input) => generateEscalationSummary({ model, ticket: input.ticket });
}
