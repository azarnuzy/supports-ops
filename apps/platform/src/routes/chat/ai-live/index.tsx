import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "../../../features/auth";
import { ChatView } from "../../../features/chat";

export const Route = createFileRoute("/chat/ai-live/")({
  beforeLoad: requireAuth,
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: () => <ChatView scope="ai-live" />,
});
