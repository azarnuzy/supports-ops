import { faithfulness, type RunEvalSuiteOptions } from "@anvia/core/evals";
import type { ReplyDecision } from "../../reply";
import { customerSafeKnowledge, sourcesFrom } from "../corpus";
import { equalsMetric, negativeControlSuite } from "../metrics";
import type { AiAgentEvalModels } from "../models";
import { createReplyTarget, type ReplyEvalInput } from "../targets";

/** Defends: a factual reply traces back to a retrieved Customer-Safe source, never to model knowledge. */
export function buildGroundingSuite(
  models: AiAgentEvalModels,
): RunEvalSuiteOptions<ReplyEvalInput, ReplyDecision> {
  return {
    name: "grounding",
    target: createReplyTarget(models.replyModel),
    metrics: [
      equalsMetric<ReplyEvalInput, ReplyDecision, string, unknown>(
        "answers-when-source-covers-it",
        (output) => output.decision,
        "REPLY",
      ),
      // Model-judged: the ADR reserves judge metrics for requirements a
      // deterministic check can't cover — whether the reply's claims are
      // actually supported by the retrieved sources, not just that a reply
      // was attempted.
      faithfulness<ReplyEvalInput, ReplyDecision>({
        model: models.replyModel,
        required: true,
        threshold: 0.7,
        retrievalContext: (args) => args.case.input.sources.map((source) => source.content),
        actual: (args) => args.output.content ?? "",
      }),
    ],
    cases: [
      {
        id: "password-reset-answered-from-source",
        input: {
          customerMessage: "How do I reset my password?",
          sources: sourcesFrom(customerSafeKnowledge.passwordReset),
        },
      },
      {
        id: "plan-limits-answered-from-source",
        input: {
          customerMessage: "How many team members can I add on the Starter plan?",
          sources: sourcesFrom(customerSafeKnowledge.planLimits),
        },
      },
    ],
  };
}

export function buildGroundingNegativeControlSuite(
  models: AiAgentEvalModels,
): RunEvalSuiteOptions<ReplyEvalInput, ReplyDecision> {
  return negativeControlSuite("grounding", createReplyTarget(models.replyModel), {
    customerMessage: "How do I reset my password?",
    sources: sourcesFrom(customerSafeKnowledge.passwordReset),
  });
}
