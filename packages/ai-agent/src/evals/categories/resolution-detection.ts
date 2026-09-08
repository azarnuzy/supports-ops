import type { RunEvalSuiteOptions } from "@anvia/core/evals";
import type { ReplyDecision } from "../../reply";
import { customerSafeKnowledge, sourcesFrom } from "../corpus";
import { equalsMetric, negativeControlSuite } from "../metrics";
import type { AiAgentEvalModels } from "../models";
import { createReplyTarget, type ReplyEvalInput } from "../targets";

/**
 * Defends: the AI Agent resolves only on a clear, unambiguous confirmation —
 * never on a bare thanks, and never guesses when intent is unclear.
 */
export function buildResolutionDetectionSuite(
  models: AiAgentEvalModels,
): RunEvalSuiteOptions<ReplyEvalInput, ReplyDecision> {
  return {
    name: "resolution-detection",
    target: createReplyTarget(models.replyModel),
    metrics: [
      equalsMetric<ReplyEvalInput, ReplyDecision, string, unknown>(
        "decision",
        (output) => output.decision,
        "RESOLVE",
      ),
    ],
    cases: [
      {
        id: "explicit-confirmation-resolves",
        input: {
          customerMessage: "That fixed it, thank you, my problem is solved now.",
          sources: sourcesFrom(customerSafeKnowledge.passwordReset),
        },
      },
      {
        id: "indonesian-confirmation-resolves",
        input: {
          customerMessage: "Sudah bisa, masalah saya sudah selesai, terima kasih.",
          sources: sourcesFrom(customerSafeKnowledge.passwordReset),
        },
      },
    ],
  };
}

/** Bare thanks and acknowledgement must never be mistaken for a resolution confirmation. */
export function buildResolutionDetectionBareThanksSuite(
  models: AiAgentEvalModels,
): RunEvalSuiteOptions<ReplyEvalInput, ReplyDecision> {
  return {
    name: "resolution-detection-bare-thanks",
    target: createReplyTarget(models.replyModel),
    metrics: [
      equalsMetric<ReplyEvalInput, ReplyDecision, boolean, unknown>(
        "does-not-resolve",
        (output) => output.decision === "RESOLVE",
        false,
      ),
    ],
    cases: [
      {
        id: "bare-thanks-does-not-resolve",
        input: {
          customerMessage: "thanks",
          sources: sourcesFrom(customerSafeKnowledge.passwordReset),
        },
      },
      {
        id: "bare-ok-does-not-resolve",
        input: {
          customerMessage: "oke",
          sources: sourcesFrom(customerSafeKnowledge.passwordReset),
        },
      },
    ],
  };
}

export function buildResolutionDetectionNegativeControlSuite(
  models: AiAgentEvalModels,
): RunEvalSuiteOptions<ReplyEvalInput, ReplyDecision> {
  return negativeControlSuite("resolution-detection", createReplyTarget(models.replyModel), {
    customerMessage: "That fixed it, thank you, my problem is solved now.",
    sources: sourcesFrom(customerSafeKnowledge.passwordReset),
  });
}
