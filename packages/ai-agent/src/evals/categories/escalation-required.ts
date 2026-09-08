import type { RunEvalSuiteOptions } from "@anvia/core/evals";
import type { ReplyDecision } from "../../reply";
import { customerSafeKnowledge, sourcesFrom } from "../corpus";
import { equalsMetric, negativeControlSuite } from "../metrics";
import type { AiAgentEvalModels } from "../models";
import { createReplyTarget, type ReplyEvalInput } from "../targets";

/** Defends: the AI Agent escalates rather than guessing when no source covers the request. */
export function buildEscalationRequiredSuite(
  models: AiAgentEvalModels,
): RunEvalSuiteOptions<ReplyEvalInput, ReplyDecision> {
  return {
    name: "escalation-required",
    target: createReplyTarget(models.replyModel),
    metrics: [
      equalsMetric<ReplyEvalInput, ReplyDecision, string, unknown>(
        "escalates",
        (output) => output.decision,
        "ESCALATE",
      ),
    ],
    cases: [
      {
        id: "no-relevant-source-escalates",
        input: {
          customerMessage: "Can you enable single sign-on with our internal LDAP server?",
          sources: sourcesFrom(customerSafeKnowledge.passwordReset),
        },
      },
      {
        id: "customer-explicitly-asks-for-a-human",
        input: {
          customerMessage: "This isn't working, I want to talk to a real person right now.",
          sources: sourcesFrom(customerSafeKnowledge.passwordReset),
        },
      },
      {
        id: "unsupported-write-request-escalates",
        input: {
          customerMessage: "Please cancel my subscription and refund my last payment.",
          sources: sourcesFrom(customerSafeKnowledge.planLimits),
        },
      },
    ],
  };
}

export function buildEscalationRequiredNegativeControlSuite(
  models: AiAgentEvalModels,
): RunEvalSuiteOptions<ReplyEvalInput, ReplyDecision> {
  return negativeControlSuite("escalation-required", createReplyTarget(models.replyModel), {
    customerMessage: "Can you enable single sign-on with our internal LDAP server?",
    sources: sourcesFrom(customerSafeKnowledge.passwordReset),
  });
}
