import type { RunEvalSuiteOptions } from "@anvia/core/evals";
import type { ReplyDecision } from "../../reply";
import { customerSafeKnowledge, sourcesFrom } from "../corpus";
import { equalsMetric, languageMatchesMetric, negativeControlSuite } from "../metrics";
import type { AiAgentEvalModels } from "../models";
import { createReplyTarget, type ReplyEvalInput } from "../targets";

/** Defends: the AI Agent replies in the Customer's own language. */
export function buildLanguageSuite(
  models: AiAgentEvalModels,
): RunEvalSuiteOptions<ReplyEvalInput, ReplyDecision> {
  return {
    name: "language",
    target: createReplyTarget(models.replyModel),
    metrics: [
      languageMatchesMetric<ReplyEvalInput, ReplyDecision, unknown>(
        "matches-customer-language",
        (output) => output.content ?? "",
        "en",
      ),
    ],
    cases: [
      {
        id: "english-question-answered-in-english",
        input: {
          customerMessage: "How do I reset my password?",
          sources: sourcesFrom(customerSafeKnowledge.passwordReset),
        },
      },
    ],
  };
}

export function buildLanguageIndonesianSuite(
  models: AiAgentEvalModels,
): RunEvalSuiteOptions<ReplyEvalInput, ReplyDecision> {
  return {
    name: "language-indonesian",
    target: createReplyTarget(models.replyModel),
    metrics: [
      languageMatchesMetric<ReplyEvalInput, ReplyDecision, unknown>(
        "matches-customer-language",
        (output) => output.content ?? "",
        "id",
      ),
    ],
    cases: [
      {
        id: "indonesian-question-answered-in-indonesian",
        input: {
          customerMessage: "Bagaimana cara reset password saya?",
          sources: sourcesFrom(customerSafeKnowledge.passwordReset),
        },
      },
    ],
  };
}

/**
 * A RESOLVE decision carries no content, so there's nothing to detect a
 * language from. This demonstrates the eval suite's `invalid` outcome:
 * `languageMatchesMetric` reports `invalid`, not a silent pass, when it
 * cannot judge the case — see the `evaluate` implementation in metrics.ts.
 */
export function buildLanguageResolveHasNoContentSuite(
  models: AiAgentEvalModels,
): RunEvalSuiteOptions<ReplyEvalInput, ReplyDecision> {
  return {
    name: "language-resolve-has-no-content",
    target: createReplyTarget(models.replyModel),
    metrics: [
      equalsMetric<ReplyEvalInput, ReplyDecision, string, unknown>(
        "resolves",
        (output) => output.decision,
        "RESOLVE",
      ),
      languageMatchesMetric<ReplyEvalInput, ReplyDecision, unknown>(
        "matches-customer-language",
        (output) => output.content ?? "",
        "en",
      ),
    ],
    cases: [
      {
        id: "resolve-decision-has-no-content-to-check",
        input: {
          customerMessage: "That fixed it, thank you, my problem is solved now.",
          sources: sourcesFrom(customerSafeKnowledge.passwordReset),
        },
      },
    ],
  };
}

export function buildLanguageNegativeControlSuite(
  models: AiAgentEvalModels,
): RunEvalSuiteOptions<ReplyEvalInput, ReplyDecision> {
  return negativeControlSuite("language", createReplyTarget(models.replyModel), {
    customerMessage: "How do I reset my password?",
    sources: sourcesFrom(customerSafeKnowledge.passwordReset),
  });
}
