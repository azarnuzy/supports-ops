import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Field, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Separator } from "@repo/ui/components/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import { toast } from "@repo/ui/components/sonner";
import { Textarea } from "@repo/ui/components/textarea";
import { CheckIcon, CircleIcon, LoaderIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import {
  useDeleteKnowledgeSourceMutation,
  usePublishKnowledgeSourceMutation,
  useRefreshKnowledgeSourceMutation,
  useUpdateKnowledgeSourceMutation,
} from "../../knowledge.hooks";
import type { KnowledgeSource, KnowledgeVisibility } from "../../knowledge.types";
import {
  formatUpdatedAt,
  ingestStagesFor,
  sourceTypeLabel,
  stageStateFor,
  statusLabel,
  statusVariant,
  visibilityLabel,
} from "./knowledge.services";

const refreshableTypes = new Set(["PDF", "URL"]);
const editableTypes = new Set(["MANUAL_FAQ", "PDF", "URL", "INTERNAL_SOP"]);

export function KnowledgeDetailDrawer({
  onOpenChange,
  source,
}: {
  source: KnowledgeSource | null;
  onOpenChange: (open: boolean) => void;
}) {
  const updateKnowledgeSource = useUpdateKnowledgeSourceMutation();
  const retryKnowledgeSource = usePublishKnowledgeSourceMutation();
  const refreshKnowledgeSource = useRefreshKnowledgeSourceMutation();
  const deleteKnowledgeSource = useDeleteKnowledgeSourceMutation();

  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<KnowledgeVisibility>("CUSTOMER_SAFE");
  const [content, setContent] = useState("");
  const [confirmingUpdateSource, setConfirmingUpdateSource] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!source) return;
    setIsEditing(false);
    setTitle(source.title);
    setVisibility(source.visibility);
    setContent(source.content ?? "");
  }, [source]);

  if (!source) return null;

  const isProcessing = source.status === "PROCESSING";
  const isEditable = editableTypes.has(source.sourceType) && !isProcessing;
  const isRefreshable = refreshableTypes.has(source.sourceType) && !isProcessing;
  const canRetry = source.status === "FAILED";
  const stages = source.sourceType === "HELP_CENTER" ? null : ingestStagesFor(source.sourceType);

  function startEditing() {
    if (!source) return;
    setTitle(source.title);
    setVisibility(source.visibility);
    setContent(source.content ?? "");
    setIsEditing(true);
  }

  function cancelEditing() {
    if (!source) return;
    setTitle(source.title);
    setVisibility(source.visibility);
    setContent(source.content ?? "");
    setIsEditing(false);
  }

  function handleSave() {
    if (!source) return;
    updateKnowledgeSource.mutate(
      { id: source.id, input: { content: content.trim(), title: title.trim(), visibility } },
      {
        onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to save."),
        onSuccess: () => {
          toast.success("Knowledge Source saved.");
          setIsEditing(false);
        },
      },
    );
  }

  function handleRetry() {
    if (!source) return;
    retryKnowledgeSource.mutate(source.id, {
      onError: (error) => toast.error(error instanceof Error ? error.message : "Retry failed."),
      onSuccess: () => toast.success("Retry started."),
    });
  }

  function handleUpdateSource() {
    if (!source) return;
    refreshKnowledgeSource.mutate(source.id, {
      onError: (error) => toast.error(error instanceof Error ? error.message : "Update source failed."),
      onSuccess: () => {
        toast.success("Update source started.");
        setConfirmingUpdateSource(false);
      },
    });
  }

  function handleDelete() {
    if (!source) return;
    deleteKnowledgeSource.mutate(source.id, {
      onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to delete."),
      onSuccess: () => {
        toast.success("Knowledge Source deleted.");
        setConfirmingDelete(false);
        onOpenChange(false);
      },
    });
  }

  return (
    <>
      <Sheet open={source !== null} onOpenChange={onOpenChange}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-2xl" side="right">
          <SheetHeader>
            <SheetTitle className="pr-8 break-words">{source.title}</SheetTitle>
            <SheetDescription>{sourceTypeLabel(source.sourceType)} Knowledge Source</SheetDescription>
          </SheetHeader>

          <div className="grid gap-6 px-4 pb-6">
            <dl className="grid gap-3 text-sm">
              <Row label="ID" value={<span className="font-mono text-xs">{source.id}</span>} />
              <Row label="Type" value={sourceTypeLabel(source.sourceType)} />
              {source.sourceUrl ? (
                <Row
                  label="Source URL"
                  value={
                    <a
                      className="truncate underline underline-offset-2"
                      href={source.sourceType === "PDF" ? undefined : source.sourceUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {source.sourceUrl}
                    </a>
                  }
                />
              ) : null}
              <Row label="Visibility" value={<Badge variant="outline">{visibilityLabel(source.visibility)}</Badge>} />
              <Row
                label="Status"
                value={
                  <Badge variant={statusVariant(source.status)}>
                    {source.status === "PROCESSING" && source.stage ? statusLabel(source.stage) : statusLabel(source.status)}
                  </Badge>
                }
              />
              <Row label="Created" value={formatUpdatedAt(source.createdAt)} />
              <Row label="Last updated" value={formatUpdatedAt(source.updatedAt)} />
              {source.publishedAt ? <Row label="Published" value={formatUpdatedAt(source.publishedAt)} /> : null}
              {source.status === "FAILED" ? (
                <Row
                  label="Failure"
                  value={
                    <span className="text-destructive">
                      {source.failedStage ? `${statusLabel(source.failedStage)}: ` : ""}
                      {source.failureReason ?? "Ingestion failed."}
                    </span>
                  }
                />
              ) : null}
            </dl>

            {source.status === "FAILED" && source.publishedAt ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                Update failed—previous version remains active. The Customer-facing content published
                on {formatUpdatedAt(source.publishedAt)} is still retrievable by the AI Agent.
              </p>
            ) : null}

            {stages ? (
              <div>
                <p className="mb-3 text-sm font-medium">Ingestion progress</p>
                <IngestStepper source={source} stages={stages} />
              </div>
            ) : null}

            <Separator />

            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Content</p>
                {!isEditing && isEditable ? (
                  <Button size="sm" variant="outline" onClick={startEditing}>
                    Edit
                  </Button>
                ) : null}
              </div>

              {isEditing ? (
                <div className="grid gap-4">
                  <Field>
                    <FieldLabel htmlFor="detail-title">Title</FieldLabel>
                    <Input id="detail-title" value={title} onChange={(event) => setTitle(event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="detail-visibility">Visibility</FieldLabel>
                    <Select value={visibility} onValueChange={(value) => setVisibility(value as KnowledgeVisibility)}>
                      <SelectTrigger id="detail-visibility" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CUSTOMER_SAFE">Customer-Safe</SelectItem>
                        <SelectItem value="INTERNAL_ONLY">Internal-Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="detail-content">Content</FieldLabel>
                    <Textarea
                      className="min-h-64 font-mono text-xs"
                      id="detail-content"
                      value={content}
                      onChange={(event) => setContent(event.target.value)}
                    />
                  </Field>
                </div>
              ) : (
                <pre className="max-h-[28rem] overflow-y-auto rounded-md border bg-muted/30 p-4 text-xs whitespace-pre-wrap">
                  {source.content?.trim() || "No extracted content yet."}
                </pre>
              )}
            </div>
          </div>

          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t p-4">
            <Button variant="outline" onClick={() => setConfirmingDelete(true)}>
              Delete
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              {isEditing ? (
                <>
                  <Button type="button" variant="outline" onClick={cancelEditing}>
                    Cancel
                  </Button>
                  <Button
                    disabled={!title.trim() || !content.trim() || updateKnowledgeSource.isPending}
                    onClick={handleSave}
                  >
                    {updateKnowledgeSource.isPending ? "Saving..." : "Save"}
                  </Button>
                </>
              ) : (
                <>
                  {canRetry ? (
                    <Button disabled={retryKnowledgeSource.isPending} variant="outline" onClick={handleRetry}>
                      {retryKnowledgeSource.isPending ? "Retrying..." : "Retry"}
                    </Button>
                  ) : null}
                  {isRefreshable ? (
                    <Button variant="outline" onClick={() => setConfirmingUpdateSource(true)}>
                      Update source
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmingUpdateSource} onOpenChange={setConfirmingUpdateSource}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update source?</AlertDialogTitle>
            <AlertDialogDescription>
              This re-extracts content from the original {source.sourceType === "PDF" ? "PDF" : "URL"} and
              replaces any manual edits to &ldquo;{source.title}&rdquo;. Previously published content stays
              active until the new extraction succeeds.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={refreshKnowledgeSource.isPending} onClick={handleUpdateSource}>
              {refreshKnowledgeSource.isPending ? "Updating..." : "Update source"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{source.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              {source.sourceType === "HELP_CENTER"
                ? "This deletes the website and every page crawled from it."
                : "This removes only this Knowledge Source."}{" "}
              It will no longer be retrievable by the AI Agent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteKnowledgeSource.isPending}
              variant="destructive"
              onClick={handleDelete}
            >
              {deleteKnowledgeSource.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-start gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate">{value}</dd>
    </div>
  );
}

function IngestStepper({
  source,
  stages,
}: {
  source: KnowledgeSource;
  stages: ReturnType<typeof ingestStagesFor>;
}) {
  return (
    <ol className="grid gap-2">
      {stages.map((stage) => {
        const state = stageStateFor(stage, source, stages);
        return (
          <li key={stage} className="flex items-center gap-3 text-sm">
            <span
              aria-hidden
              className={
                "flex size-5 shrink-0 items-center justify-center rounded-full border " +
                (state === "completed"
                  ? "border-primary bg-primary text-primary-foreground"
                  : state === "active"
                    ? "border-primary text-primary"
                    : state === "failed"
                      ? "border-destructive bg-destructive text-destructive-foreground"
                      : "border-muted-foreground/30 text-muted-foreground")
              }
            >
              {state === "completed" ? (
                <CheckIcon className="size-3" />
              ) : state === "failed" ? (
                <XIcon className="size-3" />
              ) : state === "active" ? (
                <LoaderIcon className="size-3 animate-spin" />
              ) : (
                <CircleIcon className="size-2 fill-current" />
              )}
            </span>
            <span
              className={
                state === "pending"
                  ? "text-muted-foreground"
                  : state === "failed"
                    ? "text-destructive"
                    : undefined
              }
            >
              {statusLabel(stage)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
