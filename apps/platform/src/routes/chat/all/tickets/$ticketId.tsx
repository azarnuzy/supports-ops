import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "../../../../features/auth";
import { ChatView } from "../../../../features/chat";
import { pageMetadata } from "../../../../lib/seo";

export const Route = createFileRoute("/chat/all/tickets/$ticketId")({
  beforeLoad: requireAuth,
  head: () =>
    pageMetadata({
      title: "Inbox",
      description: "Manage your Ticket conversations in your SupportOps Workspace.",
      path: "/chat",
      noIndex: true,
    }),
  validateSearch: (
    search: Record<string, unknown>,
  ): { category?: string; priority?: string; q?: string; status?: string } => ({
    category: typeof search.category === "string" ? search.category : undefined,
    priority: typeof search.priority === "string" ? search.priority : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
    status: typeof search.status === "string" ? search.status : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { ticketId } = Route.useParams();
  return <ChatView scope="all" ticketId={ticketId} />;
}
