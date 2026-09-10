import type { TicketAttachment } from "@repo/api-client";

export type GalleryImage = { attachment: TicketAttachment; messagePosition: number };

export type ImageGalleryProps = {
  images: GalleryImage[];
  index: number | null;
  onOpenChange: (open: boolean) => void;
  setIndex: (index: number) => void;
};
