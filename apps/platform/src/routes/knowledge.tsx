import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../features/auth";
import { KnowledgeView } from "../features/knowledge";
import { pageMetadata } from "../lib/seo";

export const Route = createFileRoute("/knowledge")({
  beforeLoad: requireAdmin,
  head: () =>
    pageMetadata({
      title: "Knowledge",
      description: "Manage Knowledge Sources for your SupportOps Workspace.",
      path: "/knowledge",
      noIndex: true,
    }),
  component: KnowledgeView,
});
