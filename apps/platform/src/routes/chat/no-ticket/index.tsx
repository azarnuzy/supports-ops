import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "../../../features/auth";
import { NoTicketView } from "../../../features/chat";
import { pageMetadata } from "../../../lib/seo";

export const Route = createFileRoute("/chat/no-ticket/")({
  head: () =>
    pageMetadata({
      title: "Without Ticket",
      description: "Conversations the AI Agent answered without opening a Ticket.",
      path: "/chat/no-ticket",
      noIndex: true,
    }),
  beforeLoad: requireAuth,
  validateSearch: (search: Record<string, unknown>): { q?: string; session?: string } => ({
    q: typeof search.q === "string" ? search.q : undefined,
    session: typeof search.session === "string" ? search.session : undefined,
  }),
  component: NoTicketView,
});
