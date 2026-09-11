import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../features/auth";
import { WebWidgetView } from "../features/settings";
import { pageMetadata } from "../lib/seo";

export const Route = createFileRoute("/widget")({
  beforeLoad: requireAdmin,
  head: () =>
    pageMetadata({
      title: "Web Widget",
      description: "Brand the Web Widget and install it on your site.",
      path: "/widget",
      noIndex: true,
    }),
  component: WebWidgetView,
});
