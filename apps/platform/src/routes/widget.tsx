import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../features/auth";
import { WebWidgetView } from "../features/settings";
import { pageMetadata } from "../lib/seo";

export const Route = createFileRoute("/widget")({
  beforeLoad: requireAdmin,
  head: () =>
    pageMetadata({
      title: "Channels",
      description: "Configure the Web Widget and WhatsApp Channel.",
      path: "/widget",
      noIndex: true,
    }),
  component: WebWidgetView,
});
