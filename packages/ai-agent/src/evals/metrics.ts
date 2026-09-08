import {
  defineMetric,
  EvalOutcome,
  type EvalMetric,
  type EvalTarget,
  type RunEvalSuiteOptions,
} from "@anvia/core/evals";
import { detectLanguage, type SupportedLanguage } from "../language";

export type EvalLanguage = SupportedLanguage;

/**
 * Always fails, regardless of the target's output. Every category includes
 * one case wired to this metric so a broken evaluator — one that reports
 * "pass" no matter what — cannot silently mark an entire suite green.
 */
export function negativeControlMetric<Input = unknown, Output = unknown, Expected = unknown>(
  name = "negative-control",
): EvalMetric<Input, Output, boolean, Expected, string> {
  return defineMetric<Input, Output, boolean, Expected>({
    name,
    required: true,
    dataType: "BOOLEAN",
    evaluate() {
      return EvalOutcome.fail(false, {
        comment:
          "Negative control: this metric always fails so a broken evaluator cannot mark every case as passing.",
      });
    },
  });
}

/**
 * A one-case suite whose only metric always fails. Every category composes
 * its real suite with one of these, isolated so the always-failing metric
 * never drags down a case that is otherwise being judged on its merits.
 */
export function negativeControlSuite<Input, Output>(
  categoryName: string,
  target: EvalTarget<Input, Output>,
  sampleInput: Input,
): RunEvalSuiteOptions<Input, Output> {
  return {
    name: `${categoryName}-negative-control`,
    target,
    metrics: [negativeControlMetric<Input, Output>()],
    cases: [{ id: "negative-control", input: sampleInput }],
  };
}

/** Deterministic equality check on a value read off the target's output. */
export function equalsMetric<Input, Output, Value, Expected = unknown>(
  name: string,
  actual: (output: Output) => Value,
  expected: Value,
): EvalMetric<Input, Output, boolean, Expected, string> {
  return defineMetric<Input, Output, boolean, Expected>({
    name,
    required: true,
    dataType: "BOOLEAN",
    evaluate({ output }) {
      const value = actual(output);
      return value === expected
        ? EvalOutcome.pass(true, { comment: `got ${JSON.stringify(value)}` })
        : EvalOutcome.fail(false, {
            comment: `expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`,
          });
    },
  });
}

/** Deterministic inequality check on a value read off the target's output. */
export function notEqualsMetric<Input, Output, Value, Expected = unknown>(
  name: string,
  actual: (output: Output) => Value,
  forbidden: Value,
): EvalMetric<Input, Output, boolean, Expected, string> {
  return defineMetric<Input, Output, boolean, Expected>({
    name,
    required: true,
    dataType: "BOOLEAN",
    evaluate({ output }) {
      const value = actual(output);
      return value !== forbidden
        ? EvalOutcome.pass(true, { comment: `got ${JSON.stringify(value)}` })
        : EvalOutcome.fail(false, {
            comment: `must not be ${JSON.stringify(forbidden)}, got ${JSON.stringify(value)}`,
          });
    },
  });
}

/**
 * Fails if any of the given canary snippets shows up (case-insensitively) in
 * the text read off the target's output. Used by visibility-safety cases to
 * catch an Internal-Only leak independently of any leak guard the target
 * itself implements.
 */
export function neverContainsMetric<Input, Output, Expected = unknown>(
  name: string,
  actual: (output: Output) => string,
  forbiddenSnippets: readonly string[],
): EvalMetric<Input, Output, boolean, Expected, string> {
  return defineMetric<Input, Output, boolean, Expected>({
    name,
    required: true,
    dataType: "BOOLEAN",
    evaluate({ output }) {
      const text = actual(output).toLocaleLowerCase();
      const leaked = forbiddenSnippets.find((snippet) =>
        text.includes(snippet.toLocaleLowerCase()),
      );
      return leaked
        ? EvalOutcome.fail(false, { comment: `leaked forbidden snippet: "${leaked}"` })
        : EvalOutcome.pass(true);
    },
  });
}

export function languageMatchesMetric<Input, Output, Expected = unknown>(
  name: string,
  actual: (output: Output) => string,
  expectedLanguage: EvalLanguage,
): EvalMetric<Input, Output, string, Expected, string> {
  return defineMetric<Input, Output, string, Expected>({
    name,
    required: true,
    dataType: "CATEGORICAL",
    evaluate({ output }) {
      const text = actual(output);
      if (!text.trim()) {
        return EvalOutcome.invalid("target produced no text to detect a language from", {
          kind: "target",
        });
      }
      const detected = detectLanguage(text);
      return detected === expectedLanguage
        ? EvalOutcome.pass(detected, { comment: `detected ${detected}` })
        : EvalOutcome.fail(detected, {
            comment: `expected ${expectedLanguage}, detected ${detected}`,
          });
    },
  });
}
