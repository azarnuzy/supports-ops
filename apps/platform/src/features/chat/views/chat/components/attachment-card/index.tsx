import { Button } from "@repo/ui/components/button";
import { DownloadIcon, FileTextIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { getAttachmentPreviewUrl, openAttachment } from "../../../../../tickets/tickets.services";
import { formatBytes, isImage } from "../../chat.utils";
import type { AttachmentCardProps } from "./index.types";

export default function AttachmentCard({
  attachment,
  onOpenImage,
  showReadability = true,
}: AttachmentCardProps) {
  const [previewUrl, setPreviewUrl] = useState<string>();
  const isPreviewableDocument =
    attachment.mimeType === "application/pdf" || attachment.mimeType === "text/plain";

  useEffect(() => {
    if (!isImage(attachment)) return;
    void getAttachmentPreviewUrl(attachment.id).then(({ url }) => setPreviewUrl(url));
  }, [attachment]);

  const readability =
    attachment.processingStatus === "PROCESSING"
      ? "AI reading…"
      : attachment.processingStatus === "FAILED"
        ? `Could not be read${attachment.failureReason ? `: ${attachment.failureReason}` : ""}`
        : "✓";

  if (isImage(attachment)) {
    return (
      <button
        aria-label={`Open ${attachment.fileName} in gallery`}
        className="relative size-28 shrink-0 overflow-hidden rounded-md border bg-muted"
        onClick={onOpenImage}
        type="button"
      >
        {previewUrl ? (
          <img alt="" className="size-full object-cover" src={previewUrl} />
        ) : (
          <span className="grid size-full place-items-center text-xs text-muted-foreground">Loading…</span>
        )}
        {showReadability ? (
          <span className="absolute right-1 bottom-1 rounded bg-background/90 px-1 text-[10px] text-foreground">
            {readability}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <article className="flex min-w-0 items-center gap-3 rounded-md border p-3">
      <FileTextIcon className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{attachment.fileName}</p>
        <p className="text-xs text-muted-foreground">{formatBytes(attachment.sizeBytes)}{showReadability ? ` · ${readability}` : ""}</p>
      </div>
      {isPreviewableDocument ? (
        <Button onClick={() => void getAttachmentPreviewUrl(attachment.id).then(({ url }) => window.open(url, "_blank", "noopener"))} size="xs" type="button" variant="outline">
          Preview
        </Button>
      ) : null}
      {isPreviewableDocument ? (
        <Button aria-label={`Download ${attachment.fileName}`} onClick={() => void openAttachment(attachment.id)} size="icon-xs" type="button" variant="outline">
          <DownloadIcon />
        </Button>
      ) : null}
    </article>
  );
}
