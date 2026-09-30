import type { EvalDatasetSummary } from "@repo/api-client";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { FlaskConicalIcon, PlusIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { PlatformAppShell } from "../app-shell";
import ResourceListState from "../settings/components/resource-list-state";
import { CreateDatasetDrawer } from "./create-dataset-drawer";
import { DestinationForm } from "./destination-form";
import { formatTestingDate, runResults } from "./format";
import { useDatasetsQuery, useRunsQuery } from "./hooks";

function DatasetRow({ dataset }: { dataset: EvalDatasetSummary }) {
  // ponytail: one existing Run request per dataset; batch summaries if dataset volume grows.
  const query = useRunsQuery(dataset.id);
  const lastRun = query.data?.runs[0];
  const results = lastRun ? runResults(lastRun) : null;
  return (
    <TableRow>
      <TableCell className="max-w-72 py-3">
        <Link
          className="block truncate font-medium hover:underline"
          params={{ datasetId: dataset.id }}
          to="/testing/$datasetId"
        >
          {dataset.name}
        </Link>
        {dataset.incompleteCount > 0 && (
          <Badge className="mt-1" variant="outline">
            {dataset.incompleteCount} need criteria
          </Badge>
        )}
      </TableCell>
      <TableCell className="tabular-nums">{dataset.caseCount}</TableCell>
      <TableCell>
        {lastRun ? (
          <div className="grid gap-1">
            <div className="flex items-center gap-2">
              <Badge variant={lastRun.status === "ERROR" ? "destructive" : "secondary"}>
                {lastRun.status === "FINISHED"
                  ? "Finished"
                  : lastRun.status === "RUNNING"
                    ? "Running"
                    : lastRun.status === "QUEUED"
                      ? "Queued"
                      : "Error"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {results?.passed} passed · {results?.failed} failed
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {formatTestingDate(lastRun.createdAt)}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {query.isPending ? "Loading…" : query.isError ? "Unavailable" : "No runs yet"}
          </span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatTestingDate(dataset.updatedAt)}
      </TableCell>
      <TableCell className="text-right">
        <Button size="sm" variant="ghost" asChild>
          <Link params={{ datasetId: dataset.id }} to="/testing/$datasetId">
            Open
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}

const TestingView = () => {
  const datasets = useDatasetsQuery();
  const [creating, setCreating] = useState(false);
  const items = datasets.data?.datasets ?? [];
  return (
    <PlatformAppShell fullWidth>
      <section className="grid min-w-0 gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Testing</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Evaluate your AI Agent with repeatable Customer Messages.
            </p>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <PlusIcon className="size-4" />
            Create Dataset
          </Button>
        </div>
        <div className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Datasets</h2>
            {datasets.data && (
              <span className="text-xs text-muted-foreground">
                {items.length} datasets ·{" "}
                {items.reduce((total, dataset) => total + dataset.caseCount, 0)} cases
              </span>
            )}
          </div>
          <ResourceListState
            isPending={datasets.isPending}
            isError={datasets.isError}
            errorLabel="Unable to load Eval Datasets."
            onRetry={() => void datasets.refetch()}
            isEmpty={items.length === 0}
            emptyIcon={<FlaskConicalIcon className="size-5 text-muted-foreground" />}
            emptyTitle="Create your first Eval Dataset"
            emptyDescription="Paste Customer Messages, select recent Sessions, or import a CSV to start evaluating."
            emptyAction={
              <Button size="sm" onClick={() => setCreating(true)}>
                Create Dataset
              </Button>
            }
          />
          {items.length > 0 && (
            <Table aria-label="Eval Datasets">
              <TableHeader>
                <TableRow>
                  <TableHead>Dataset</TableHead>
                  <TableHead>Cases</TableHead>
                  <TableHead>Last Evaluation</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((dataset) => (
                  <DatasetRow key={dataset.id} dataset={dataset} />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <DestinationForm />
      </section>
      <CreateDatasetDrawer open={creating} onOpenChange={setCreating} />
    </PlatformAppShell>
  );
};

export default TestingView;
