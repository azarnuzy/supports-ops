import type { EvalCase, EvalCaseInput } from "@repo/api-client";
import { Badge } from "@repo/ui/components/badge";
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

  useEffect(() => {
    if (dataset) {
      setName(dataset.name);
      setCriteria(dataset.criteria);
    }
  }, [dataset]);

  const cases = dataset?.cases ?? [];
  const incomplete = cases.filter((c) => !c.complete).length;

  function save(input: EvalCaseInput) {
    const done = { onError, onSuccess: () => setEditing(null) };
    if (editing && editing !== "new")
      updateCase.mutate({ caseId: editing.id, datasetId, input }, done);
    else createCase.mutate({ datasetId, input }, done);
  }

  return (
    <PlatformAppShell>
      <section className="mx-auto grid w-full max-w-6xl gap-6">
        <div>
          <Link
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            to="/testing"
          >
            <ArrowLeftIcon className="size-4" /> Testing
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{dataset?.name ?? "Dataset"}</h1>
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
            <form
              className="grid gap-4 rounded-xl border bg-card p-4"
              onSubmit={(event) => {
                event.preventDefault();
                updateDataset.mutate(
                  { id: datasetId, input: { criteria, name } },
                  { onError, onSuccess: () => toast.success("Dataset saved.") },
                );
              }}
            >
              <Field>
                <FieldLabel htmlFor="detail-name">Dataset name</FieldLabel>
                <Input id="detail-name" maxLength={120} required value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="detail-criteria">Default grading criteria</FieldLabel>
                <Textarea id="detail-criteria" maxLength={4000} rows={3} value={criteria} onChange={(e) => setCriteria(e.target.value)} />
                <FieldDescription>
                  Used by judged metrics; each case's expected answer stays authoritative.
                </FieldDescription>
              </Field>
              <Button className="justify-self-start" disabled={updateDataset.isPending || !name.trim()} type="submit">
                Save dataset
              </Button>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {cases.length} {cases.length === 1 ? "case" : "cases"}
                {incomplete > 0 ? ` · ${incomplete} incomplete and cannot run yet` : ""}
              </p>
              <div className="flex gap-2">
                <Button
                  disabled
                  title="Running evaluations is not available yet."
                  variant="outline"
                >
                  <PlayIcon className="size-4" /> Run (not available yet)
                </Button>
                <Button onClick={() => setEditing("new")}>
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
                  <button
                    className="flex min-w-0 flex-1 items-center justify-between gap-4 p-4 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    type="button"
                    onClick={() => setEditing(item)}
                  >
                    <span className="min-w-0">
                      <span className="block text-xs text-muted-foreground">
                        {item.caseKey}
                        {item.category ? ` · ${item.category}` : ""}
                        {item.metric ? ` · ${metricLabels[item.metric]}` : ""}
                      </span>
                      <span className="block truncate font-medium">{item.message}</span>
                      {item.issues.length > 0 ? (
                        <span className="block text-sm text-muted-foreground">{item.issues.join(" ")}</span>
                      ) : null}
                    </span>
                    <Badge variant={item.complete ? "secondary" : "outline"}>
                      {item.complete ? "Ready" : "Incomplete"}
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
          </>
        ) : null}
      </section>

      {editing ? (
        <CaseEditor
          existing={editing === "new" ? null : editing}
          isSaving={createCase.isPending || updateCase.isPending}
          key={editing === "new" ? "new" : editing.id}
          nextKey={nextCaseKeys(cases.map((c) => c.caseKey), 1)[0] as string}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
    </PlatformAppShell>
  );
}
