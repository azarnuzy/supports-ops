import type { EvalImportPreview, EvalImportSource } from "@repo/api-client";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@repo/ui/components/collapsible";
import { Field, FieldDescription, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import { toast } from "@repo/ui/components/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { Textarea } from "@repo/ui/components/textarea";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  useCreateDatasetMutation,
  useImportCasesMutation,
  useImportSessionsQuery,
  usePreviewImportMutation,
} from "./hooks";
import { ImportPreviewPanel } from "./import-preview";

type Tab = "csv" | "paste" | "sessions";

/** The dataset is created lazily on first Preview (the import API is dataset-scoped), then the
 * previewed source is saved as draft cases by Create. */
export function CreateDatasetDrawer({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const navigate = useNavigate();
  const createDataset = useCreateDatasetMutation();
  const importCases = useImportCasesMutation();
  const previewImport = usePreviewImportMutation();
  const [tab, setTab] = useState<Tab>("paste");
  const [name, setName] = useState("");
  const [pasted, setPasted] = useState("");
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [criteria, setCriteria] = useState("");
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [preview, setPreview] = useState<EvalImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const sessions = useImportSessionsQuery(open && tab === "sessions");

  // Only the active tab's input is imported; null means "create an empty dataset".
  const messageIds = Object.keys(selected).filter((id) => selected[id] !== undefined);
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
                includeHistory: selected[messageId] as boolean,
                messageId,
              })),
              source: "sessions",
            }
          : null;
  const validRows = preview?.rows.filter((r) => r.case).length ?? 0;
  // Saving is blocked until the Admin has seen the preview (errors and truncation) of this input.
  const canCreate = !busy && !!name.trim() && (!source || (!!preview && validRows > 0));

  function edit<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPreview(null);
    };
  }

  function reset() {
    setTab("paste");
    setName("");
    setPasted("");
    setCsv(null);
    setSelected({});
    setCriteria("");
    setDatasetId(null);
    setPreview(null);
  }

  function close(next: boolean) {
    if (busy) return;
    onOpenChange(next);
    if (!next) reset();
  }

  async function ensureDataset() {
    if (datasetId) return datasetId;
    const { dataset } = await createDataset.mutateAsync({ criteria, name });
    setDatasetId(dataset.id);
    return dataset.id;
  }

  async function runPreview() {
    if (!source) return;
    setBusy(true);
    try {
      const id = await ensureDataset();
      setPreview((await previewImport.mutateAsync({ datasetId: id, source })).preview);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to preview the import.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    setBusy(true);
    try {
      const id = await ensureDataset();
      if (source) await importCases.mutateAsync({ datasetId: id, source });
      toast.success("Dataset created.");
      onOpenChange(false);
      reset();
      void navigate({ params: { datasetId: id }, to: "/testing/$datasetId" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create the dataset.");
    } finally {
      setBusy(false);
    }
  }

  async function readCsv(file: File | undefined) {
    if (!file) return;
    setCsv({ name: file.name, text: await file.text() });
    setPreview(null);
  }

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent className="w-full gap-0 sm:max-w-xl" showCloseButton={false}>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <SheetHeader className="flex-row items-center justify-between gap-2 border-b">
            <div>
              <SheetTitle>Create Dataset</SheetTitle>
              <SheetDescription className="sr-only">
                Name the dataset and optionally paste the first Customer Messages.
              </SheetDescription>
            </div>
            <div className="flex gap-2">
              <Button disabled={busy} type="button" variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button disabled={busy || !name.trim()} type="submit">
                {busy ? "Working…" : "Create"}
              </Button>
            </div>
          </SheetHeader>
          <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto p-4">
            <Field>
              <FieldLabel htmlFor="dataset-name">Dataset name</FieldLabel>
              <Input
                id="dataset-name"
                maxLength={120}
                disabled={!!datasetId}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Tabs value={tab} onValueChange={(value) => edit(setTab)(value as Tab)}>
              <TabsList>
                <TabsTrigger value="paste">Paste messages</TabsTrigger>
                <TabsTrigger value="sessions">
                  Recent Sessions
                </TabsTrigger>
                <TabsTrigger value="csv">
                  Upload CSV
                </TabsTrigger>
              </TabsList>
              <TabsContent className="mt-3" value="paste">
                <Field>
                  <FieldLabel htmlFor="dataset-paste">Customer Messages</FieldLabel>
                  <Textarea
                    id="dataset-paste"
                    rows={8}
                    value={pasted}
                    onChange={(event) => edit(setPasted)(event.target.value)}
                  />
                  <FieldDescription>
                    Separate messages with a line containing only <code>---</code>. Optional — you
                    can add cases later.
                  </FieldDescription>
                </Field>
              </TabsContent>
              <TabsContent className="mt-3 grid gap-2" value="sessions">
                {sessions.isPending ? (
                  <p className="text-sm text-muted-foreground">Loading recent Sessions…</p>
                ) : sessions.isError ? (
                  <p className="text-sm text-destructive">Failed to load recent Sessions.</p>
                ) : sessions.data.sessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No Sessions with Customer Messages yet.
                  </p>
                ) : (
                  <ul className="grid max-h-80 gap-3 overflow-y-auto">
                    {sessions.data.sessions.map((session) => (
                      <li className="grid gap-1 rounded-lg border p-2" key={session.id}>
                        <p className="text-xs text-muted-foreground">
                          Session · {new Date(session.createdAt).toLocaleString()}
                        </p>
                        {session.messages.map((message) => (
                          <div className="grid gap-1" key={message.id}>
                            <label className="flex items-start gap-2 text-sm">
                              <Checkbox
                                checked={selected[message.id] !== undefined}
                                onCheckedChange={(checked) => {
                                  const next = { ...selected };
                                  if (checked === true) next[message.id] = false;
                                  else delete next[message.id];
                                  edit(setSelected)(next);
                                }}
                              />
                              <span className="line-clamp-3 whitespace-pre-wrap">
                                {message.content}
                              </span>
                            </label>
                            {selected[message.id] !== undefined && (
                              <label className="ml-6 flex items-center gap-2 text-xs text-muted-foreground">
                                <Checkbox
                                  checked={selected[message.id]}
                                  onCheckedChange={(checked) =>
                                    edit(setSelected)({
                                      ...selected,
                                      [message.id]: checked === true,
                                    })
                                  }
                                />
                                Include preceding history
                              </label>
                            )}
                          </div>
                        ))}
                      </li>
                    ))}
                  </ul>
                )}
                <FieldDescription>
                  Earlier AI Agent replies are imported as history only, never as the expected
                  answer.
                </FieldDescription>
              </TabsContent>
              <TabsContent className="mt-3" value="csv">
                <Field>
                  <FieldLabel htmlFor="dataset-csv">CSV file</FieldLabel>
                  <Input
                    accept=".csv,text/csv"
                    id="dataset-csv"
                    type="file"
                    onChange={(event) => void readCsv(event.target.files?.[0])}
                  />
                  <FieldDescription>
                    {csv ? `Selected: ${csv.name}. ` : ""}Use a column named message, user_message,
                    prompt, input or text (or a single column of messages). Structured columns:
                    caseKey, category, expected, metric, clarificationCount, and JSON history,
                    attachments and metadata.
                  </FieldDescription>
                </Field>
              </TabsContent>
            </Tabs>
            {source && (
              <div className="grid gap-2">
                <Button
                  className="justify-self-start"
                  disabled={busy || !name.trim()}
                  type="button"
                  variant="secondary"
                  onClick={() => void runPreview()}
                >
                  Preview import
                </Button>
                {!name.trim() && (
                  <p className="text-xs text-muted-foreground">Name the dataset to preview.</p>
                )}
                {preview && <ImportPreviewPanel preview={preview} />}
              </div>
            )}
            <Collapsible className="rounded-lg border">
              <CollapsibleTrigger className="flex w-full items-center justify-between p-3 text-sm font-medium">
                Evaluation criteria <ChevronDownIcon className="size-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t p-3">
                <Field>
                  <FieldLabel htmlFor="dataset-criteria">Default grading criteria</FieldLabel>
                  <Textarea
                    id="dataset-criteria"
                    maxLength={4000}
                    rows={4}
                    value={criteria}
                    onChange={(event) => setCriteria(event.target.value)}
                  />
                  <FieldDescription>
                    Used by judged metrics; each case's expected answer stays authoritative.
                  </FieldDescription>
                </Field>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
