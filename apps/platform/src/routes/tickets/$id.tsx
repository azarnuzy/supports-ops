import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "../../features/auth";
import { TicketDetailView } from "../../features/tickets";
import { pageMetadata } from "../../lib/seo";

export const Route = createFileRoute("/tickets/$id")({
  beforeLoad: requireAuth,
  head: () =>
    pageMetadata({
      title: "Ticket",
      description: "View a Ticket's conversation and activity timeline in SupportOps.",
      path: "/tickets",
      noIndex: true,
    }),
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  return <TicketDetailView ticketId={id} />;
}
