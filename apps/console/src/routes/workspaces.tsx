import { createFileRoute } from "@tanstack/react-router";
import { WorkspacesListView } from "../features/workspaces";

export const Route = createFileRoute("/workspaces")({
  component: WorkspacesListView,
});
