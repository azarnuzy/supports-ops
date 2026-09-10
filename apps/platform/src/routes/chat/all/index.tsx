import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "../../../features/auth";
import { ChatView } from "../../../features/chat";

export const Route = createFileRoute("/chat/all/")({
  beforeLoad: requireAuth,
  validateSearch: (
    search: Record<string, unknown>,
  ): { category?: string; priority?: string; q?: string; status?: string } => ({
    category: typeof search.category === "string" ? search.category : undefined,
    priority: typeof search.priority === "string" ? search.priority : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
    status: typeof search.status === "string" ? search.status : undefined,
  }),
  component: () => <ChatView scope="all" />,
});
