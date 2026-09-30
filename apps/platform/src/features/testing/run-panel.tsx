import type { EvalDeliveryStatus, EvalRun, EvalRunCaseStatus } from "@repo/api-client";
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
import { ExternalLinkIcon } from "lucide-react";
import {
  useEstimateRunQuery,
  useRetryDeliveryMutation,
  useRunsQuery,
  useStartRunMutation,
} from "./hooks";

const caseLabels: Record<EvalRunCaseStatus, string> = {
  EVALUATED: "Evaluated",
  EXECUTION_ERROR: "Execution error",
  PENDING: "Waiting",
  RUNNING: "Running",
  UNEXECUTED: "Not executed",
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
            Each selected case runs once against your AI Agent and is charged like a live AI Turn.
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
              {data.unlimited ? "Unlimited Period (no charge)" : `up to ${data.credits}`}
            </dd>
            <dt className="text-muted-foreground">Rate</dt>
            <dd className="text-right">
              {data.modelRate} per AI Turn · {data.agentModel}
            </dd>
            <dt className="text-muted-foreground">Balance</dt>
            <dd className="text-right">{data.balance}</dd>
          </dl>
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

function RunCard({ run }: { run: EvalRun }) {
  const { progress } = run;
  const active = run.status === "QUEUED" || run.status === "RUNNING";
  const done = progress.evaluated + progress.executionErrors + progress.unexecuted;
  return (
    <div className="grid gap-3 border-b p-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm">
          <Badge variant={run.status === "ERROR" ? "destructive" : "secondary"}>
            {runLabels[run.status]}
          </Badge>
          <span className="text-muted-foreground">{new Date(run.createdAt).toLocaleString()}</span>
        </span>
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
      <p aria-live="polite" className="text-sm">
        {done} of {progress.total} cases done · {progress.evaluated} evaluated
        {progress.executionErrors > 0 ? ` · ${progress.executionErrors} execution errors` : ""}
        {progress.unexecuted > 0 ? ` · ${progress.unexecuted} not executed` : ""}
        {active ? "" : ` · ${run.chargedCredits} Credits charged`}
      </p>
      {run.creditExhausted ? (
        <p className="text-sm text-destructive">Credits ran out; remaining cases were not executed.</p>
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
              <span>{item.caseKey}</span>
              <span className={item.status === "EXECUTION_ERROR" ? "text-destructive" : "text-muted-foreground"}>
                {caseLabels[item.status]}
                {item.error ? ` — ${item.error}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function RunsPanel({ datasetId }: { datasetId: string }) {
  const runs = useRunsQuery(datasetId).data?.runs ?? [];
  if (runs.length === 0) return null;
  return (
    <section aria-label="Runs" className="grid gap-2">
      <h2 className="text-lg font-semibold">Runs</h2>
      <p className="text-sm text-muted-foreground">
        Answers, scores and traces are in your evaluation destination.
      </p>
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {runs.map((run) => (
          <RunCard key={run.id} run={run} />
        ))}
      </div>
    </section>
  );
}
