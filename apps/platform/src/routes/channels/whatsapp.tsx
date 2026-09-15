import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../../features/auth";
import { WhatsAppChannelView } from "../../features/settings";
import { pageMetadata } from "../../lib/seo";

export const Route = createFileRoute("/channels/whatsapp")({
  beforeLoad: requireAdmin,
  head: () =>
    pageMetadata({
      title: "WhatsApp",
      description: "Configure the WhatsApp channel Customers use to reach you.",
      path: "/channels/whatsapp",
      noIndex: true,
    }),
  component: WhatsAppChannelView,
});
