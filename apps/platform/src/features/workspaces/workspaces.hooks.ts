import { toast } from "@repo/ui/components/sonner";
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { meQueryOptions } from "../auth";
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

/** Falls back to the signed-in user's own Workspace until a switch is made,
 * so a first visit (with nothing in `sessionStorage` yet) still opens the
 * right Inbox. */
export function useActiveWorkspaceId() {
  const user = useQuery(meQueryOptions);

  return getActiveWorkspaceId() ?? user.data?.workspaceId ?? null;
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
