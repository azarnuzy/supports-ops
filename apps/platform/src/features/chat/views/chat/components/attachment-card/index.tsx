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

  const isVoiceNote = attachment.mimeType.startsWith("audio/");

  useEffect(() => {
    if (!isImage(attachment) && !isVoiceNote) return;
    void getAttachmentPreviewUrl(attachment.id)
      .then(({ url }) => setPreviewUrl(url))
      .catch(() => undefined);
  }, [attachment, isVoiceNote]);

  const readability =
    attachment.processingStatus === "PROCESSING"
      ? "AI reading…"
      : attachment.processingStatus === "FAILED"
        ? `Could not be read${attachment.failureReason ? `: ${attachment.failureReason}` : ""}`
        : "✓";

  // A transcript sits beneath the recording, never in the Message text, so a
  // mis-heard word stays distinguishable from what the Customer typed.
  if (isVoiceNote) {
    return (
      <article className="grid min-w-0 gap-2 rounded-md border p-3">
        {previewUrl ? (
          // biome-ignore lint/a11y/useMediaCaption: the transcript below is the caption
          <audio className="w-64 max-w-full" controls preload="none" src={previewUrl} />
        ) : (
          <p className="text-xs text-muted-foreground">Voice note</p>
        )}
        {attachment.extractedText ? (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Transcript (automatic): </span>
            {attachment.extractedText}
          </p>
        ) : showReadability ? (
          <p className="text-xs text-muted-foreground">{readability}</p>
        ) : null}
      </article>
    );
  }

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
          <span className="grid size-full place-items-center text-xs text-muted-foreground">
            Loading…
          </span>
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
        <p className="text-xs text-muted-foreground">
          {formatBytes(attachment.sizeBytes)}
          {showReadability ? ` · ${readability}` : ""}
        </p>
      </div>
      {isPreviewableDocument ? (
        <Button
          onClick={() =>
            void getAttachmentPreviewUrl(attachment.id).then(({ url }) =>
              window.open(url, "_blank", "noopener"),
            )
          }
          size="xs"
          type="button"
          variant="outline"
        >
          Preview
        </Button>
      ) : null}
      {isPreviewableDocument ? (
        <Button
          aria-label={`Download ${attachment.fileName}`}
          onClick={() => void openAttachment(attachment.id)}
          size="icon-xs"
          type="button"
          variant="outline"
        >
          <DownloadIcon />
        </Button>
      ) : null}
    </article>
  );
}
