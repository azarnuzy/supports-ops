import { expect, test } from "@playwright/test";
import type { EvalCase, EvalRun } from "@repo/api-client";

test("keeps every attempt across run pages and separates History from Results", async ({ page }) => {
  const evalCase: EvalCase = {
    id: "history-case", caseKey: "repeat-case", category: "grounding",
    message: "Repeated customer question", expected: "Expected answer", metric: "contains",
    metadata: {}, attachments: [], history: [], clarificationCount: 0, complete: true, issues: [],
  };
  const runs: EvalRun[] = Array.from({ length: 21 }, (_, index) => {
    const createdAt = new Date(Date.UTC(2026, 0, 22 - index)).toISOString();
    return {
      id: `history-run-${index}`, datasetId: "history-dataset", datasetName: "History dataset",
      createdAt, finishedAt: new Date(new Date(createdAt).getTime() + 65000).toISOString(),
      status: "FINISHED", error: null,
      agentCharged: 1, judgeCharged: 0, judgeCallsCharged: 0, chargedCredits: 1,
      estimatedCredits: 1, creditExhausted: false,
      destinationBackend: "LANGFUSE", destinationDashboardUrl: "https://example.com/report",
      workspaceDelivery: "NOT_CONFIGURED", centralDelivery: "DELIVERED",
      workspaceExpiresAt: null, centralExpiresAt: null,
      workspaceRetryable: false, centralRetryable: false,
      progress: {
        total: 1, evaluated: 1, passed: index === 20 ? 0 : 1,
        executionErrors: 0, invalid: 0, unexecuted: 0, ungraded: 0,
        evaluatorChecks: 0, evaluatorHealthy: 0,
      },
      cases: [{
        id: `attempt-${index}`, sourceCaseId: evalCase.id, caseKey: evalCase.caseKey,
        category: evalCase.category, message: evalCase.message, expected: evalCase.expected,
        metadata: {}, metric: "contains", result: { answer: `Answer from attempt ${index}` },
        status: "EVALUATED", passed: index !== 20, evaluatorHealth: false,
        error: null, judgeCalls: 0, limitations: [], position: 0, traceId: null,
      }],
    };
  });
  await page.route("**/eval-datasets/history-dataset?*", (route) => route.fulfill({
    json: { dataset: {
      id: "history-dataset", name: "History dataset", criteria: "",
      createdAt: runs[0]!.createdAt, updatedAt: runs[0]!.createdAt,
      cases: [evalCase], caseIndex: [evalCase], page: 1, total: 1,
    } },
  }));
  await page.route("**/eval-runs?*", (route) => {
    const params = new URL(route.request().url()).searchParams;
    const runPage = Number(params.get("page"));
    const size = Number(params.get("pageSize"));
    return route.fulfill({ json: {
      runs: runs.slice((runPage - 1) * size, runPage * size), total: runs.length, page: runPage,
    } });
  });
  await page.route("**/eval-runs/estimate", (route) => route.fulfill({ json: { estimate: {
    agentModel: "Demo", agentTurns: 1, balance: 100, caseCount: 1, credits: 1,
    evaluatorHealthCases: 0, judgeCallsMax: 0, judgeCallsMin: 0, judgeCredits: 0,
    judgeCreditsMin: 0, judgeRate: 1, modelRate: 1, sufficient: true,
    totalCredits: 1, unlimited: false,
  } } }));
  await page.route("**/eval-runs", (route) => {
    const run = {
      ...runs[0]!, id: "new-run", createdAt: "2026-01-23T00:00:00.000Z",
      cases: [{ ...runs[0]!.cases[0]!, id: "new-attempt" }],
    };
    runs.unshift(run);
    return route.fulfill({ status: 201, json: { run } });
  });

  await page.goto("/login");
  await page.getByLabel("Email address").fill("admin@demo.supportops.dev");
  await page.getByLabel("Password").fill("DemoAdmin123!");
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.goto("/testing/history-dataset");

  await page.getByRole("tab", { name: /Evaluation results/ }).click();
  const results = page.getByRole("tabpanel", { name: /Evaluation results/ });
  await expect(results.getByText("of 21 results", { exact: false })).toBeVisible();
  await expect(results.getByRole("cell", { name: "repeat-case", exact: true })).toHaveCount(10);
  await expect(results.getByRole("columnheader", { name: "Run time" })).toBeVisible();
  await page.getByLabel("Result status").selectOption("failed");
  await results.getByRole("button", { name: "Details for case repeat-case" }).click();
  await expect(results.getByText("Answer from attempt 20", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: /History/ }).click();
  const history = page.getByRole("tabpanel", { name: /History/ });
  await expect(history.getByRole("columnheader", { name: "Credits / Usage", exact: true })).toBeVisible();
  await history.getByRole("button", { name: "Next", exact: true }).click();
  await expect(history.getByText("Page 2 of 3")).toBeVisible();
  await expect(history.getByRole("columnheader", { name: "Details", exact: true })).toHaveCount(0);
  await expect(history.locator('[data-slot="badge"]')).toHaveCount(0);
  const historyRow = history.getByRole("row").nth(1);
  await expect(history.getByRole("columnheader", { name: /Destination delivery/ })).toBeVisible();
  await expect(history.getByRole("columnheader", { name: "SupportOps tracing", exact: true })).toBeVisible();
  await expect(historyRow.getByText("Not configured", { exact: true })).toBeVisible();
  await expect(historyRow.getByText("65.0s", { exact: true })).toBeVisible();
  await expect(historyRow.getByRole("cell").first()).toContainText(/\d{1,2}:\d{2}:\d{2} [AP]M/);
  await history.getByRole("button", { name: "About destination delivery" }).hover();
  await expect(page.getByRole("tooltip")).toContainText("accepted by your destination");
  const reportLink = historyRow.getByRole("link", { name: "Open report" });
  await expect(reportLink).toBeVisible();
  await expect(reportLink).toHaveText("");
  await expect(history.getByText("11–20 of 21 runs · 10 per page")).toBeVisible();
  await page.getByRole("tab", { name: /Evaluation results/ }).click();
  await expect(page.getByLabel("Result status")).toHaveValue("failed");
  await expect(results.getByText("Answer from attempt 20", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: /Cases/ }).click();
  await page.getByRole("button", { name: "Rerun 1 cases", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Start Run" }).click();
  await expect(page.getByRole("tab", { name: /Evaluation results/ })).toHaveAttribute("aria-selected", "true");
  await expect(results.getByText("of 22 results", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Result status")).toHaveValue("all");
});
