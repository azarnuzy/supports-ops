import type { EvalCase, EvalCaseInput } from "@repo/api-client";
import { Badge } from "@repo/ui/components/badge";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/collapsible";
import { ChevronDownIcon } from "lucide-react";
import { formatTestingDate } from "./format";
import { Button } from "@repo/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { Textarea } from "@repo/ui/components/textarea";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, PlayIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { PlatformAppShell } from "../app-shell";
import ResourceListState from "../settings/components/resource-list-state";
import { CaseEditor, metricLabels } from "./case-editor";
import {
  useCreateCaseMutation,
  useDatasetQuery,
  useDeleteCaseMutation,
  useUpdateCaseMutation,
  useUpdateDatasetMutation,
} from "./hooks";
import { nextCaseKeys } from "./paste";
import { RunConfirmDialog, RunsPanel } from "./run-panel";

const maxCasesPerRun = 100;

const onError = (error: unknown) =>
  toast.error(error instanceof Error ? error.message : "Something went wrong.");

export default function DatasetDetailView({ datasetId }: { datasetId: string }) {
  const query = useDatasetQuery(datasetId);
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

  useEffect(() => {
    if (dataset) {
      setName(dataset.name);
      setCriteria(dataset.criteria);
    }
  }, [dataset]);

  const cases = dataset?.cases ?? [];
  const incomplete = cases.filter((c) => !c.complete).length;
  // Deleted or edited-incomplete cases drop out of the selection instead of blocking the Run.
  const chosen = cases.filter((c) => c.complete && selected.includes(c.id)).map((c) => c.id);
  const readyIds = cases
    .filter((c) => c.complete)
    .map((c) => c.id)
    .slice(0, maxCasesPerRun);
  const toggle = (id: string) =>
    setSelected((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));

  function save(input: EvalCaseInput) {
    const done = { onError, onSuccess: () => setEditing(null) };
    if (editing && editing !== "new")
      updateCase.mutate({ caseId: editing.id, datasetId, input }, done);
    else createCase.mutate({ datasetId, input }, done);
  }

  return (
    <PlatformAppShell fullWidth>
      <section className="grid min-w-0 gap-5">
        <div>
          <Link
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            to="/testing"
          >
            <ArrowLeftIcon className="size-4" /> Testing
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {dataset?.name ?? "Dataset"}
          </h1>
          {dataset && (
            <p className="mt-1 text-xs text-muted-foreground">
              Updated {formatTestingDate(dataset.updatedAt)}
            </p>
          )}
        </div>

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
            <Collapsible className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium">
                Dataset settings <ChevronDownIcon className="size-4" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <form
                  className="grid gap-4 border-t p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    updateDataset.mutate(
                      { id: datasetId, input: { criteria, name } },
                      { onError, onSuccess: () => toast.success("Dataset saved.") },
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
                    className="justify-self-start"
                    disabled={updateDataset.isPending || !name.trim()}
                    type="submit"
                  >
                    Save dataset
                  </Button>
                </form>
              </CollapsibleContent>
            </Collapsible>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {cases.length} {cases.length === 1 ? "case" : "cases"}
                {incomplete > 0 ? ` · ${incomplete} need criteria` : ""}
                {cases.filter((item) => item.complete).length > maxCasesPerRun
                  ? " · up to 100 cases per run"
                  : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={readyIds.length === 0}
                  variant="outline"
                  onClick={() => setSelected(chosen.length === readyIds.length ? [] : readyIds)}
                >
                  {chosen.length === readyIds.length && chosen.length > 0
                    ? "Clear selection"
                    : "Select all ready"}
                </Button>
                <Button
                  size="sm"
                  disabled={chosen.length === 0}
                  onClick={() => setConfirming(true)}
                >
                  <PlayIcon className="size-4" /> Run{" "}
                  {chosen.length > 0 ? `${chosen.length} selected` : "selected"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
                  <PlusIcon className="size-4" /> Add case
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
              {cases.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No cases yet. Add the first Customer Message to check.
                </p>
              ) : null}
              {cases.map((item) => (
                <div className="flex items-center gap-2 border-b last:border-b-0" key={item.id}>
                  <Checkbox
                    aria-label={`Select case ${item.caseKey}`}
                    checked={chosen.includes(item.id)}
                    className="ml-4"
                    disabled={
                      !item.complete ||
                      (!chosen.includes(item.id) && chosen.length >= maxCasesPerRun)
                    }
                    onCheckedChange={() => toggle(item.id)}
                  />
                  <button
                    className="flex min-w-0 flex-1 items-center justify-between gap-4 px-3 py-3 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    type="button"
                    onClick={() => setEditing(item)}
                  >
                    <span className="min-w-0">
                      <span className="block text-xs text-muted-foreground">
                        {item.caseKey}
                        {item.category ? ` · ${item.category}` : ""}
                        {item.metric ? ` · ${metricLabels[item.metric]}` : ""}
                      </span>
                      <span className="block truncate text-sm font-medium">{item.message}</span>
                      {item.issues.length > 0 ? (
                        <span className="block text-sm text-muted-foreground">
                          {item.issues.join(" ")}
                        </span>
                      ) : null}
                    </span>
                    <Badge variant={item.complete ? "secondary" : "outline"}>
                      {item.complete ? "Ready" : "Needs criteria"}
                    </Badge>
                  </button>
                  <Button
                    aria-label={`Delete case ${item.caseKey}`}
                    className="mr-2"
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteCase.mutate({ caseId: item.id, datasetId }, { onError })}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <RunsPanel datasetId={datasetId} cases={cases} />
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
            setSelected([]);
          }}
        />
      ) : null}

      {editing ? (
        <CaseEditor
          existing={editing === "new" ? null : editing}
          isSaving={createCase.isPending || updateCase.isPending}
          key={editing === "new" ? "new" : editing.id}
          nextKey={
            nextCaseKeys(
              cases.map((c) => c.caseKey),
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
