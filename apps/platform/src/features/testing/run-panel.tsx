import { nextSort, sortRows, type TableSort } from "@repo/shared/table-sort";
import { SortableHead } from "./sortable-head";
import type { EvalCase, EvalDeliveryStatus, EvalRun, EvalRunCaseStatus } from "@repo/api-client";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/sonner";
import {
  ExternalLinkIcon,
  RotateCcwIcon,
  CheckCircle2Icon,
  XCircleIcon,
  ClockIcon,
  AlertCircleIcon,
  ChevronDownIcon,
  DatabaseIcon,
  UsersIcon,
  CoinsIcon,
} from "lucide-react";
import { Input } from "@repo/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import ResourcePagination from "../settings/components/resource-pagination";
import { MessageText } from "./message-text";
import { metricLabels } from "./case-editor";
import { Fragment, useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@repo/ui/components/table";
import { formatTestingDate, runResults } from "./format";
import {
  useEstimateRunQuery,
  useRetryDeliveryMutation,
  useRunsQuery,
  useStartRunMutation,
} from "./hooks";

const caseLabels: Record<EvalRunCaseStatus, string> = {
  EVALUATED: "Evaluated",
  EXECUTION_ERROR: "Execution error",
  INVALID: "Invalid case",
  PENDING: "Waiting",
  RUNNING: "Running",
  UNEXECUTED: "Not executed",
  UNGRADED: "Not graded",
};

const deliveryLabels: Record<EvalDeliveryStatus, string> = {
  DELIVERED: "Delivered",
  ERROR: "Delivery failed",
  NOT_CONFIGURED: "Not configured",
  PENDING: "Delivery pending or retrying",
};

const runLabels = { ERROR: "Error", FINISHED: "Finished", QUEUED: "Queued", RUNNING: "Running" };

export function RunConfirmDialog({
  caseIds,
  datasetId,
  onClose,
  onStarted,
}: {
  caseIds: string[];
  datasetId: string;
  onClose: () => void;
  onStarted: () => void;
}) {
  const estimate = useEstimateRunQuery({ caseIds, datasetId });
  const start = useStartRunMutation();
  const data = estimate.data?.estimate;

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Run {caseIds.length} {caseIds.length === 1 ? "case" : "cases"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Each selected case runs once. AI Agent calls are charged like a live AI Turn; each
            successful Judge model call costs its own Credit.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {estimate.isError ? (
          <p className="text-sm text-destructive" role="alert">
            {estimate.error.message}
          </p>
        ) : null}
        {data ? (
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Estimated Credits</dt>
            <dd className="text-right font-medium">
              {data.unlimited
                ? "Unlimited Period (no charge)"
                : data.judgeCredits > 0
                  ? `${data.credits + data.judgeCreditsMin} to ${data.totalCredits}`
                  : `up to ${data.credits}`}
            </dd>
            <dt className="text-muted-foreground">AI Agent</dt>
            <dd className="text-right">
              {data.agentTurns} {data.agentTurns === 1 ? "AI Turn" : "AI Turns"} × {data.modelRate}{" "}
              · {data.agentModel}
            </dd>
            {data.judgeCallsMax > 0 ? (
              <>
                <dt className="text-muted-foreground">Judge</dt>
                <dd className="text-right">
                  {data.judgeCallsMin === data.judgeCallsMax
                    ? data.judgeCallsMax
                    : `${data.judgeCallsMin}–${data.judgeCallsMax}`}{" "}
                  calls × {data.judgeRate} Credit
                </dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Balance</dt>
            <dd className="text-right">{data.balance}</dd>
          </dl>
        ) : null}
        {data && data.judgeCallsMax > 0 && data.judgeCallsMin !== data.judgeCallsMax ? (
          <p className="text-xs text-muted-foreground">
            The Judge range is an estimate: how many Judge calls a metric makes depends on the
            answer it grades. Only successful Judge calls are charged.
          </p>
        ) : null}
        {data && data.evaluatorHealthCases > 0 ? (
          <p className="text-xs text-muted-foreground">
            Negative controls check that the evaluator can fail. They call no AI Agent and are never
            counted as regressions.
          </p>
        ) : null}
        {data && !data.sufficient ? (
          <p className="text-sm text-destructive" role="alert">
            Not enough Credits for every case. Work stops when Credits run out and the remaining
            cases are reported as not executed.
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            disabled={!data || start.isPending}
            onClick={() =>
              start.mutate(
                { caseIds, datasetId },
                {
                  onError: (error) => toast.error(error.message),
                  onSuccess: onStarted,
                },
              )
            }
          >
            Start Run
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeliveryLine({
  expiresAt,
  label,
  retryable,
  runId,
  status,
  target,
}: {
  expiresAt: string | null;
  label: string;
  retryable: boolean;
  runId: string;
  status: EvalDeliveryStatus;
  target: "CENTRAL" | "WORKSPACE";
}) {
  const retry = useRetryDeliveryMutation();
  const expired = status === "ERROR" && !retryable;
  return (
    <span className="flex flex-wrap items-center gap-2">
      {label} — {expired ? "Delivery failed and can no longer be retried" : deliveryLabels[status]}
      {expiresAt && status !== "DELIVERED"
        ? ` · kept until ${new Date(expiresAt).toLocaleDateString()}`
        : ""}
      {retryable ? (
        <Button
          disabled={retry.isPending}
          onClick={() =>
            retry.mutate({ id: runId, target }, { onError: (error) => toast.error(error.message) })
          }
          size="sm"
          className="h-8 text-xs"
          variant="outline"
        >
          Retry delivery
        </Button>
      ) : null}
    </span>
  );
}

function RunActions({
  run,
  rerunIds,
  running,
  onStarted,
}: {
  run: EvalRun;
  rerunIds: string[];
  running: boolean;
  onStarted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const active = run.status === "QUEUED" || run.status === "RUNNING";
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-sm">
          <Badge
            variant={run.status === "ERROR" ? "destructive" : "outline"}
            className={
              active
                ? "px-1.5 text-[11px] border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400"
                : run.status === "FINISHED"
                  ? "border-emerald-500/20 bg-emerald-500/10 px-1.5 text-[11px] text-emerald-700 dark:text-emerald-400"
                  : "px-1.5 text-[11px]"
            }
          >
            {active ? (
              <ClockIcon className="size-3" />
            ) : run.status === "ERROR" ? (
              <AlertCircleIcon className="size-3" />
            ) : (
              <CheckCircle2Icon className="size-3" />
            )}
            {runLabels[run.status]}
          </Badge>
          <span className="text-xs text-muted-foreground">
            <span className="block text-[11px]">Last run</span>
            <span className="block">{formatTestingDate(run.createdAt)}</span>
          </span>
        </span>
        <div className="flex items-center gap-2">
          {run.workspaceDelivery === "DELIVERED" || run.status === "FINISHED" ? (
            <a
              className="inline-flex h-8 items-center gap-1 rounded-md border bg-card px-3 text-xs hover:bg-muted"
              href={run.destinationDashboardUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open report <ExternalLinkIcon className="size-3.5" />
            </a>
          ) : null}
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={running || !rerunIds.length}
            onClick={() => setConfirming(true)}
            title="Rerun currently ready cases from this Evaluation"
          >
            <RotateCcwIcon className="size-3.5" />
            Rerun {rerunIds.length} cases
          </Button>
        </div>
      </div>
      {confirming && (
        <RunConfirmDialog
          caseIds={rerunIds}
          datasetId={run.datasetId}
          onClose={() => setConfirming(false)}
          onStarted={() => {
            setConfirming(false);
            onStarted();
          }}
        />
      )}
    </>
  );
}

function RunCard({ run, title }: { run: EvalRun; title: string }) {
  const results = runResults(run);
  const { progress } = run;
  const active = run.status === "QUEUED" || run.status === "RUNNING";
  const done =
    progress.evaluated +
    progress.executionErrors +
    progress.unexecuted +
    progress.ungraded +
    progress.invalid;
  return (
    <div className="grid gap-2">
      <div className="rounded-lg border bg-card px-4 py-3">
        <h2 className="mb-3 text-sm font-semibold">{title}</h2>
        <div className="overflow-x-auto">
          <div className="grid min-w-[1140px] grid-cols-[minmax(340px,2fr)_repeat(4,minmax(180px,1fr))] items-center divide-x">
            <div className="flex h-24 items-center gap-5 pr-5">
              <div
                className="relative size-24 shrink-0"
                role="progressbar"
                aria-label="Evaluation progress"
                aria-valuenow={done}
                aria-valuemin={0}
                aria-valuemax={Math.max(progress.total, 1)}
                aria-valuetext={`${done} of ${progress.total} cases completed`}
              >
                <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
                  <circle
                    cx="50"
                    cy="50"
                    r="43"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="10"
                    className="text-muted"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="43"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="10"
                    pathLength="100"
                    strokeDasharray={`${Math.min(100, (done / Math.max(progress.total, 1)) * 100)} 100`}
                    className="text-emerald-500"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-semibold tabular-nums">{done}</span>
                  <span className="text-[11px] text-muted-foreground">
                    of {progress.total} cases
                  </span>
                </div>
              </div>
              <dl className="grid flex-1 grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 text-xs">
                <dt className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  Passed
                </dt>
                <dd className="text-right font-medium tabular-nums">{results.passed}</dd>
                <dt className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-red-500" />
                  Failed
                </dt>
                <dd className="text-right font-medium tabular-nums">{results.failed}</dd>
                <dt className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-amber-500" />
                  Not evaluated
                </dt>
                <dd className="text-right font-medium tabular-nums">
                  {progress.executionErrors +
                    progress.invalid +
                    progress.ungraded +
                    progress.unexecuted}
                </dd>
              </dl>
            </div>
            <div className="flex h-24 items-center gap-3 px-4">
              <span className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
                <DatabaseIcon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Destination</p>
                <p
                  className={`mt-1 text-sm font-medium ${run.workspaceDelivery === "ERROR" ? "text-destructive" : run.workspaceDelivery === "DELIVERED" ? "text-emerald-600 dark:text-emerald-400" : ""}`}
                >
                  {
                    {
                      DELIVERED: "Delivered",
                      ERROR: "Delivery failed",
                      NOT_CONFIGURED: "Not configured",
                      PENDING: "Pending",
                    }[run.workspaceDelivery]
                  }
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {run.destinationBackend === "LANGFUSE" ? "Langfuse" : "Anvia Lens"}
                </p>
              </div>
            </div>
            <div className="flex h-24 items-center gap-3 px-4">
              <span className="rounded-lg bg-muted p-2">
                <UsersIcon className="size-4" />
              </span>
              <div>
                <p className="whitespace-nowrap text-xs text-muted-foreground">Evaluator usage</p>
                <p className="mt-1 whitespace-nowrap text-sm font-medium tabular-nums">
                  {run.agentCharged} AI Agent Credits
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {run.judgeCallsCharged} Judge calls
                </p>
              </div>
            </div>
            <div className="flex h-24 items-center gap-3 px-4">
              <span className="rounded-lg bg-primary/10 p-2 text-primary">
                <CoinsIcon className="size-4" />
              </span>
              <div>
                <p className="whitespace-nowrap text-xs text-muted-foreground">Credits charged</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{run.chargedCredits}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {run.judgeCharged} Judge Credits
                </p>
              </div>
            </div>
            <div className="flex h-24 items-center gap-3 pl-4">
              <span className="rounded-lg bg-primary/10 p-2 text-primary">
                <ClockIcon className="size-4" />
              </span>
              <div>
                <p className="whitespace-nowrap text-xs text-muted-foreground">Evaluation time</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {run.finishedAt &&
                  Number.isFinite(
                    new Date(run.finishedAt).getTime() - new Date(run.createdAt).getTime(),
                  )
                    ? `${Math.max(0, (new Date(run.finishedAt).getTime() - new Date(run.createdAt).getTime()) / 1000).toFixed(1)}s`
                    : active
                      ? "In progress"
                      : "—"}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">Total run duration</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      {progress.evaluatorChecks > 0 ? (
        <p className="text-sm text-muted-foreground">
          Evaluator checks: {progress.evaluatorHealthy} of {progress.evaluatorChecks} failed as they
          should. These are not AI Agent results.
        </p>
      ) : null}
      {run.creditExhausted ? (
        <p className="text-sm text-destructive">
          Credits ran out; remaining cases were not executed or not graded. Answers already
          generated are kept in the report.
        </p>
      ) : null}
      {run.error ? <p className="text-sm text-destructive">{run.error}</p> : null}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium">
          Evaluation details · Report delivery · Credits
        </summary>
        <div className="mt-2 grid gap-2">
          <p className="text-xs text-muted-foreground">
            {done} of {progress.total} cases done · {progress.evaluated} evaluated
            {progress.executionErrors > 0 ? ` · ${progress.executionErrors} execution errors` : ""}
            {progress.ungraded > 0 ? ` · ${progress.ungraded} not graded` : ""}
            {progress.invalid > 0 ? ` · ${progress.invalid} invalid` : ""}
            {progress.unexecuted > 0 ? ` · ${progress.unexecuted} not executed` : ""}
          </p>

          <p className="text-xs text-muted-foreground">
            Passed and failed count AI Agent results only. Execution errors and evaluator checks are
            counted separately.
          </p>

          <p>
            {run.chargedCredits} Credits charged · {run.agentCharged} AI Agent · {run.judgeCharged}{" "}
            Judge
          </p>
          <DeliveryLine
            expiresAt={run.workspaceExpiresAt}
            label="Your destination"
            retryable={run.workspaceRetryable}
            runId={run.id}
            status={run.workspaceDelivery}
            target="WORKSPACE"
          />
          <DeliveryLine
            expiresAt={run.centralExpiresAt}
            label="SupportOps tracing"
            retryable={run.centralRetryable}
            runId={run.id}
            status={run.centralDelivery}
            target="CENTRAL"
          />
          {run.workspaceDelivery === "DELIVERED" ? (
            <span>Accepted by your destination; it can take a moment to appear in the report.</span>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function RunCaseResults({
  run,
  search,
  filter,
  page,
  setPage,
}: {
  run: EvalRun;
  search: string;
  filter: string;
  page: number;
  setPage: (page: number) => void;
}) {
  const [sort, setSort] = useState<TableSort<"caseKey" | "message" | "category" | "expected" | "result" | "metric">>(null);
  function sortBy(column: NonNullable<typeof sort>["column"]) {
    setSort(nextSort(sort, column));
    setPage(1);
  }
  const [expanded, setExpanded] = useState<string[]>([]);
  const filtered = run.cases.filter(
    (item) =>
      `${item.caseKey} ${item.message}`.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "all" ||
        (filter === "failed"
          ? !item.evaluatorHealth && item.passed === false
          : filter === "passed"
            ? !item.evaluatorHealth && item.passed === true
            : item.status !== "EVALUATED" &&
              item.status !== "PENDING" &&
              item.status !== "RUNNING")),
  );
  const resultLabel = (item: EvalRun["cases"][number]) => {
    if (item.status !== "EVALUATED") return caseLabels[item.status];
    if (item.evaluatorHealth) return item.passed ? "Evaluator working" : "Evaluator check failed";
    return item.passed === true ? "Passed" : item.passed === false ? "Failed" : caseLabels[item.status];
  };
  const items = sortRows(filtered, sort, (item) => {
    if (sort?.column === "result") return resultLabel(item);
    if (sort?.column === "metric") return metricLabels[item.metric as keyof typeof metricLabels] ?? item.metric;
    return item[sort?.column ?? "caseKey"] || null;
  });
  const currentPage = Math.min(page, Math.max(1, Math.ceil(items.length / 10)));
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border bg-card">
      {!items.length && (
        <p className="p-4 text-sm text-muted-foreground">No results match this filter.</p>
      )}
      <div className="max-h-[65vh] overflow-auto [&_[data-slot=table-container]]:overflow-visible">
        <Table className="min-w-[980px] table-fixed text-xs">
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <SortableHead
                className="w-[18%] pl-4"
                column="caseKey"
                sort={sort}
                onSort={() => sortBy("caseKey")}
              >
                Case ID
              </SortableHead>
              <SortableHead
                className="w-[26%]"
                column="message"
                sort={sort}
                onSort={() => sortBy("message")}
              >
                Message
              </SortableHead>
              <SortableHead
                className="w-[12%]"
                column="category"
                sort={sort}
                onSort={() => sortBy("category")}
              >
                Category
              </SortableHead>
              <SortableHead
                className="w-[20%]"
                column="expected"
                sort={sort}
                onSort={() => sortBy("expected")}
              >
                Expected
              </SortableHead>
              <SortableHead
                className="w-36"
                column="result"
                sort={sort}
                onSort={() => sortBy("result")}
              >
                Result
              </SortableHead>
              <SortableHead
                className="w-40"
                column="metric"
                sort={sort}
                onSort={() => sortBy("metric")}
              >
                Scores / Evaluation
              </SortableHead>
              <TableHead className="w-16 pr-4">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.slice((currentPage - 1) * 10, currentPage * 10).map((item) => {
              const passed = item.status === "EVALUATED" && item.passed === true;
              const failed = item.status === "EVALUATED" && item.passed === false;
              const label = resultLabel(item);
              return (
                <Fragment key={item.id}>
                  <TableRow className="h-10">
                    <TableCell className="pl-4">
                      <span className="block truncate font-medium" title={item.caseKey}>
                        {item.caseKey}
                      </span>
                    </TableCell>
                    <TableCell>
                      <button
                        className="block w-full truncate text-left hover:underline"
                        aria-expanded={expanded.includes(item.id)}
                        aria-controls={`result-detail-${item.id}`}
                        onClick={() =>
                          setExpanded((now) =>
                            now.includes(item.id)
                              ? now.filter((id) => id !== item.id)
                              : [...now, item.id],
                          )
                        }
                      >
                        {item.message}
                      </button>
                    </TableCell>
                    <TableCell>
                      <span className="block truncate text-muted-foreground" title={item.category}>
                        {item.category || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="block truncate text-muted-foreground" title={item.expected}>
                        {item.expected || "See details"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          passed
                            ? "px-1.5 text-[11px] border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : failed || item.status === "EXECUTION_ERROR"
                              ? "px-1.5 text-[11px] border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
                              : "px-1.5 text-[11px] border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        }
                      >
                        {passed ? (
                          <CheckCircle2Icon className="size-3" />
                        ) : failed ? (
                          <XCircleIcon className="size-3" />
                        ) : (
                          <ClockIcon className="size-3" />
                        )}{" "}
                        {label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="block truncate">
                        {metricLabels[item.metric as keyof typeof metricLabels] ?? item.metric}
                      </span>
                      {item.result.checks?.some((check) => check.score !== null) && (
                        <span
                          className="block truncate text-[11px] text-muted-foreground"
                          title={item.result.checks
                            .filter((check) => check.score !== null)
                            .map((check) => `${check.name}: ${check.score}`)
                            .join(" · ")}
                        >
                          {item.result.checks
                            .filter((check) => check.score !== null)
                            .map((check) => `${check.name}: ${check.score}`)
                            .join(" · ")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        aria-label={`Details for case ${item.caseKey}`}
                        aria-expanded={expanded.includes(item.id)}
                        aria-controls={`result-detail-${item.id}`}
                        onClick={() =>
                          setExpanded((now) =>
                            now.includes(item.id)
                              ? now.filter((id) => id !== item.id)
                              : [...now, item.id],
                          )
                        }
                      >
                        <ChevronDownIcon
                          className={`size-3.5 transition-transform ${expanded.includes(item.id) ? "rotate-180" : ""}`}
                        />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expanded.includes(item.id) && (
                    <TableRow id={`result-detail-${item.id}`}>
                      <TableCell colSpan={7} className="whitespace-normal p-3">
                        <dl className="grid min-w-0 gap-3 rounded-lg bg-muted/30 p-3 sm:grid-cols-2">
                          <div>
                            <dt className="mb-1 text-xs font-semibold text-muted-foreground">
                              Customer Message
                            </dt>
                            <dd>
                              <MessageText text={item.message} />
                            </dd>
                          </div>
                          <div>
                            <dt className="mb-1 text-xs font-semibold text-muted-foreground">
                              Expected behaviour ·{" "}
                              {metricLabels[item.metric as keyof typeof metricLabels] ??
                                item.metric}
                            </dt>
                            <dd>
                              <MessageText
                                text={
                                  item.expected ||
                                  (item.metadata.decisions?.join(" / ") ??
                                    item.metadata.language ??
                                    item.metadata.tool ??
                                    item.metadata.canaries?.join("; ") ??
                                    item.metadata.expectedPassages
                                      ?.map((p) => `${p.source}: ${p.fragment}`)
                                      .join("; ") ??
                                    "Checked using this evaluation type and the dataset criteria.")
                                }
                              />
                            </dd>
                          </div>
                          <div>
                            <dt className="mb-1 text-xs font-semibold text-muted-foreground">
                              AI Agent response
                              {item.result.decision ? ` · ${item.result.decision}` : ""}
                            </dt>
                            <dd>
                              <MessageText
                                text={
                                  item.result.answer ??
                                  (item.evaluatorHealth
                                    ? "Evaluator check; no AI Agent response is expected."
                                    : item.metric === "retrieval" &&
                                        item.metadata.retrievalTarget === "retriever"
                                      ? "Knowledge retrieval only; no AI Agent response is expected."
                                      : item.status === "PENDING" || item.status === "RUNNING"
                                        ? "Waiting for the response…"
                                        : "Response is unavailable for this run. Older runs may only have an external report.")
                                }
                              />
                            </dd>
                          </div>
                          {item.error && (
                            <div>
                              <dt className="text-xs font-semibold text-destructive">
                                Evaluation problem
                              </dt>
                              <dd>
                                <MessageText text={item.error} />
                              </dd>
                            </div>
                          )}
                          {item.result.checks?.map((check, index) => (
                            <div key={`${check.name}-${index}`}>
                              <dt className="text-xs font-semibold text-muted-foreground">
                                {check.name} · {check.outcome}
                                {check.score !== null ? ` · score: ${check.score}` : ""}
                              </dt>
                              <dd>
                                <MessageText
                                  text={
                                    check.explanation ||
                                    "No additional explanation was provided by the evaluator."
                                  }
                                />
                              </dd>
                            </div>
                          ))}
                          {Array.isArray(item.limitations) && item.limitations.length > 0 && (
                            <div>
                              <dt className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                                Evaluation limitations
                              </dt>
                              <dd>
                                <MessageText text={item.limitations.map(String).join("\n")} />
                              </dd>
                            </div>
                          )}
                        </dl>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="border-t px-4 py-2 text-xs text-muted-foreground">
        {items.length ? (currentPage - 1) * 10 + 1 : 0}–{Math.min(currentPage * 10, items.length)}{" "}
        of {items.length} results
      </div>
      <div className="[&_[data-slot=pagination]]:py-2 [&_button]:h-7 [&_button]:text-xs [&_p]:text-xs">
        <ResourcePagination
          page={currentPage}
          pageCount={Math.ceil(items.length / 10)}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}

export function RunsPanel({
  datasetId,
  cases,
  children,
  header,
  datasetActions,
  caseToolbar,
}: {
  header: ReactNode;
  datasetActions: ReactNode;
  caseToolbar: ReactNode;
  datasetId: string;
  children: ReactNode;
  cases: Pick<EvalCase, "id" | "caseKey" | "complete">[];
}) {
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState("cases");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [resultPage, setResultPage] = useState(1);
  const latest = useRunsQuery(datasetId);
  const query = useRunsQuery(datasetId, page);
  const runs = query.data?.runs ?? [];
  const running =
    latest.data?.runs.some((run) => run.status === "QUEUED" || run.status === "RUNNING") ?? false;
  function showLatest() {
    setPage(1);
    setResultPage(1);
    setSearch("");
    setFilter("all");
    document.getElementById("testing-evaluations")?.focus();
    document
      .getElementById("testing-evaluations")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return (
    <section
      id="testing-evaluations"
      tabIndex={-1}
      aria-label="Evaluations"
      aria-busy={query.isFetching}
      className="grid min-w-0 scroll-mt-5 gap-3 outline-none"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {header}
        <div className="flex flex-wrap items-center gap-2">
          {runs.map((run) => (
            <RunActions
              key={run.id}
              run={run}
              running={running}
              onStarted={showLatest}
              rerunIds={cases
                .filter(
                  (item) => item.complete && run.cases.some((ran) => ran.sourceCaseId === item.id),
                )
                .slice(0, 100)
                .map((item) => item.id)}
            />
          ))}
          {datasetActions}
        </div>
      </div>
      {page > 1 && (
        <Button
          size="sm"
          className="h-8 justify-self-end text-xs"
          variant="outline"
          onClick={showLatest}
        >
          {running ? "View running evaluation" : "View latest evaluation"}
        </Button>
      )}
      <div className="min-w-0">
        {query.isPending && (
          <p role="status" className="p-4 text-sm text-muted-foreground">
            Loading evaluations…
          </p>
        )}
        {query.isError && (
          <div className="flex items-center justify-between p-4 text-sm text-destructive">
            Unable to load evaluations.
            <Button
              size="sm"
              className="h-8 text-xs"
              variant="outline"
              onClick={() => void query.refetch()}
            >
              Retry
            </Button>
          </div>
        )}
        {!query.isPending && !query.isError && !runs.length && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No evaluations yet. Select ready cases below and start your first run.
          </p>
        )}
        {runs.map((run) => (
          <RunCard
            key={run.id}
            run={run}
            title={page === 1 ? "Latest evaluation" : "Evaluation history"}
          />
        ))}
        <div className="[&_[data-slot=pagination]]:py-2 [&_button]:h-7 [&_button]:text-xs [&_p]:text-xs">
          <ResourcePagination
            page={query.data?.page ?? page}
            pageCount={query.data?.total ?? 0}
            onPageChange={(page) => {
              setPage(page);
              setResultPage(1);
              setSearch("");
              setFilter("all");
            }}
          />
        </div>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="min-w-0 gap-0">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-2">
          <TabsList variant="line" className="shrink-0">
            <TabsTrigger value="cases">
              Cases{" "}
              <Badge variant="secondary" className="px-1.5 text-[11px]">
                {cases.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="results">
              Evaluation results{" "}
              <Badge variant="secondary" className="px-1.5 text-[11px]">
                {runs[0]?.cases.length ?? 0}
              </Badge>
            </TabsTrigger>
          </TabsList>
          {tab === "cases" ? (
            caseToolbar
          ) : (
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
              <Input
                aria-label="Search evaluation results"
                className="h-8 min-w-40 flex-1 text-xs sm:max-w-sm"
                placeholder="Search results…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setResultPage(1);
                }}
              />
              <NativeSelect
                size="sm"
                className="text-xs"
                aria-label="Result status"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setResultPage(1);
                }}
              >
                <NativeSelectOption value="all">All results</NativeSelectOption>
                <NativeSelectOption value="failed">Failed</NativeSelectOption>
                <NativeSelectOption value="passed">Passed</NativeSelectOption>
                <NativeSelectOption value="errors">Not evaluated</NativeSelectOption>
              </NativeSelect>
            </div>
          )}
        </div>

        <TabsContent value="cases" forceMount className="grid gap-2 data-[state=inactive]:hidden">
          {children}
        </TabsContent>
        <TabsContent value="results" forceMount className="data-[state=inactive]:hidden">
          {query.isPending ? (
            <p role="status" className="p-4 text-sm text-muted-foreground">
              Loading evaluation results…
            </p>
          ) : query.isError ? (
            <div className="flex items-center justify-between rounded-lg border p-4 text-sm text-destructive">
              Unable to load evaluation results.
              <Button
                size="sm"
                className="h-8 text-xs"
                variant="outline"
                onClick={() => void query.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : !runs.length ? (
            <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
              No evaluation results yet. Select ready cases in Cases to start a run.
            </p>
          ) : (
            runs.map((run) => (
              <RunCaseResults
                key={run.id}
                run={run}
                search={search}
                filter={filter}
                page={resultPage}
                setPage={setResultPage}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
