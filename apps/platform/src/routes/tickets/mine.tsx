import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "../../features/auth";
import { MyTicketsView } from "../../features/tickets";
import { pageMetadata } from "../../lib/seo";

export const Route = createFileRoute("/tickets/mine")({
  beforeLoad: requireAuth,
  head: () =>
    pageMetadata({
      title: "My tickets",
      description: "View Tickets assigned to you in SupportOps.",
      path: "/tickets/mine",
      noIndex: true,
    }),
  component: MyTicketsView,
});
