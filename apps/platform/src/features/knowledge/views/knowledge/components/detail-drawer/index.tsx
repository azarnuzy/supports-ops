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
import type {
  KnowledgeIngestStage,
  KnowledgeSource,
  KnowledgeVisibility,
} from "../../knowledge.types";
import {
  formatUpdatedAt,
  ingestStagesFor,
  sourceTypeLabel,
  stageStateFor,
  statusLabel,
  statusVariant,
  visibilityLabel,
} from "../../knowledge.utils";
import VisibilitySelect from "../visibility-select";
import type { KnowledgeDetailDrawerProps } from "./index.types";

/** Static lookup tables, not Sets — the key space is a small fixed string union. */
const REFRESHABLE_BY_TYPE: Record<string, true> = { PDF: true, URL: true };
const EDITABLE_BY_TYPE: Record<string, true> = {
  MANUAL_FAQ: true,
  PDF: true,
  URL: true,
  INTERNAL_SOP: true,
};

export default function KnowledgeDetailDrawer({
  onOpenChange,
  source,
}: KnowledgeDetailDrawerProps) {
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
  const isRefreshable = REFRESHABLE_BY_TYPE[source.sourceType] === true && !isProcessing;
  const isEditable = EDITABLE_BY_TYPE[source.sourceType] === true && !isProcessing;
  const canRetry = source.status === "FAILED";
  const showStepper =
    source.status === "PROCESSING" || source.status === "FAILED"
      ? Boolean(ingestStagesFor(source.sourceType))
      : false;
  const stages = ingestStagesFor(source.sourceType);

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
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Update source failed."),
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
        {/* Fixed header, scrolling body, pinned footer — actions never fall below the fold. */}
        <SheetContent
          className="w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
          side="right"
        >
          <SheetHeader className="shrink-0 gap-2 border-b p-5 pr-12">
            <SheetTitle className="break-words">{source.title}</SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{sourceTypeLabel(source.sourceType)}</Badge>
              <Badge variant={statusVariant(source.status)}>
                {source.status === "PROCESSING" && source.stage
                  ? statusLabel(source.stage)
                  : statusLabel(source.status)}
              </Badge>
              <Badge variant="outline">{visibilityLabel(source.visibility)}</Badge>
            </SheetDescription>
          </SheetHeader>

          {isEditing ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
              <Field>
                <FieldLabel htmlFor="detail-title">Title</FieldLabel>
                <Input
                  id="detail-title"
                  placeholder="e.g. Returns & Exchanges Policy"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </Field>
              <VisibilitySelect
                id="detail-visibility"
                value={visibility}
                onChange={setVisibility}
              />
              <Field className="flex min-h-0 flex-1 flex-col">
                <FieldLabel htmlFor="detail-content">Content</FieldLabel>
                {/* Fills the remaining height and scrolls inside — Save stays reachable. */}
                <Textarea
                  className="min-h-40 flex-1 resize-none overflow-y-auto font-mono text-xs"
                  id="detail-content"
                  placeholder="What the AI Agent may retrieve and quote from this source."
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                />
              </Field>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
              {source.status === "FAILED" && source.publishedAt ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  Update failed—previous version remains active. The Customer-facing content
                  published on {formatUpdatedAt(source.publishedAt)} is still retrievable by the AI
                  Agent.
                </p>
              ) : null}

              {source.status === "FAILED" ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
                  <p className="font-medium text-destructive">
                    {source.failedStage
                      ? `Failed at ${statusLabel(source.failedStage)}`
                      : "Ingestion failed"}
                  </p>
                  <p className="mt-1 text-[13px] text-destructive/90">
                    {source.failureReason ?? "Ingestion failed."}
                  </p>
                </div>
              ) : null}

              {showStepper && stages ? (
                <div>
                  <p className="mb-3 text-sm font-medium">Ingestion progress</p>
                  <IngestStepper source={source} stages={stages} />
                </div>
              ) : null}

              <div className="grid gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Content</p>
                  {isEditable ? (
                    <Button size="sm" variant="outline" onClick={startEditing}>
                      Edit
                    </Button>
                  ) : null}
                </div>
                <pre className="min-w-0 rounded-md border bg-muted/30 p-4 text-xs leading-5 break-words whitespace-pre-wrap">
                  {source.content?.trim() || "No extracted content yet."}
                </pre>
              </div>

              {/* Provenance, kept quiet: the record details are secondary to the content. */}
              <dl className="grid gap-x-6 gap-y-2.5 rounded-lg border bg-muted/30 p-4 text-xs sm:grid-cols-2">
                <Row
                  label="Chunks"
                  value={source.chunkCount === 1 ? "1 chunk" : `${source.chunkCount} chunks`}
                />
                <Row label="Last updated" value={formatUpdatedAt(source.updatedAt)} />
                {source.sourceUrl ? (
                  <Row
                    label="Source URL"
                    value={
                      <a
                        className="break-words underline underline-offset-2"
                        href={source.sourceType === "PDF" ? undefined : source.sourceUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {source.sourceUrl}
                      </a>
                    }
                  />
                ) : null}
                <Row label="ID" value={<span className="font-mono">{source.id}</span>} />
                <Row label="Created" value={formatUpdatedAt(source.createdAt)} />
                {source.publishedAt ? (
                  <Row label="Published" value={formatUpdatedAt(source.publishedAt)} />
                ) : null}
              </dl>
            </div>
          )}

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t p-4">
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
                    <Button
                      disabled={retryKnowledgeSource.isPending}
                      variant="outline"
                      onClick={handleRetry}
                    >
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
              This re-extracts content from the original{" "}
              {source.sourceType === "PDF" ? "PDF" : "URL"} and replaces any manual edits to &ldquo;
              {source.title}&rdquo;. Previously published content stays active until the new
              extraction succeeds.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={refreshKnowledgeSource.isPending}
              onClick={handleUpdateSource}
            >
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
    <div className="grid min-w-0 grid-cols-[6.5rem_1fr] items-baseline gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}

function IngestStepper({
  source,
  stages,
}: {
  source: KnowledgeSource;
  stages: KnowledgeIngestStage[];
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
