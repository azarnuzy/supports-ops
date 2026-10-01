import type {
  EvalImportPreview,
  EvalImportSource,
  EvalImportMessage,
  EvalMessageFilters,
} from "@repo/api-client";
import {
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
  useImportMessagesQuery,
  useImportMessageContextQuery,
  useUpdateDatasetMutation,
} from "./hooks";
import ResourcePagination from "../settings/components/resource-pagination";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import { MessageText } from "./message-text";
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
  const [messageFilters, setMessageFilters] = useState<EvalMessageFilters>({
    page: 1,
    search: "",
    channel: "all",
    since: "all",
  });
  const [pickedMessages, setPickedMessages] = useState<Record<string, EvalImportMessage>>({});
  const [showSelected, setShowSelected] = useState(false);
  const sessions = useImportMessagesQuery(
    open && tab === "sessions" && !showSelected,
    messageFilters,
  );
  const selectedMessages = Object.keys(selected).flatMap((id) =>
    pickedMessages[id] ? [pickedMessages[id]!] : [],
  );
  const selectedPage = Math.min(
    messageFilters.page,
    Math.max(1, Math.ceil(selectedMessages.length / 20)),
  );
  const visibleMessages = showSelected
    ? selectedMessages.slice((selectedPage - 1) * 20, selectedPage * 20)
    : (sessions.data?.messages ?? []);
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
    setPickedMessages({});
    setMessageFilters({ page: 1, search: "", channel: "all", since: "all" });
    setShowSelected(false);
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
        error: parsed.error.issues.map((issue) => issue.message).join(" "),
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
    const messages = new Map(Object.values(pickedMessages).map((message) => [message.id, message]));
    return {
      error: null,
      rows: input.selections.map((selection, index) => {
        const message = messages.get(selection.messageId);
        return message
          ? validate(index + 1, { caseKey: alloc.fresh(), message: message.content }, alloc)
          : {
              case: null,
              errors: ["Customer Message is no longer available. Refresh and select again."],
              row: index + 1,
            };
      }),
      truncated: null,
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
      toast.error("Choose a CSV or XLSX file no larger than 5 MB.");
      return;
    }
    setBusy(true);
    try {
      const text = file.name.toLowerCase().endsWith(".xlsx")
        ? await new Promise<string>((resolve, reject) => {
            const worker = new Worker(new URL("./workbook-worker.ts", import.meta.url), {
              type: "module",
            });
            const timer = window.setTimeout(() => {
              worker.terminate();
              reject(new Error("Reading this workbook took too long. Try a smaller file."));
            }, 30_000);
            const finish = () => {
              window.clearTimeout(timer);
              worker.terminate();
            };
            worker.onmessage = (event: MessageEvent<{ text?: string; error?: string }>) => {
              finish();
              if (event.data.error) reject(new Error(event.data.error));
              else resolve(event.data.text ?? "");
            };
            worker.onerror = () => {
              finish();
              reject(new Error("Unable to read the workbook. Check the file and try again."));
            };
            void file
              .arrayBuffer()
              .then((buffer) => worker.postMessage(buffer, [buffer]))
              .catch((error) => {
                finish();
                reject(error);
              });
          })
        : await file.text();
      if (request !== fileRead.current) return;
      setCsv({ name: file.name, text });
      setPreview(makePreview({ source: "csv", text }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to read the file. Choose it again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function downloadTemplate() {
    setBusy(true);
    try {
      const { createTemplate } = await import("./workbook");
      const bytes = await createTemplate();
      const url = URL.createObjectURL(
        new Blob([bytes.buffer as ArrayBuffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "supportops-eval-dataset-template.xlsx";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error("Unable to download the template. Try again.");
    } finally {
      setBusy(false);
    }
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
                        Customer Messages
                      </TabsTrigger>
                      <TabsTrigger
                        className="h-auto flex-1 text-xs sm:text-sm"
                        disabled={busy}
                        value="csv"
                      >
                        Upload file
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
                        <p className="text-sm font-medium">
                          {messageIds.length} messages selected across pages
                        </p>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            type="button"
                            disabled={!messageIds.length && !showSelected}
                            onClick={() => {
                              setShowSelected(!showSelected);
                              setMessageFilters({ ...messageFilters, page: 1 });
                            }}
                          >
                            {showSelected ? "Browse messages" : "Review selection"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            type="button"
                            disabled={!messageIds.length}
                            onClick={() => edit(setSelected)({})}
                          >
                            Clear all
                          </Button>
                        </div>
                      </div>
                      {!showSelected && (
                        <>
                          <Input
                            aria-label="Search Customer Messages"
                            placeholder="Search message text, customer name, email or phone…"
                            maxLength={200}
                            value={messageFilters.search}
                            onChange={(e) =>
                              setMessageFilters({
                                ...messageFilters,
                                search: e.target.value,
                                page: 1,
                              })
                            }
                          />
                          <div className="flex flex-wrap gap-2">
                            <NativeSelect
                              aria-label="Message channel"
                              value={messageFilters.channel}
                              onChange={(e) =>
                                setMessageFilters({
                                  ...messageFilters,
                                  channel: e.target.value as EvalMessageFilters["channel"],
                                  page: 1,
                                })
                              }
                            >
                              <NativeSelectOption value="all">All channels</NativeSelectOption>
                              <NativeSelectOption value="WEB">Web Widget</NativeSelectOption>
                              <NativeSelectOption value="WHATSAPP">WhatsApp</NativeSelectOption>
                            </NativeSelect>
                            <NativeSelect
                              aria-label="Message date range"
                              value={messageFilters.since}
                              onChange={(e) =>
                                setMessageFilters({
                                  ...messageFilters,
                                  since: e.target.value as EvalMessageFilters["since"],
                                  page: 1,
                                })
                              }
                            >
                              <NativeSelectOption value="all">All dates</NativeSelectOption>
                              <NativeSelectOption value="7">Last 7 days</NativeSelectOption>
                              <NativeSelectOption value="30">Last 30 days</NativeSelectOption>
                              <NativeSelectOption value="90">Last 90 days</NativeSelectOption>
                            </NativeSelect>
                            <Button
                              size="sm"
                              variant="outline"
                              type="button"
                              disabled={!visibleMessages.length}
                              onClick={() => {
                                setPickedMessages((now) => ({
                                  ...now,
                                  ...Object.fromEntries(
                                    visibleMessages.map((message) => [message.id, message]),
                                  ),
                                }));
                                edit(setSelected)({
                                  ...selected,
                                  ...Object.fromEntries(
                                    visibleMessages.map((message) => [
                                      message.id,
                                      selected[message.id] ?? false,
                                    ]),
                                  ),
                                });
                              }}
                            >
                              Select this page
                            </Button>
                          </div>
                        </>
                      )}
                      {!showSelected && sessions.isPending ? (
                        <p className="text-sm text-muted-foreground">Loading Customer Messages…</p>
                      ) : !showSelected && sessions.isError ? (
                        <div className="text-sm text-destructive">
                          Unable to load Customer Messages.{" "}
                          <Button
                            size="sm"
                            variant="outline"
                            type="button"
                            onClick={() => void sessions.refetch()}
                          >
                            Retry
                          </Button>
                        </div>
                      ) : !visibleMessages.length ? (
                        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                          {showSelected
                            ? "No messages selected."
                            : "No Customer Messages match these filters. Try another search, paste messages or upload a file."}
                        </p>
                      ) : (
                        <ul className="grid gap-2">
                          {visibleMessages.map((message) => {
                            const customer = message.session.customerIdentity;
                            return (
                              <li className="min-w-0 rounded-lg border p-3" key={message.id}>
                                <div className="flex items-start gap-3">
                                  <Checkbox
                                    aria-label={`Select message from ${customer.name || "Customer"} at ${formatTestingDate(message.createdAt)}`}
                                    checked={selected[message.id] !== undefined}
                                    onCheckedChange={(checked) => {
                                      setPickedMessages((now) => ({
                                        ...now,
                                        [message.id]: message,
                                      }));
                                      const next = { ...selected };
                                      if (checked === true) next[message.id] = false;
                                      else delete next[message.id];
                                      edit(setSelected)(next);
                                    }}
                                  />
                                  <div className="grid min-w-0 flex-1 gap-2">
                                    <MessageText text={message.content} />
                                    <MessageContext messageId={message.id} />
                                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                                      {customer.name ||
                                        customer.email ||
                                        customer.phoneE164 ||
                                        "Customer"}{" "}
                                      · {message.session.channel.name} ·{" "}
                                      {formatTestingDate(message.createdAt)}
                                    </p>
                                    {selected[message.id] !== undefined && (
                                      <label className="flex items-start gap-2 text-xs text-muted-foreground">
                                        <Checkbox
                                          checked={selected[message.id]}
                                          onCheckedChange={(checked) =>
                                            edit(setSelected)({
                                              ...selected,
                                              [message.id]: checked === true,
                                            })
                                          }
                                        />
                                        Include preceding conversation context (up to 20 Customer /
                                        AI Agent turns)
                                      </label>
                                    )}
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <ResourcePagination
                        page={
                          showSelected ? selectedPage : (sessions.data?.page ?? messageFilters.page)
                        }
                        pageCount={Math.ceil(
                          (showSelected ? selectedMessages.length : (sessions.data?.total ?? 0)) /
                            20,
                        )}
                        onPageChange={(page) => setMessageFilters({ ...messageFilters, page })}
                      />
                      <FieldDescription className="text-xs">
                        Each selected Customer Message becomes a draft case. Earlier AI Agent
                        responses are context only, never expected answers. When included, context
                        uses the latest 20 earlier turns without shortening their text.
                      </FieldDescription>
                    </TabsContent>
                    <TabsContent className="mt-4 grid gap-3" value="csv">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">Import existing cases</p>
                        <Button
                          size="sm"
                          type="button"
                          variant="outline"
                          onClick={() => void downloadTemplate()}
                        >
                          <DownloadIcon className="size-3.5" />
                          Download Excel Template
                        </Button>
                      </div>
                      <Field className="gap-1.5">
                        <FieldLabel htmlFor="dataset-csv">CSV or Excel file</FieldLabel>
                        <Input
                          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                          id="dataset-csv"
                          type="file"
                          disabled={busy}
                          onChange={(event) => void readCsv(event.target.files?.[0])}
                        />
                        <FieldDescription className="text-xs">
                          {csv ? `Selected: ${csv.name}. ` : ""}All valid rows · up to 5 MB per
                          file. Validation runs when you select a file.
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
                            caseKey, category, expected, metric, decision, language,
                            retrievalTarget, tool, toolMustNotBeCalled, clarificationCount, history,
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
                          ? "Customer Messages"
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
                        Import {validRows} valid rows and skip {skippedRows} rows that are invalid ;
                        invalid rows are not imported.
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

function MessageContext({ messageId }: { messageId: string }) {
  const [expanded, setExpanded] = useState(false);
  const query = useImportMessageContextQuery(messageId, expanded);
  return (
    <details
      className="text-xs text-muted-foreground"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="cursor-pointer">View preceding conversation context</summary>
      {expanded && (
        <div className="mt-2 grid max-h-80 gap-3 overflow-auto rounded-lg border p-3">
          {query.isPending && <p role="status">Loading context…</p>}
          {query.isError && (
            <p role="alert">
              {query.error.message}{" "}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void query.refetch()}
              >
                Retry
              </Button>
            </p>
          )}
          {query.data?.history.length === 0 && <p>No earlier Customer / AI Agent Messages.</p>}
          {query.data?.history.map((turn) => (
            <div key={turn.id}>
              <p className="mb-1 font-medium">{turn.role === "user" ? "Customer" : "AI Agent"}</p>
              <MessageText text={turn.content} />
            </div>
          ))}
          {!!query.data?.history.length && (
            <p>Showing up to 20 earlier turns. They provide context, not expected answers.</p>
          )}
        </div>
      )}
    </details>
  );
}
