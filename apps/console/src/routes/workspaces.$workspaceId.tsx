import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceDetailView } from "../features/workspaces";

export const Route = createFileRoute("/workspaces/$workspaceId")({
  component: Detail,
});

function Detail() {
  const { workspaceId } = Route.useParams();
  return <WorkspaceDetailView workspaceId={workspaceId} />;
}
