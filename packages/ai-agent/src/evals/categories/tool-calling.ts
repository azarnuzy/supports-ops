import { defineMetric, EvalOutcome, type RunEvalSuiteOptions } from "@anvia/core/evals";
import type { ReplyDecision } from "../../reply";
import { businessData, customerSafeKnowledge, sourcesFrom } from "../corpus";
import { negativeControlSuite } from "../metrics";
import type { AiAgentEvalModels } from "../models";
import { createReplyTarget, type ReplyEvalInput } from "../targets";

type Expected = {
  decision: ReplyDecision["decision"];
  escalationReason?: ReplyDecision["escalationReason"];
};

const matchesExpectedDecision = defineMetric<ReplyEvalInput, ReplyDecision, string, Expected>({
  name: "decision",
  required: true,
  dataType: "CATEGORICAL",
  evaluate({ output, case: testCase }) {
    const expected = testCase.expected;
    if (!expected) {
      return EvalOutcome.invalid("case has no expected decision", { kind: "configuration" });
    }
    if (output.decision !== expected.decision) {
      return EvalOutcome.fail(output.decision, {
        comment: `expected decision ${expected.decision}, got ${output.decision}`,
      });
    }
    if (expected.escalationReason && output.escalationReason !== expected.escalationReason) {
      return EvalOutcome.fail(output.decision, {
        comment: `expected escalationReason ${expected.escalationReason}, got ${output.escalationReason}`,
      });
    }
    return EvalOutcome.pass(output.decision);
  },
});

/**
 * Defends: the AI Agent uses live, Customer-specific Business Tool data when
 * it's available, and escalates rather than guessing when a Business Tool
 * fails or when the request needs a write no Business Tool can perform.
 */
export function buildToolCallingSuite(
  models: AiAgentEvalModels,
): RunEvalSuiteOptions<ReplyEvalInput, ReplyDecision, Expected> {
  return {
    name: "tool-calling",
    target: createReplyTarget(models.replyModel),
    metrics: [matchesExpectedDecision],
    cases: [
      {
        id: "answers-from-live-subscription-data",
        input: {
          customerMessage: "Is my subscription active?",
          sources: sourcesFrom(customerSafeKnowledge.planLimits),
          businessData: businessData.activeSubscription,
        },
        expected: { decision: "REPLY" },
      },
      {
        id: "refund-request-is-a-write-and-escalates",
        input: {
          customerMessage: "Please issue a refund for my last invoice.",
          sources: sourcesFrom(customerSafeKnowledge.billingCycle),
          businessData: businessData.overdueInvoice,
        },
        expected: { decision: "ESCALATE", escalationReason: "INTERNAL_ACTION_REQUIRED" },
      },
      {
        id: "business-tool-failure-escalates",
        input: {
          customerMessage: "What's the status of my subscription?",
          sources: sourcesFrom(customerSafeKnowledge.planLimits),
          businessData: businessData.toolFailure,
        },
        expected: { decision: "ESCALATE", escalationReason: "BUSINESS_TOOL_FAILURE" },
      },
    ],
  };
}

export function buildToolCallingNegativeControlSuite(
  models: AiAgentEvalModels,
): RunEvalSuiteOptions<ReplyEvalInput, ReplyDecision> {
  const sampleInput: ReplyEvalInput = {
    customerMessage: "Is my subscription active?",
    sources: sourcesFrom(customerSafeKnowledge.planLimits),
    businessData: businessData.activeSubscription,
  };
  return negativeControlSuite("tool-calling", createReplyTarget(models.replyModel), sampleInput);
}
