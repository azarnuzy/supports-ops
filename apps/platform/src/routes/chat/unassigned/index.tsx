import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "../../../features/auth";
import { ChatView } from "../../../features/chat";

export const Route = createFileRoute("/chat/unassigned/")({
  beforeLoad: requireAuth,
  component: () => <ChatView scope="unassigned" />,
});
