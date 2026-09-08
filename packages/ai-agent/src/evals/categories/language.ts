import type { RunEvalSuiteOptions } from "@anvia/core/evals";
import type { ReplyDecision } from "../../reply";
import { customerSafeKnowledge, sourcesFrom } from "../corpus";
import { equalsMetric, languageMatchesMetric, negativeControlSuite } from "../metrics";
import type { AiAgentEvalModels } from "../models";
import {
  createEscalationSummaryTarget,
  createReplyTarget,
  createSuggestedReplyTarget,
  type EscalationSummaryEvalInput,
  type ReplyEvalInput,
  type SuggestedReplyEvalInput,
} from "../targets";

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

/**
 * The AI Copilot's suggested-reply path (issue #38) is not exercised by the
 * `buildLanguageSuite` cases above, which only cover `streamReply`. A
 * multi-turn English conversation reproduces the bug report: the reply must
 * stay in English even though nothing in the prompt states the language
 * outright.
 */
export function buildLanguageSuggestedReplySuite(
  models: AiAgentEvalModels,
): RunEvalSuiteOptions<SuggestedReplyEvalInput, string> {
  return {
    name: "language-suggested-reply",
    target: createSuggestedReplyTarget(models.replyModel),
    metrics: [
      languageMatchesMetric<SuggestedReplyEvalInput, string, unknown>(
        "matches-customer-language",
        (output) => output,
        "en",
      ),
    ],
    cases: [
      {
        id: "multi-turn-english-conversation-suggested-in-english",
        input: {
          customerMessage: "I want to talk to a human agent please",
          currentConversation: [
            "CUSTOMER: Hi, I'm having trouble resetting my password.",
            "AI_AGENT: I understand — let's get that sorted. Have you tried the 'Forgot password' link on the login page?",
            "CUSTOMER: Yes, but the reset email never arrives.",
            "AI_AGENT: I'm sorry for the trouble. Let me connect you with a Human Agent who can look into this further.",
            "CUSTOMER: I want to talk to a human agent please",
          ].join("\n"),
          customerSafeSources: [customerSafeKnowledge.passwordReset.content],
          internalOnlySources: [],
          previousTicketContext: "",
        },
      },
    ],
  };
}

/** Same gap as `buildLanguageSuggestedReplySuite`, for the Escalation Summary path. */
export function buildLanguageEscalationSummarySuite(
  models: AiAgentEvalModels,
): RunEvalSuiteOptions<EscalationSummaryEvalInput, string> {
  return {
    name: "language-escalation-summary",
    target: createEscalationSummaryTarget(models.replyModel),
    metrics: [
      languageMatchesMetric<EscalationSummaryEvalInput, string, unknown>(
        "matches-customer-language",
        (output) => output,
        "en",
      ),
    ],
    cases: [
      {
        id: "multi-turn-english-conversation-summarized-in-english",
        input: {
          ticket: {
            escalationReason: "CUSTOMER_REQUESTED_HUMAN",
            messages: [
              { content: "Hi, I'm having trouble resetting my password.", senderType: "CUSTOMER" },
              {
                content:
                  "I understand — let's get that sorted. Have you tried the 'Forgot password' link on the login page?",
                senderType: "AI_AGENT",
              },
              { content: "Yes, but the reset email never arrives.", senderType: "CUSTOMER" },
              { content: "I want to talk to a human agent please", senderType: "CUSTOMER" },
            ],
            recordedActivity:
              "AI Agent offered password reset guidance twice before the Customer requested a Human Agent.",
            title: "Password reset email not arriving",
          },
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
