import type { TicketAttachment } from "@repo/api-client";
import { Button } from "@repo/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@repo/ui/components/dialog";
import { cn } from "@repo/ui/lib/utils";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { getAttachmentPreviewUrl } from "../../../../../tickets/tickets.services";
import type { ImageGalleryProps } from "./index.types";

export default function ImageGallery({ images, index, onOpenChange, setIndex }: ImageGalleryProps) {
  const image = index === null ? null : images[index];
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    setUrl(undefined);
    if (image) void getAttachmentPreviewUrl(image.attachment.id).then(({ url }) => setUrl(url));
  }, [image]);

  return (
    <Dialog open={index !== null} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="max-w-5xl bg-background p-4"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" && index !== null) setIndex((index - 1 + images.length) % images.length);
          if (event.key === "ArrowRight" && index !== null) setIndex((index + 1) % images.length);
        }}
        showCloseButton={false}
      >
        <div className="flex items-center justify-between gap-3">
          <DialogTitle className="truncate text-sm">{image?.attachment.fileName} · {(index ?? 0) + 1} of {images.length}</DialogTitle>
          <Button aria-label="Close gallery" onClick={() => onOpenChange(false)} size="icon-sm" type="button" variant="ghost"><XIcon /></Button>
        </div>
        <div className="relative grid min-h-80 place-items-center bg-muted">
          {url ? <img alt={image?.attachment.fileName ?? ""} className="max-h-[65vh] max-w-full object-contain" src={url} /> : "Loading…"}
          {images.length > 1 && index !== null ? (
            <>
              <Button aria-label="Previous image" className="absolute left-2" onClick={() => setIndex((index - 1 + images.length) % images.length)} size="icon-sm" type="button" variant="secondary"><ChevronLeftIcon /></Button>
              <Button aria-label="Next image" className="absolute right-2" onClick={() => setIndex((index + 1) % images.length)} size="icon-sm" type="button" variant="secondary"><ChevronRightIcon /></Button>
            </>
          ) : null}
        </div>
        <div aria-label="Image filmstrip" className="flex gap-2 overflow-x-auto">
          {images.map((entry, imageIndex) => (
            <button aria-label={`View image ${imageIndex + 1}`} className={cn("size-12 shrink-0 overflow-hidden rounded border", index === imageIndex && "ring-2 ring-primary")} key={entry.attachment.id} onClick={() => setIndex(imageIndex)} type="button">
              <GalleryThumbnail attachment={entry.attachment} />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GalleryThumbnail({ attachment }: { attachment: TicketAttachment }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    void getAttachmentPreviewUrl(attachment.id).then(({ url }) => setUrl(url));
  }, [attachment]);
  return url ? <img alt="" className="size-full object-cover" src={url} /> : null;
}
