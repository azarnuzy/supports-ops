import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "../features/auth";
import { ChatView } from "../features/chat";
import { pageMetadata } from "../lib/seo";

export const Route = createFileRoute("/chat")({
  head: () =>
    pageMetadata({
      title: "Inbox",
      description: "Manage Customer conversations in your SupportOps Workspace.",
      path: "/chat",
      noIndex: true,
    }),
  beforeLoad: requireAuth,
  component: ChatView,
});
