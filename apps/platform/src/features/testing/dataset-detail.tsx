import { nextSort, type TableSort } from "@repo/shared/table-sort";
import { SortableHead } from "./sortable-head";
import type { EvalCaseFilters } from "@repo/api-client";
import type { EvalCase, EvalCaseInput } from "@repo/api-client";
import { Badge } from "@repo/ui/components/badge";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@repo/ui/components/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@repo/ui/components/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@repo/ui/components/sheet";
import ResourcePagination from "../settings/components/resource-pagination";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import { MessageText } from "./message-text";
import { formatTestingDate } from "./format";
import { Button } from "@repo/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { Textarea } from "@repo/ui/components/textarea";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
  ChevronDownIcon,
  PencilIcon,
  MoreVerticalIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
} from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { PlatformAppShell } from "../app-shell";
import ResourceListState from "../settings/components/resource-list-state";
import { CaseEditor, metricLabels } from "./case-editor";
import {
  useCreateCaseMutation,
  useDatasetQuery,
  useDeleteCaseMutation,
  useUpdateCaseMutation,
  useUpdateDatasetMutation,
  useUpdateExpectationsMutation,
} from "./hooks";
import { nextCaseKeys } from "./paste";
import { RunConfirmDialog, RunsPanel } from "./run-panel";

const maxCasesPerRun = 100;

const onError = (error: unknown) =>
  toast.error(error instanceof Error ? error.message : "Something went wrong.");

export default function DatasetDetailView({ datasetId }: { datasetId: string }) {
  const [filters, setFilters] = useState<EvalCaseFilters>({ page: 1, search: "", status: "all" });
  const sort: TableSort<NonNullable<EvalCaseFilters["sortBy"]>> = filters.sortBy
    ? { column: filters.sortBy, direction: filters.sortDirection ?? "asc" }
    : null;
  function sortBy(column: NonNullable<EvalCaseFilters["sortBy"]>) {
    const next = nextSort(sort, column);
    setFilters({ ...filters, page: 1, sortBy: next?.column, sortDirection: next?.direction });
  }
  const query = useDatasetQuery(datasetId, filters);
  const updateExpectations = useUpdateExpectationsMutation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [bulkEditing, setBulkEditing] = useState(false);
  const updateDataset = useUpdateDatasetMutation();
  const createCase = useCreateCaseMutation();
  const updateCase = useUpdateCaseMutation();
  const deleteCase = useDeleteCaseMutation();
  const dataset = query.data?.dataset;
  const [name, setName] = useState("");
  const [criteria, setCriteria] = useState("");
  // `null` = closed, `"new"` = adding, otherwise the case being edited.
  const [editing, setEditing] = useState<EvalCase | "new" | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [runVersion, setRunVersion] = useState(0);

  useEffect(() => {
    if (dataset) {
      setName(dataset.name);
      setCriteria(dataset.criteria);
    }
  }, [dataset?.name, dataset?.criteria]);

  const cases = dataset?.cases ?? [];
  const caseIndex = dataset?.caseIndex ?? [];
  const selection = caseIndex.filter((c) => selected.includes(c.id));
  const chosen = selection.filter((c) => c.complete).map((c) => c.id);
  const pageIds = cases.map((c) => c.id);
  const pageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const toggle = (id: string) =>
    setSelected((now) =>
      now.includes(id)
        ? now.filter((x) => x !== id)
        : now.length < maxCasesPerRun
          ? [...now, id]
          : now,
    );

  function save(input: EvalCaseInput) {
    const done = { onError, onSuccess: () => setEditing(null) };
    if (editing && editing !== "new")
      updateCase.mutate({ caseId: editing.id, datasetId, input }, done);
    else createCase.mutate({ datasetId, input }, done);
  }

  return (
    <PlatformAppShell fullWidth>
      <section className="grid min-w-0 gap-4">
        {!dataset && (
          <div className="flex items-center gap-2">
            <Button asChild size="icon" variant="ghost" className="size-8 shrink-0">
              <Link to="/testing" aria-label="Back to Testing">
                <ArrowLeftIcon className="size-4" />
              </Link>
            </Button>
            <h1 className="text-2xl font-semibold tracking-tight">Dataset</h1>
          </div>
        )}

        <ResourceListState
          isPending={query.isPending}
          isError={query.isError}
          errorLabel="Unable to load this Eval Dataset."
          onRetry={() => void query.refetch()}
          isEmpty={false}
          emptyIcon={null}
          emptyTitle=""
          emptyDescription=""
        />

        {dataset ? (
          <>
            <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
              <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
                <SheetHeader>
                  <SheetTitle>Edit dataset</SheetTitle>
                  <SheetDescription>Update the name and default grading criteria.</SheetDescription>
                </SheetHeader>
                <form
                  className="grid gap-4 p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    updateDataset.mutate(
                      { id: datasetId, input: { criteria, name } },
                      {
                        onError,
                        onSuccess: () => {
                          toast.success("Dataset saved.");
                          setSettingsOpen(false);
                        },
                      },
                    );
                  }}
                >
                  <Field className="gap-1.5">
                    <FieldLabel htmlFor="detail-name">Dataset name</FieldLabel>
                    <Input
                      placeholder="e.g. Refund policy checks"
                      id="detail-name"
                      maxLength={120}
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <FieldDescription className="text-xs">
                      A short name for this repeatable collection of Eval Cases.
                    </FieldDescription>
                  </Field>
                  <Field className="gap-1.5">
                    <FieldLabel htmlFor="detail-criteria">Default grading criteria</FieldLabel>
                    <Textarea
                      placeholder="e.g. Use published policy and explain the next step clearly."
                      id="detail-criteria"
                      maxLength={4000}
                      rows={3}
                      value={criteria}
                      onChange={(e) => setCriteria(e.target.value)}
                    />
                    <FieldDescription className="text-xs">
                      Default rubric for judged metrics. Each case defines its own evaluation type
                      and expectations.
                    </FieldDescription>
                  </Field>
                  <Button
                    className="h-8 justify-self-start text-xs"
                    disabled={updateDataset.isPending || !name.trim()}
                    type="submit"
                  >
                    Save dataset
                  </Button>
                </form>
              </SheetContent>
            </Sheet>
            <RunsPanel
              key={runVersion}
              initialTab={runVersion > 0 ? "results" : "cases"}
              datasetId={datasetId}
              cases={caseIndex}
              header={
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Button asChild size="icon" variant="ghost" className="size-8 shrink-0">
                      <Link to="/testing" aria-label="Back to Testing">
                        <ArrowLeftIcon className="size-4" />
                      </Link>
                    </Button>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h1 className="break-words text-2xl font-semibold tracking-tight">
                        {dataset.name}
                      </h1>
                      <Badge variant="secondary" className="text-xs">
                        {caseIndex.length} cases
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-1 pl-10 text-xs text-muted-foreground">
                    Updated {formatTestingDate(dataset.updatedAt)}
                  </p>
                </div>
              }
              datasetActions={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8 shrink-0"
                      aria-label="Dataset actions"
                    >
                      <MoreVerticalIcon className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                      <PencilIcon className="size-3.5" /> Edit dataset
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
              caseToolbar={
                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
                  <Input
                    className="h-8 min-w-48 flex-1 text-xs sm:max-w-sm"
                    aria-label="Search cases"
                    placeholder="Search messages, case IDs or categories…"
                    maxLength={200}
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
                  />
                  <NativeSelect
                    size="sm"
                    className="text-xs"
                    aria-label="Case readiness"
                    value={filters.status}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        status: e.target.value as typeof filters.status,
                        page: 1,
                      })
                    }
                  >
                    <NativeSelectOption value="all">All cases</NativeSelectOption>
                    <NativeSelectOption value="ready">Ready to run</NativeSelectOption>
                    <NativeSelectOption value="draft">Needs setup</NativeSelectOption>
                  </NativeSelect>
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    variant="outline"
                    onClick={() => setEditing("new")}
                  >
                    <PlusIcon className="size-4" /> Add case
                  </Button>
                </div>
              }
            >
              <div
                aria-busy={query.isFetching}
                className="overflow-hidden rounded-lg border bg-card"
              >
                <div className="flex flex-wrap items-center gap-3 border-b px-3 py-2">
                  <div>
                    <p className="text-xs font-medium">
                      {selection.length} selected
                      {selection.length > 0 ? ` · ${chosen.length} ready` : ""}{" "}
                      <span className="hidden font-normal text-muted-foreground sm:inline">
                        · max 100 across pages
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className={`h-8 text-xs ${!selection.length ? "hidden" : ""}`}
                      variant="ghost"
                      disabled={!selection.length}
                      onClick={() => setSelected([])}
                    >
                      Clear selection
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      variant="outline"
                      disabled={!selection.length}
                      onClick={() => setBulkEditing(true)}
                    >
                      Set expectations
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      disabled={!chosen.length}
                      onClick={() => setConfirming(true)}
                    >
                      <PlayIcon className="size-4" /> Run selected ({chosen.length})
                    </Button>
                  </div>
                </div>
                {query.isFetching && (
                  <p role="status" className="border-b px-4 py-2 text-xs text-muted-foreground">
                    Updating cases…
                  </p>
                )}
                {cases.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    {caseIndex.length
                      ? "No cases match your search or filter."
                      : "No cases yet. Add the first Customer Message to check."}
                  </p>
                ) : null}
                <div className="max-h-[65vh] overflow-auto [&_[data-slot=table-container]]:overflow-visible">
                  <Table className="min-w-[960px] table-fixed text-xs">
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <TableHead className="w-10 pl-4">
                          <Checkbox
                            aria-label="Select cases on this page"
                            checked={
                              pageSelected
                                ? true
                                : pageIds.some((id) => selected.includes(id))
                                  ? "indeterminate"
                                  : false
                            }
                            disabled={
                              !pageIds.length ||
                              query.isPlaceholderData ||
                              (!pageSelected && selection.length >= maxCasesPerRun)
                            }
                            onCheckedChange={() =>
                              setSelected((now) =>
                                pageSelected
                                  ? now.filter((id) => !pageIds.includes(id))
                                  : [...new Set([...now, ...pageIds])].slice(0, maxCasesPerRun),
                              )
                            }
                          />
                        </TableHead>
                        <SortableHead
                          className="w-[18%]"
                          column="caseKey"
                          sort={sort}
                          onSort={() => sortBy("caseKey")}
                        >
                          Case ID
                        </SortableHead>
                        <SortableHead
                          className="w-[32%]"
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
                          className="w-[15%]"
                          column="metric"
                          sort={sort}
                          onSort={() => sortBy("metric")}
                        >
                          Evaluation
                        </SortableHead>
                        <SortableHead
                          className="w-32"
                          column="complete"
                          sort={sort}
                          onSort={() => sortBy("complete")}
                        >
                          Status
                        </SortableHead>
                        <TableHead className="w-28 text-right pr-4">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cases.map((item) => (
                        <Fragment key={item.id}>
                          <TableRow
                            className="h-10"
                            data-state={selected.includes(item.id) ? "selected" : undefined}
                          >
                            <TableCell className="pl-4">
                              <Checkbox
                                aria-label={`Select case ${item.caseKey}`}
                                checked={selected.includes(item.id)}
                                disabled={
                                  query.isPlaceholderData ||
                                  (!selected.includes(item.id) &&
                                    selection.length >= maxCasesPerRun)
                                }
                                onCheckedChange={() => toggle(item.id)}
                              />
                            </TableCell>
                            <TableCell>
                              <span className="block truncate font-medium" title={item.caseKey}>
                                {item.caseKey}
                              </span>
                            </TableCell>
                            <TableCell>
                              <button
                                className="block w-full truncate text-left hover:underline"
                                aria-expanded={expanded.includes(item.id)}
                                aria-controls={`case-detail-${item.id}`}
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
                              <span
                                className="block truncate text-muted-foreground"
                                title={item.category}
                              >
                                {item.category || "—"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="block truncate">
                                {item.metric ? metricLabels[item.metric] : "Not selected"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`px-1.5 text-[11px] ${item.complete ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}
                              >
                                {item.complete ? (
                                  <CheckCircle2Icon className="size-3" />
                                ) : (
                                  <AlertCircleIcon className="size-3" />
                                )}
                                {item.complete ? "Ready to run" : "Needs setup"}
                              </Badge>
                            </TableCell>
                            <TableCell className="pr-3">
                              <div className="flex justify-end gap-0.5">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-7"
                                  aria-label={`Edit case ${item.caseKey}`}
                                  onClick={() => setEditing(item)}
                                >
                                  <PencilIcon className="size-3.5" />
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="size-7"
                                      aria-label={`Actions for case ${item.caseKey}`}
                                    >
                                      <MoreVerticalIcon className="size-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        setExpanded((now) =>
                                          now.includes(item.id)
                                            ? now.filter((id) => id !== item.id)
                                            : [...now, item.id],
                                        )
                                      }
                                    >
                                      <ChevronDownIcon className="size-3.5" />
                                      {expanded.includes(item.id) ? "Hide details" : "View details"}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      variant="destructive"
                                      disabled={deleteCase.isPending}
                                      onSelect={() =>
                                        deleteCase.mutate(
                                          { caseId: item.id, datasetId },
                                          { onError },
                                        )
                                      }
                                    >
                                      <Trash2Icon className="size-3.5" /> Delete case
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                          {expanded.includes(item.id) && (
                            <TableRow id={`case-detail-${item.id}`}>
                              <TableCell
                                colSpan={7}
                                className="whitespace-normal bg-muted/20 px-4 py-3"
                              >
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div>
                                    <p className="mb-1 font-medium">Customer Message</p>
                                    <MessageText text={item.message} />
                                  </div>
                                  <div>
                                    <p className="mb-1 font-medium">Expected answer or behaviour</p>
                                    <MessageText
                                      text={
                                        item.expected ||
                                        "No expected text specified. Open Edit to review all evaluation expectations."
                                      }
                                    />
                                    {!!item.issues.length && (
                                      <p className="mt-2 text-amber-700 dark:text-amber-400">
                                        {item.issues.join(" ")}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="border-t px-4 py-2 text-xs text-muted-foreground">
                  {dataset.total ? (dataset.page - 1) * 25 + 1 : 0}–
                  {Math.min(dataset.page * 25, dataset.total)} of {dataset.total} · 25 per page
                </div>
                <div className="[&_[data-slot=pagination]]:py-2 [&_button]:h-7 [&_button]:text-xs [&_p]:text-xs">
                  <ResourcePagination
                    page={dataset.page}
                    pageCount={Math.ceil(dataset.total / 25)}
                    onPageChange={(page) => setFilters({ ...filters, page })}
                  />
                </div>
              </div>
            </RunsPanel>
          </>
        ) : null}
      </section>

      {confirming ? (
        <RunConfirmDialog
          caseIds={chosen}
          datasetId={datasetId}
          onClose={() => setConfirming(false)}
          onStarted={() => {
            setConfirming(false);
            setRunVersion((now) => now + 1);
            setSelected([]);
            document.getElementById("testing-evaluations")?.focus();
            document
              .getElementById("testing-evaluations")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      ) : null}

      {bulkEditing && (
        <CaseEditor
          bulkCount={selection.length}
          existing={null}
          nextKey="bulk"
          isSaving={updateExpectations.isPending}
          onClose={() => setBulkEditing(false)}
          onSave={(input) =>
            updateExpectations.mutate(
              {
                datasetId,
                input: {
                  caseIds: selection.map((item) => item.id),
                  expected: input.expected,
                  metric: input.metric,
                  metadata: input.metadata,
                },
              },
              {
                onError,
                onSuccess: () => {
                  setBulkEditing(false);
                  toast.success("Expectations updated.");
                },
              },
            )
          }
        />
      )}
      {editing ? (
        <CaseEditor
          existing={editing === "new" ? null : editing}
          isSaving={createCase.isPending || updateCase.isPending}
          key={editing === "new" ? "new" : editing.id}
          nextKey={
            nextCaseKeys(
              caseIndex.map((c) => c.caseKey),
              1,
            )[0] as string
          }
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
    </PlatformAppShell>
  );
}
