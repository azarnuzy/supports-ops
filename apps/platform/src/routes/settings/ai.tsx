import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../../features/auth";
import { AiSettingsView } from "../../features/settings";
import { pageMetadata } from "../../lib/seo";

export const Route = createFileRoute("/settings/ai")({
  beforeLoad: requireAdmin,
  head: () => pageMetadata({ title: "AI Agent", description: "Configure Follow-Up and Auto-Resolution.", path: "/settings/ai", noIndex: true }),
  component: AiSettingsView,
});
