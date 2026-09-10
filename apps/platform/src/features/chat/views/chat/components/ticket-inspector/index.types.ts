import type { TicketAttachment, TicketDetail } from "@repo/api-client";
import type { DetailsTab, TimelineEntry } from "../../chat.types";

export type TicketInspectorProps = {
  detail: TicketDetail;
  detailsTab: DetailsTab;
  images: { attachment: TicketAttachment; messagePosition: number }[];
  setDetailsTab: (value: DetailsTab) => void;
  setGalleryIndex: (index: number) => void;
  timeline: TimelineEntry[];
};
