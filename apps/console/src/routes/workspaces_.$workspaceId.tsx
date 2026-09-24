import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceDetailView } from "../features/workspaces";

export const Route = createFileRoute("/workspaces_/$workspaceId")({
  component: Detail,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-sm text-destructive">
      Could not display the Workspace: {error.message}
    </div>
  ),
});

function Detail() {
  const { workspaceId } = Route.useParams();
  return <WorkspaceDetailView workspaceId={workspaceId} />;
}
