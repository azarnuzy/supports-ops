import { toast } from "@repo/ui/components/sonner";
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import {
  createOrganizationWorkspace,
  getActiveWorkspaceId,
  getWorkspaces,
  switchToWorkspace,
} from "./workspaces.services";

export const workspacesQueryOptions = queryOptions({
  queryKey: queryKeys.organization.workspaces,
  queryFn: getWorkspaces,
});

/** Open the first available Workspace on a new tab. */
export function useActiveWorkspaceId() {
  const workspaces = useQuery(workspacesQueryOptions);
  return getActiveWorkspaceId() ?? workspaces.data?.[0]?.id ?? null;
}

export function useCreateWorkspaceMutation() {
  return useMutation({
    mutationFn: createOrganizationWorkspace,
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to create Workspace.";
      toast.error(message);
    },
    onSuccess: (workspace) => switchToWorkspace(workspace.id),
  });
}
