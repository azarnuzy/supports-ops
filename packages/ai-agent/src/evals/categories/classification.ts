import { defineMetric, EvalOutcome, type RunEvalSuiteOptions } from "@anvia/core/evals";
import type { ClassificationDecision } from "../../classification";
import { negativeControlSuite } from "../metrics";
import type { AiAgentEvalModels } from "../models";
import { createClassificationTarget, type ClassificationEvalInput } from "../targets";

type Expected = { category?: string; qualifies: boolean };

/** Checks `qualifies` against each case's own expected value, not a fixed constant. */
const qualifiesMatchesExpected = defineMetric<
  ClassificationEvalInput,
  ClassificationDecision,
  boolean,
  Expected
>({
  name: "qualifies",
  required: true,
  dataType: "BOOLEAN",
  evaluate({ output, case: testCase }) {
    const expected = testCase.expected?.qualifies;
    return output.qualifies === expected
      ? EvalOutcome.pass(true, { comment: `got ${output.qualifies}` })
      : EvalOutcome.fail(false, {
          comment: `expected ${expected}, got ${output.qualifies}`,
        });
  },
});

/** Invalid (not fail) when the message wasn't classified as a support request — there is no category to check. */
const categoryMatchesExpected = defineMetric<
  ClassificationEvalInput,
  ClassificationDecision,
  string,
  Expected
>({
  name: "category",
  required: true,
  dataType: "CATEGORICAL",
  evaluate({ output, case: testCase }) {
    if (!output.qualifies) {
      return EvalOutcome.invalid(
        "message did not qualify as a support request; no category to check",
        {
          kind: "target",
        },
      );
    }
    const expected = testCase.expected?.category;
    if (!expected) {
      return EvalOutcome.invalid("case has no expected category", { kind: "configuration" });
    }
    return output.category === expected
      ? EvalOutcome.pass(output.category, { comment: `got ${output.category}` })
      : EvalOutcome.fail(output.category, {
          comment: `expected ${expected}, got ${output.category}`,
        });
  },
});

/** Defends: the AI Agent only opens a Ticket for genuine support requests, and files it under the right category. */
export function buildClassificationSuite(
  models: AiAgentEvalModels,
): RunEvalSuiteOptions<ClassificationEvalInput, ClassificationDecision, Expected> {
  return {
    name: "classification",
    target: createClassificationTarget(models.classificationModel),
    metrics: [qualifiesMatchesExpected, categoryMatchesExpected],
    cases: [
      {
        id: "billing-request-qualifies-as-billing",
        input: { content: "I was charged twice for my invoice this month, please help" },
        expected: { category: "BILLING", qualifies: true },
      },
      {
        id: "greeting-does-not-qualify",
        input: { content: "hi there!" },
        expected: { qualifies: false },
      },
      {
        id: "thanks-does-not-qualify",
        input: { content: "thanks a lot, appreciate it!" },
        expected: { qualifies: false },
      },
    ],
  };
}

export function buildClassificationNegativeControlSuite(
  models: AiAgentEvalModels,
): RunEvalSuiteOptions<ClassificationEvalInput, ClassificationDecision> {
  return negativeControlSuite(
    "classification",
    createClassificationTarget(models.classificationModel),
    { content: "I was charged twice for my invoice this month, please help" },
  );
}
