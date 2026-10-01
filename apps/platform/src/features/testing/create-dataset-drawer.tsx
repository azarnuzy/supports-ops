import type { EvalImportPreview, EvalImportSource } from "@repo/api-client";
import {
  EVAL_CSV_TEMPLATE,
  IMPORT_ROW_LIMIT,
  importSourceSchema,
  keyAllocator,
  previewCsv,
  previewPaste,
  validate,
} from "@repo/shared/eval-import";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Field, FieldDescription, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { Textarea } from "@repo/ui/components/textarea";
import { useNavigate } from "@tanstack/react-router";
import { DownloadIcon } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import {
  useCreateDatasetMutation,
  useImportCasesMutation,
  useImportSessionsQuery,
  useUpdateDatasetMutation,
} from "./hooks";
import { formatTestingDate } from "./format";
import { ImportPreviewPanel } from "./import-preview";

type Tab = "csv" | "paste" | "sessions";

export function CreateDatasetDrawer({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const navigate = useNavigate();
  const createDataset = useCreateDatasetMutation();
  const updateDataset = useUpdateDatasetMutation();
  const importCases = useImportCasesMutation();
  const [step, setStep] = useState(0);
  const [tab, setTab] = useState<Tab>("paste");
  const [name, setName] = useState("");
  const [pasted, setPasted] = useState("");
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [criteria, setCriteria] = useState("");
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [preview, setPreview] = useState<EvalImportPreview | null>(null);
  const [acceptSkipped, setAcceptSkipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRead = useRef(0);
  const sessions = useImportSessionsQuery(open && tab === "sessions");
  const messageIds = Object.keys(selected);
  const source: EvalImportSource | null =
    tab === "paste"
      ? pasted.trim()
        ? { source: "paste", text: pasted }
        : null
      : tab === "csv"
        ? csv
          ? { source: "csv", text: csv.text }
          : null
        : messageIds.length
          ? {
              selections: messageIds.map((messageId) => ({
                includeHistory: selected[messageId] === true,
                messageId,
              })),
              source: "sessions",
            }
          : null;
  const validRows = preview?.rows.filter((row) => row.case).length ?? 0;
  const skippedRows =
    (preview?.rows.filter((row) => !row.case).length ?? 0) +
    (preview?.truncated ? preview.truncated.total - preview.truncated.limit : 0);
  const reviewed =
    !source || (!!preview && !preview.error && validRows > 0 && (!skippedRows || acceptSkipped));

  function edit<T>(setter: (value: T) => void) {
    return (value: T) => {
      fileRead.current++;
      setter(value);
      setPreview(null);
      setAcceptSkipped(false);
    };
  }

  function reset() {
    fileRead.current++;
    setStep(0);
    setTab("paste");
    setName("");
    setPasted("");
    setCsv(null);
    setSelected({});
    setCriteria("");
    setDatasetId(null);
    setPreview(null);
    setAcceptSkipped(false);
  }

  function close(next: boolean) {
    if (busy) return;
    onOpenChange(next);
    if (!next) reset();
  }

  function makePreview(input: EvalImportSource): EvalImportPreview {
    const parsed = importSourceSchema.safeParse(input);
    if (!parsed.success)
      return {
        error:
          input.source === "sessions" && input.selections.length > 500
            ? "Select at most 500 Customer Messages. Only the first 100 can be imported into a dataset at once."
            : parsed.error.issues.map((issue) => issue.message).join(" "),
        rows: [],
        truncated: null,
      };
    const alloc = keyAllocator([]);
    if (input.source === "csv") {
      const result = previewCsv(input.text, alloc);
      return !result.error && !result.rows.length
        ? { ...result, error: "The CSV contains only a header. Add at least one data row." }
        : result;
    }
    if (input.source === "paste") return previewPaste(input.text, alloc);
    const messages = new Map(
      (sessions.data?.sessions ?? []).flatMap((session) =>
        session.messages.map((message) => [message.id, message] as const),
      ),
    );
    return {
      error: null,
      rows: input.selections.slice(0, IMPORT_ROW_LIMIT).map((selection, index) => {
        const message = messages.get(selection.messageId);
        return message
          ? validate(index + 1, { caseKey: alloc.fresh(), message: message.content }, alloc)
          : {
              case: null,
              errors: ["Customer Message is no longer available. Refresh and select again."],
              row: index + 1,
            };
      }),
      truncated:
        input.selections.length > IMPORT_ROW_LIMIT
          ? { limit: IMPORT_ROW_LIMIT, total: input.selections.length }
          : null,
    };
  }

  function review() {
    setAcceptSkipped(false);
    setPreview(source ? makePreview(source) : null);
    setStep(1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step !== 2 || busy || !name.trim() || !reviewed) return;
    setBusy(true);
    let id = datasetId;
    try {
      if (!id) {
        id = (await createDataset.mutateAsync({ criteria, name })).dataset.id;
        setDatasetId(id);
      } else await updateDataset.mutateAsync({ id, input: { criteria, name } });
      if (source) {
        // The server revalidates current Workspace data and remains authoritative.
        const result = (await importCases.mutateAsync({ datasetId: id, source })).import;
        const saved = result.rows.filter((row) => row.case).length;
        if (!saved) {
          setPreview(result);
          setAcceptSkipped(false);
          setStep(1);
          toast.error("Dataset created, but no cases were imported. Review the errors and retry.");
          return;
        }
        const skipped = result.rows.filter((row) => !row.case).length;
        if (skipped || result.truncated)
          toast.warning(`${saved} cases imported. Some rows were skipped; review the dataset.`);
        else toast.success(`Dataset created with ${saved} cases.`);
      } else toast.success("Dataset created.");
      onOpenChange(false);
      reset();
      void navigate({ params: { datasetId: id }, to: "/testing/$datasetId" });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to create the dataset. Your input is kept for retry.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function readCsv(file: File | undefined) {
    const request = ++fileRead.current;
    setCsv(null);
    setPreview(null);
    setAcceptSkipped(false);
    if (!file) return;
    if (file.size > 5_000_000) {
      toast.error("Choose a CSV file no larger than 5 MB.");
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      if (request !== fileRead.current) return;
      setCsv({ name: file.name, text });
      setPreview(makePreview({ source: "csv", text }));
    } catch {
      toast.error("Unable to read the CSV file. Choose the file again.");
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(
      new Blob([EVAL_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "supportops-eval-dataset-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        showCloseButton={false}
      >
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Create Dataset</DialogTitle>
          <DialogDescription>
            Choose Customer Messages, review your cases, then set default grading criteria.
          </DialogDescription>
          <ol className="mt-2 flex flex-wrap gap-4 text-xs" aria-label="Creation steps">
            {["Choose source", "Review cases", "Evaluation criteria"].map((label, index) => (
              <li
                key={label}
                aria-current={step === index ? "step" : undefined}
                className={
                  step === index ? "font-semibold text-foreground" : "text-muted-foreground"
                }
              >
                {index + 1}. {label}
              </li>
            ))}
          </ol>
        </DialogHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <fieldset disabled={busy} className="grid min-w-0 content-start gap-4 p-5">
              {datasetId && (
                <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                  The dataset has been created. Retry to finish importing your cases; Cancel keeps
                  the dataset.
                </p>
              )}
              {step === 0 && (
                <>
                  <Field className="gap-1.5">
                    <FieldLabel htmlFor="dataset-name">Dataset name</FieldLabel>
                    <Input
                      id="dataset-name"
                      maxLength={120}
                      placeholder="e.g. Refund policy checks"
                      required
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                    <FieldDescription className="text-xs">
                      A short name for a collection you will run again.
                    </FieldDescription>
                  </Field>
                  <Tabs value={tab} onValueChange={(value) => edit(setTab)(value as Tab)}>
                    <TabsList className="w-full flex-wrap group-data-[orientation=horizontal]/tabs:h-auto">
                      <TabsTrigger
                        className="h-auto flex-1 text-xs sm:text-sm"
                        disabled={busy}
                        value="paste"
                      >
                        Paste Messages
                      </TabsTrigger>
                      <TabsTrigger
                        className="h-auto flex-1 text-xs sm:text-sm"
                        disabled={busy}
                        value="sessions"
                      >
                        Recent Sessions
                      </TabsTrigger>
                      <TabsTrigger
                        className="h-auto flex-1 text-xs sm:text-sm"
                        disabled={busy}
                        value="csv"
                      >
                        Upload CSV
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent className="mt-4" value="paste">
                      <Field className="gap-1.5">
                        <FieldLabel htmlFor="dataset-paste">Customer Messages</FieldLabel>
                        <Textarea
                          id="dataset-paste"
                          rows={7}
                          maxLength={1_000_000}
                          placeholder={
                            "How do I request a refund?\n---\nWhere can I update my billing details?"
                          }
                          value={pasted}
                          onChange={(event) => edit(setPasted)(event.target.value)}
                        />
                        <FieldDescription className="text-xs">
                          One case per message. Separate messages with a line containing only{" "}
                          <code>---</code>. Leave empty to create a dataset and add cases later.
                        </FieldDescription>
                      </Field>
                    </TabsContent>
                    <TabsContent className="mt-4 grid gap-3" value="sessions">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          {messageIds.length} messages selected
                        </p>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            type="button"
                            disabled={!sessions.data?.sessions.length}
                            onClick={() =>
                              edit(setSelected)(
                                Object.fromEntries(
                                  (sessions.data?.sessions ?? []).flatMap((session) =>
                                    session.messages.map((message) => [message.id, true]),
                                  ),
                                ),
                              )
                            }
                          >
                            Select all
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            type="button"
                            disabled={!messageIds.length}
                            onClick={() => edit(setSelected)({})}
                          >
                            Clear selection
                          </Button>
                        </div>
                      </div>
                      {sessions.isPending ? (
                        <p className="text-sm text-muted-foreground">Loading recent Sessions…</p>
                      ) : sessions.isError ? (
                        <div className="text-sm text-destructive">
                          Unable to load recent Sessions.{" "}
                          <Button
                            size="sm"
                            variant="outline"
                            type="button"
                            onClick={() => void sessions.refetch()}
                          >
                            Retry
                          </Button>
                        </div>
                      ) : !sessions.data.sessions.length ? (
                        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                          No Sessions with Customer Messages yet. Paste messages or upload a CSV
                          instead.
                        </p>
                      ) : (
                        <ul className="grid gap-2">
                          {sessions.data.sessions.map((session) => {
                            const customer = session.conversation?.customerIdentity;
                            const label =
                              customer?.name ||
                              customer?.email ||
                              customer?.phoneE164 ||
                              `Session ${session.id.slice(0, 8)}`;
                            const allSelected = session.messages.every(
                              (message) => selected[message.id] !== undefined,
                            );
                            return (
                              <li className="overflow-hidden rounded-lg border" key={session.id}>
                                <div className="flex items-center justify-between gap-2 bg-muted/30 px-3 py-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{label}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {session.conversation?.channel.name ?? "Channel unavailable"}{" "}
                                      · {session.messages.length} Customer Messages ·{" "}
                                      {formatTestingDate(session.createdAt)}
                                    </p>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    type="button"
                                    onClick={() => {
                                      const next = { ...selected };
                                      session.messages.forEach((message) => {
                                        if (allSelected) delete next[message.id];
                                        else next[message.id] = true;
                                      });
                                      edit(setSelected)(next);
                                    }}
                                  >
                                    {allSelected ? "Clear" : "Select all"}
                                  </Button>
                                </div>
                                <div className="grid divide-y">
                                  {session.messages.map((message) => (
                                    <div className="grid gap-1.5 px-3 py-2" key={message.id}>
                                      <label
                                        htmlFor={`dataset-message-${message.id}`}
                                        className="flex items-start gap-2 text-sm"
                                      >
                                        <Checkbox
                                          id={`dataset-message-${message.id}`}
                                          checked={selected[message.id] !== undefined}
                                          onCheckedChange={(checked) => {
                                            const next = { ...selected };
                                            if (checked === true) next[message.id] = true;
                                            else delete next[message.id];
                                            edit(setSelected)(next);
                                          }}
                                        />
                                        <span className="line-clamp-2 whitespace-pre-wrap">
                                          {message.content}
                                        </span>
                                      </label>
                                      {selected[message.id] !== undefined && (
                                        <label
                                          htmlFor={`dataset-history-${message.id}`}
                                          className="ml-6 flex items-center gap-2 text-xs text-muted-foreground"
                                        >
                                          <Checkbox
                                            id={`dataset-history-${message.id}`}
                                            checked={selected[message.id]}
                                            onCheckedChange={(checked) =>
                                              edit(setSelected)({
                                                ...selected,
                                                [message.id]: checked === true,
                                              })
                                            }
                                          />
                                          Include preceding conversation history
                                        </label>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <FieldDescription className="text-xs">
                        Each selected Customer Message becomes one case. Up to 20 earlier Customer /
                        AI Agent turns are context only; previous AI responses never become expected
                        answers.
                      </FieldDescription>
                    </TabsContent>
                    <TabsContent className="mt-4 grid gap-3" value="csv">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">Import existing cases</p>
                        <Button
                          size="sm"
                          type="button"
                          variant="outline"
                          onClick={downloadTemplate}
                        >
                          <DownloadIcon className="size-3.5" />
                          Download CSV Template
                        </Button>
                      </div>
                      <Field className="gap-1.5">
                        <FieldLabel htmlFor="dataset-csv">CSV file</FieldLabel>
                        <Input
                          accept=".csv,text/csv"
                          id="dataset-csv"
                          type="file"
                          disabled={busy}
                          onChange={(event) => void readCsv(event.target.files?.[0])}
                        />
                        <FieldDescription className="text-xs">
                          {csv ? `Selected: ${csv.name}. ` : ""}Up to 100 rows · 5 MB. Validation
                          runs when you select a file.
                        </FieldDescription>
                      </Field>
                      <div className="rounded-lg bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
                        <p>
                          <strong className="text-foreground">Required:</strong>{" "}
                          <code>message</code>.
                        </p>
                        <p>
                          <strong className="text-foreground">Optional:</strong>{" "}
                          <code>
                            caseKey, category, expected, metric, clarificationCount, history,
                            attachments, metadata
                          </code>
                          . History, attachments and metadata use JSON. Case IDs are generated when
                          omitted; missing criteria can be completed later.
                        </p>
                      </div>
                      {preview && <ImportPreviewPanel preview={preview} />}
                    </TabsContent>
                  </Tabs>
                </>
              )}
              {step === 1 && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold">Review cases</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {name} ·{" "}
                      {tab === "csv"
                        ? csv?.name
                        : tab === "sessions"
                          ? "Recent Sessions"
                          : "Pasted messages"}
                    </p>
                  </div>
                  {preview ? (
                    <ImportPreviewPanel preview={preview} />
                  ) : (
                    <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                      An empty dataset will be created. Add cases from the dataset page.
                    </p>
                  )}
                  {tab === "sessions" && source && (
                    <p className="text-xs text-muted-foreground">
                      History is copied from the Session when cases are imported. Earlier AI
                      responses remain context only.
                    </p>
                  )}
                  {skippedRows > 0 && (
                    <label
                      htmlFor="dataset-accept-skipped"
                      className="flex items-start gap-2 rounded-lg border p-3 text-sm"
                    >
                      <Checkbox
                        id="dataset-accept-skipped"
                        checked={acceptSkipped}
                        onCheckedChange={(checked) => setAcceptSkipped(checked === true)}
                      />
                      <span>
                        Import {validRows} valid rows and skip {skippedRows} rows that are invalid
                        or exceed the 100-row limit.
                      </span>
                    </label>
                  )}
                </>
              )}
              {step === 2 && (
                <>
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <span className="font-medium">{name}</span>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {validRows} cases to import
                      {skippedRows ? ` · ${skippedRows} rows skipped` : ""}
                    </p>
                  </div>
                  <Field className="gap-1.5">
                    <FieldLabel htmlFor="dataset-criteria">
                      Default grading criteria{" "}
                      <span className="font-normal text-muted-foreground">(optional)</span>
                    </FieldLabel>
                    <Textarea
                      id="dataset-criteria"
                      maxLength={4000}
                      rows={4}
                      placeholder="e.g. Answer using published policy, explain the next step clearly, and avoid unsupported promises."
                      value={criteria}
                      onChange={(event) => setCriteria(event.target.value)}
                    />
                    <FieldDescription className="text-xs">
                      A default rubric for judged metrics. Choose the evaluation type and its
                      required expectations for each case in the case editor. Previous AI responses
                      are context, not reference answers.
                    </FieldDescription>
                  </Field>
                </>
              )}
            </fieldset>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-background px-5 py-3">
            <Button disabled={busy} type="button" variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <div className="flex gap-2">
              {step > 0 && (
                <Button
                  disabled={busy}
                  type="button"
                  variant="outline"
                  onClick={() => setStep(step - 1)}
                >
                  Back
                </Button>
              )}
              {step < 2 ? (
                <Button
                  disabled={
                    busy ||
                    !name.trim() ||
                    (step === 0 && tab !== "paste" && !source) ||
                    (step === 1 && !reviewed)
                  }
                  type="button"
                  onClick={() => (step === 0 ? review() : setStep(2))}
                >
                  {step === 0 ? "Review cases" : "Continue"}
                </Button>
              ) : (
                <Button disabled={busy || !name.trim() || !reviewed} type="submit">
                  {busy ? "Creating…" : datasetId ? "Finish import" : "Create Dataset"}
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
