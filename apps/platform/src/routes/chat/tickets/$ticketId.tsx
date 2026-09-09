import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "../../../features/auth";
import { ChatView } from "../../../features/chat";
import { pageMetadata } from "../../../lib/seo";

export const Route = createFileRoute("/chat/tickets/$ticketId")({
  beforeLoad: requireAuth,
  head: () =>
    pageMetadata({
      title: "Inbox",
      description: "Manage your Ticket conversations in your SupportOps Workspace.",
      path: "/chat",
      noIndex: true,
    }),
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { ticketId } = Route.useParams();
  return <ChatView ticketId={ticketId} />;
}
