import type { RunEvalSuiteOptions } from "@anvia/core/evals";
import type { ReplyDecision } from "../../reply";
import { customerSafeKnowledge, sourcesFrom } from "../corpus";
import { negativeControlSuite, notEqualsMetric } from "../metrics";
import type { AiAgentEvalModels } from "../models";
import { createReplyTarget, type ReplyEvalInput } from "../targets";

/** Defends: the AI Agent does not escalate when it has everything it needs to help. */
export function buildEscalationForbiddenSuite(
  models: AiAgentEvalModels,
): RunEvalSuiteOptions<ReplyEvalInput, ReplyDecision> {
  return {
    name: "escalation-forbidden",
    target: createReplyTarget(models.replyModel),
    metrics: [
      notEqualsMetric<ReplyEvalInput, ReplyDecision, string, unknown>(
        "does-not-escalate",
        (output) => output.decision,
        "ESCALATE",
      ),
    ],
    cases: [
      {
        id: "answerable-question-does-not-escalate",
        input: {
          customerMessage: "How do I reset my password?",
          sources: sourcesFrom(customerSafeKnowledge.passwordReset),
        },
      },
      {
        id: "conversational-acknowledgement-does-not-escalate",
        input: { customerMessage: "ok got it, thank you!", sources: [] },
      },
      {
        id: "clarifiable-ambiguity-does-not-escalate-on-first-ask",
        input: {
          customerMessage: "It's not working.",
          sources: sourcesFrom(
            customerSafeKnowledge.passwordReset,
            customerSafeKnowledge.exportFormat,
          ),
          clarificationCount: 0,
        },
      },
    ],
  };
}

export function buildEscalationForbiddenNegativeControlSuite(
  models: AiAgentEvalModels,
): RunEvalSuiteOptions<ReplyEvalInput, ReplyDecision> {
  return negativeControlSuite("escalation-forbidden", createReplyTarget(models.replyModel), {
    customerMessage: "How do I reset my password?",
    sources: sourcesFrom(customerSafeKnowledge.passwordReset),
  });
}
