import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../../features/auth";
import { WebWidgetSettingsView } from "../../features/settings";
import { pageMetadata } from "../../lib/seo";

export const Route = createFileRoute("/settings/widget")({
  beforeLoad: requireAdmin,
  head: () =>
    pageMetadata({
      title: "Web Widget",
      description: "Configure the Web Widget and copy its embed snippet.",
      path: "/settings/widget",
      noIndex: true,
    }),
  component: WebWidgetSettingsView,
});
