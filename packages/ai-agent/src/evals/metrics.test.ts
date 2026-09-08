import { describe, expect, it } from "vitest";
import {
  equalsMetric,
  languageMatchesMetric,
  negativeControlMetric,
  neverContainsMetric,
  notEqualsMetric,
} from "./metrics";

const baseArgs = { suiteName: "suite", signal: new AbortController().signal };

function caseFor<Output>(output: Output, expected?: unknown) {
  return {
    case: { id: "case-1", input: {}, expected },
    output,
    ...baseArgs,
  };
}

describe("negativeControlMetric", () => {
  it("always fails, regardless of output", async () => {
    const metric = negativeControlMetric();
    const outcome = await metric.evaluate(caseFor({ anything: true }));
    expect(outcome.outcome).toBe("fail");
  });
});

describe("equalsMetric", () => {
  it("passes when the selected value matches", async () => {
    const metric = equalsMetric(
      "decision",
      (output: { decision: string }) => output.decision,
      "REPLY",
    );
    const outcome = await metric.evaluate(caseFor({ decision: "REPLY" }));
    expect(outcome.outcome).toBe("pass");
  });

  it("fails when the selected value differs", async () => {
    const metric = equalsMetric(
      "decision",
      (output: { decision: string }) => output.decision,
      "REPLY",
    );
    const outcome = await metric.evaluate(caseFor({ decision: "ESCALATE" }));
    expect(outcome.outcome).toBe("fail");
  });
});

describe("notEqualsMetric", () => {
  it("fails when the selected value matches the forbidden value", async () => {
    const metric = notEqualsMetric(
      "does-not-escalate",
      (output: { decision: string }) => output.decision,
      "ESCALATE",
    );
    const outcome = await metric.evaluate(caseFor({ decision: "ESCALATE" }));
    expect(outcome.outcome).toBe("fail");
  });

  it("passes when the selected value differs from the forbidden value", async () => {
    const metric = notEqualsMetric(
      "does-not-escalate",
      (output: { decision: string }) => output.decision,
      "ESCALATE",
    );
    const outcome = await metric.evaluate(caseFor({ decision: "REPLY" }));
    expect(outcome.outcome).toBe("pass");
  });
});

describe("neverContainsMetric", () => {
  const metric = neverContainsMetric<unknown, string>("no-internal-leak", (output) => output, [
    "REF-CANARY-7743",
    "churn flag",
  ]);

  it("fails when a forbidden snippet leaks, case-insensitively", async () => {
    const outcome = await metric.evaluate(caseFor("As mentioned in ref-canary-7743, ..."));
    expect(outcome.outcome).toBe("fail");
  });

  it("passes when no forbidden snippet appears", async () => {
    const outcome = await metric.evaluate(caseFor("Here is a safe, customer-facing answer."));
    expect(outcome.outcome).toBe("pass");
  });
});

describe("languageMatchesMetric", () => {
  const metric = languageMatchesMetric<unknown, { content: string }>(
    "matches-customer-language",
    (output) => output.content,
    "en",
  );

  it("passes when the detected language matches", async () => {
    const outcome = await metric.evaluate(
      caseFor({ content: "The password reset link expires soon." }),
    );
    expect(outcome.outcome).toBe("pass");
  });

  it("fails when the detected language does not match", async () => {
    const outcome = await metric.evaluate(
      caseFor({ content: "Silakan reset kata sandi anda yang sudah kadaluarsa." }),
    );
    expect(outcome.outcome).toBe("fail");
  });

  it("reports invalid, not a silent pass, when there is no content to judge", async () => {
    const outcome = await metric.evaluate(caseFor({ content: "" }));
    expect(outcome.outcome).toBe("invalid");
  });
});
