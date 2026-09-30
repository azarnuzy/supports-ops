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
import { ExternalLinkIcon, RotateCcwIcon } from "lucide-react";
import { useState } from "react";
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
          variant="outline"
        >
          Retry delivery
        </Button>
      ) : null}
    </span>
  );
}

function RunCard({
  run,
  rerunIds,
  running,
}: {
  run: EvalRun;
  rerunIds: string[];
  running: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
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
    <div className="grid gap-3 border-b p-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm">
          <Badge variant={run.status === "ERROR" ? "destructive" : "secondary"}>
            {runLabels[run.status]}
          </Badge>
          <span className="text-muted-foreground">{formatTestingDate(run.createdAt)}</span>
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={running || !rerunIds.length}
            onClick={() => setConfirming(true)}
            title="Rerun currently ready cases from this Evaluation"
          >
            <RotateCcwIcon className="size-3.5" />
            Rerun {rerunIds.length} cases
          </Button>
          {run.workspaceDelivery === "DELIVERED" || run.status === "FINISHED" ? (
            <a
              className="inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
              href={run.destinationDashboardUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open report <ExternalLinkIcon className="size-3.5" />
            </a>
          ) : null}
        </div>
      </div>
      <p className="text-sm font-medium">
        {results.passed} passed · {results.failed} failed{" "}
        <span className="font-normal text-muted-foreground">· excludes evaluator checks</span>
      </p>
      <p aria-live="polite" className="text-xs text-muted-foreground">
        {done} of {progress.total} cases done · {progress.evaluated} evaluated
        {progress.executionErrors > 0 ? ` · ${progress.executionErrors} execution errors` : ""}
        {progress.ungraded > 0 ? ` · ${progress.ungraded} not graded` : ""}
        {progress.invalid > 0 ? ` · ${progress.invalid} invalid` : ""}
        {progress.unexecuted > 0 ? ` · ${progress.unexecuted} not executed` : ""}
        {active
          ? ""
          : ` · ${run.chargedCredits} Credits charged (${run.agentCharged} AI Agent, ${run.judgeCharged} Judge)`}
      </p>
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
      <div className="grid gap-1 text-xs text-muted-foreground">
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
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Case progress</summary>
        <ul className="mt-2 grid gap-1">
          {run.cases.map((item) => (
            <li className="flex flex-wrap justify-between gap-2" key={item.id}>
              <span>
                {item.caseKey}
                {item.evaluatorHealth ? " (evaluator check)" : ""}
              </span>
              <span
                className={
                  item.status === "EXECUTION_ERROR" ? "text-destructive" : "text-muted-foreground"
                }
              >
                {item.status === "EVALUATED" && !item.evaluatorHealth && item.passed !== null
                  ? item.passed
                    ? "Passed"
                    : "Failed"
                  : caseLabels[item.status]}
                {item.error ? ` — ${item.error}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </details>
      {confirming && (
        <RunConfirmDialog
          caseIds={rerunIds}
          datasetId={run.datasetId}
          onClose={() => setConfirming(false)}
          onStarted={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

export function RunsPanel({ datasetId, cases }: { datasetId: string; cases: EvalCase[] }) {
  const query = useRunsQuery(datasetId);
  const runs = query.data?.runs ?? [];
  const running = runs.some((run) => run.status === "QUEUED" || run.status === "RUNNING");
  return (
    <section aria-label="Runs" className="grid gap-2">
      <h2 className="text-sm font-semibold">Evaluations</h2>
      <p className="text-sm text-muted-foreground">
        Answers, scores and traces are in your evaluation destination.
      </p>
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {query.isPending && (
          <p className="p-4 text-sm text-muted-foreground">Loading Evaluations…</p>
        )}
        {query.isError && (
          <div className="flex items-center justify-between p-4 text-sm text-destructive">
            Unable to load Evaluations.
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </div>
        )}
        {!query.isPending && !query.isError && !runs.length && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No Evaluations yet. Select ready cases and start your first run.
          </p>
        )}
        {runs.map((run) => (
          <RunCard
            key={run.id}
            run={run}
            running={running}
            rerunIds={cases
              .filter(
                (item) => item.complete && run.cases.some((ran) => ran.caseKey === item.caseKey),
              )
              .slice(0, 100)
              .map((item) => item.id)}
          />
        ))}
      </div>
    </section>
  );
}
