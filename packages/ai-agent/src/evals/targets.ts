import type { EvalTarget } from "@anvia/core/evals";
import {
  classifyMessage,
  type ClassificationDecision,
  type ClassificationModel,
} from "../classification";
import { generateEscalationSummary, generateSuggestedReply } from "../handoff";
import { streamReply, type ReplyDecision, type ReplyModel } from "../reply";

/**
 * The eval suite calls the same production functions the AI Agent runs in
 * apps/api — `streamReply`, `classifyMessage`, `generateSuggestedReply` —
 * with a model, a fixed set of sources, and canned Business Tool data as
 * plain parameters. None of them reach a database or the network beyond the
 * model call itself, which is what lets an Eval Case stand in for a live
 * Workspace.
 */

export type ReplyEvalInput = {
  businessData?: string;
  clarificationCount?: number;
  customerMessage: string;
  sources: Array<{ id: string; content: string }>;
  ticketContext?: Array<{ id: string; content: string }>;
};

export function createReplyTarget(model: ReplyModel): EvalTarget<ReplyEvalInput, ReplyDecision> {
  return (input) =>
    streamReply({
      businessData: input.businessData,
      clarificationCount: input.clarificationCount ?? 0,
      customerMessage: input.customerMessage,
      model,
      onDelta: () => {},
      sources: input.sources,
      ticketContext: input.ticketContext,
    });
}

export type ClassificationEvalInput = { content: string };

export function createClassificationTarget(
  model: ClassificationModel,
): EvalTarget<ClassificationEvalInput, ClassificationDecision> {
  return (input) => classifyMessage({ content: input.content, model });
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
