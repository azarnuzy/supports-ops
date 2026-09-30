import type { EvalRun } from "@repo/api-client";

export function formatTestingDate(value: string | number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
}

/** Negative controls measure evaluator health, not the AI Agent pass rate. */
export function runResults(run: Pick<EvalRun, "cases">) {
  const graded = run.cases.filter((item) => !item.evaluatorHealth && item.status === "EVALUATED");
  return {
    passed: graded.filter((item) => item.passed === true).length,
    failed: graded.filter((item) => item.passed === false).length,
  };
}
