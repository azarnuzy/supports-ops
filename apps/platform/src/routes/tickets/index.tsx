import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "../../features/auth";
import { InboxView } from "../../features/tickets";
import { pageMetadata } from "../../lib/seo";

export const Route = createFileRoute("/tickets/")({
  beforeLoad: requireAuth,
  head: () =>
    pageMetadata({
      title: "Inbox",
      description: "Find and filter Tickets in SupportOps.",
      path: "/tickets",
      noIndex: true,
    }),
  component: InboxView,
});
