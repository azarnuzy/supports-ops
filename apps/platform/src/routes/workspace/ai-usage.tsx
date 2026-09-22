import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../../features/auth";
import { AiUsageView } from "../../features/ai-usage";
import { pageMetadata } from "../../lib/seo";

export const Route = createFileRoute("/workspace/ai-usage")({
  beforeLoad: requireAdmin,
  head: () =>
    pageMetadata({
      title: "AI Usage",
      description: "Credits, AI Turns, Tokens, and Tool calls for this Workspace's AI Agents.",
      path: "/workspace/ai-usage",
      noIndex: true,
    }),
  component: AiUsageView,
});
