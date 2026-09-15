import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../../features/auth";
import { WebWidgetChannelView } from "../../features/settings";
import { pageMetadata } from "../../lib/seo";

export const Route = createFileRoute("/channels/web-widget")({
  beforeLoad: requireAdmin,
  head: () =>
    pageMetadata({
      title: "Web Widget",
      description: "Configure the Web Widget channel Customers use to reach you.",
      path: "/channels/web-widget",
      noIndex: true,
    }),
  component: WebWidgetChannelView,
});
