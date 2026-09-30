import { expect, it } from "vitest";
import type { EvalRun } from "@repo/api-client";
import { formatTestingDate, runResults } from "./format";

it("formats local dates and excludes evaluator controls and ungraded cases from pass/fail", () => {
  expect(formatTestingDate(new Date(2026, 8, 30, 10, 19).getTime())).toBe(
    "Sep 30, 2026 · 10:19 AM",
  );
  expect(formatTestingDate("invalid")).toBe("—");
  const result = (
    passed: boolean | null,
    status: EvalRun["cases"][number]["status"],
    evaluatorHealth = false,
  ): EvalRun["cases"][number] => ({
    caseKey: "case-1",
    category: "",
    error: null,
    evaluatorHealth,
    id: "id",
    judgeCalls: 0,
    limitations: null,
    metric: "contains",
    passed,
    position: 0,
    status,
    traceId: null,
  });
  expect(
    runResults({
      cases: [
        result(true, "EVALUATED"),
        result(false, "EVALUATED"),
        result(true, "EVALUATED", true),
        result(false, "EVALUATED", true),
        result(null, "UNGRADED"),
      ],
    }),
  ).toEqual({ passed: 1, failed: 1 });
});
