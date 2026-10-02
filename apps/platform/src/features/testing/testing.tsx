import { nextSort, sortRows, type TableSort } from "@repo/shared/table-sort";
import { SortableHead } from "./sortable-head";
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
import { Input } from "@repo/ui/components/input";
import ResourcePagination from "../settings/components/resource-pagination";
import { useState } from "react";
import { PlatformAppShell } from "../app-shell";
import ResourceListState from "../settings/components/resource-list-state";
import { CreateDatasetDrawer } from "./create-dataset-drawer";
import { DestinationForm } from "./destination-form";
import { formatTestingDate, runResults } from "./format";
import { useDatasetsQuery, useRunsQuery } from "./hooks";

import { DeleteDatasetDialog } from "./delete-dataset-dialog";

function DatasetRow({ dataset, onDelete }: { dataset: EvalDatasetSummary; onDelete: () => void }) {
  // ponytail: one existing Run request per dataset; batch summaries if dataset volume grows.
  const query = useRunsQuery(dataset.id);
  const lastRun = query.data?.runs[0];
  const results = lastRun ? runResults(lastRun) : null;
  return (
    <TableRow>
      <TableCell className="max-w-72 py-3">
        <Link
          className="block break-words font-medium hover:underline"
          params={{ datasetId: dataset.id }}
          to="/testing/$datasetId"
        >
          {dataset.name}
        </Link>
        {dataset.incompleteCount > 0 && (
          <Badge className="mt-1" variant="outline">
            {dataset.incompleteCount} need setup
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
                <span className="text-emerald-700 dark:text-emerald-400">
                  {results?.passed} passed
                </span>{" "}
                ·{" "}
                <span className={results?.failed ? "text-red-700 dark:text-red-400" : ""}>
                  {results?.failed} failed
                </span>
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
        <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
          Delete
        </Button>
      </TableCell>
    </TableRow>
  );
}

const TestingView = () => {
  const datasets = useDatasetsQuery();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<EvalDatasetSummary | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] =
    useState<TableSort<"name" | "caseCount" | "lastRunAt" | "updatedAt">>(null);
  function sortBy(column: NonNullable<typeof sort>["column"]) {
    setSort(nextSort(sort, column));
    setPage(1);
  }
  const items = datasets.data?.datasets ?? [];
  const filtered = sortRows(
    items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())),
    sort,
    (item) => {
      if (sort?.column === "lastRunAt")
        return item.lastRunAt ? new Date(item.lastRunAt).getTime() : null;
      if (sort?.column === "updatedAt") return new Date(item.updatedAt).getTime();
      return sort?.column === "caseCount" ? item.caseCount : item.name;
    },
  );
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 10)));
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
          {!!items.length && (
            <div className="border-b p-3">
              <Input
                aria-label="Search datasets"
                placeholder="Search datasets…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          )}
          <ResourceListState
            isPending={datasets.isPending}
            isError={datasets.isError}
            errorLabel="Unable to load Eval Datasets."
            onRetry={() => void datasets.refetch()}
            isEmpty={items.length === 0}
            emptyIcon={<FlaskConicalIcon className="size-5 text-muted-foreground" />}
            emptyTitle="Create your first Eval Dataset"
            emptyDescription="Paste Customer Messages, select Customer Messages, or import CSV / Excel to start evaluating."
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
                  <SortableHead column="name" sort={sort} onSort={() => sortBy("name")}>
                    Dataset
                  </SortableHead>
                  <SortableHead column="caseCount" sort={sort} onSort={() => sortBy("caseCount")}>
                    Cases
                  </SortableHead>
                  <SortableHead column="lastRunAt" sort={sort} onSort={() => sortBy("lastRunAt")}>
                    Last Evaluation
                  </SortableHead>
                  <SortableHead column="updatedAt" sort={sort} onSort={() => sortBy("updatedAt")}>
                    Updated
                  </SortableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice((currentPage - 1) * 10, currentPage * 10).map((dataset) => (
                  <DatasetRow
                    key={dataset.id}
                    dataset={dataset}
                    onDelete={() => setDeleting(dataset)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
          {!!items.length && !filtered.length && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No datasets match your search.
            </p>
          )}
          <ResourcePagination
            page={currentPage}
            pageCount={Math.ceil(filtered.length / 10)}
            onPageChange={setPage}
          />
        </div>
        <DestinationForm />
      </section>
      <CreateDatasetDrawer open={creating} onOpenChange={setCreating} />
      {deleting && <DeleteDatasetDialog dataset={deleting} onClose={() => setDeleting(null)} />}
    </PlatformAppShell>
  );
};

export default TestingView;
