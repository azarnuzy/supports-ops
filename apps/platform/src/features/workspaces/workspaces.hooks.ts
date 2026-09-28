import { toast } from "@repo/ui/components/sonner";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { queryKeys } from "../../lib/query-keys";
import {
  createOrganizationWorkspace,
  getActiveWorkspaceId,
  getWorkspaces,
  subscribeToWorkspaceChange,
  switchToWorkspace,
} from "./workspaces.services";

export const workspacesQueryOptions = queryOptions({
  queryKey: queryKeys.organization.workspaces,
  queryFn: getWorkspaces,
});

/** Open the first available Workspace on a new tab. */
export function useActiveWorkspaceId() {
  const workspaces = useQuery(workspacesQueryOptions);
  const selected = useSyncExternalStore(subscribeToWorkspaceChange, getActiveWorkspaceId, () => null);
  return selected ?? workspaces.data?.[0]?.id ?? null;
}

export function useSwitchWorkspace() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return async (workspaceId: string) => {
    const scopedQueryKeys = [["workspace"], ["ticket-categories"], ["tool-calls"], queryKeys.auth.me] as const;
    await Promise.all(scopedQueryKeys.map((queryKey) => queryClient.cancelQueries({ queryKey })));
    switchToWorkspace(workspaceId);
    await Promise.all(scopedQueryKeys.map((queryKey) => queryClient.resetQueries({ queryKey })));
    await navigate({ to: "/chat" });
  };
}

export function useCreateWorkspaceMutation() {
  const switchWorkspace = useSwitchWorkspace();
  return useMutation({
    mutationFn: createOrganizationWorkspace,
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to create Workspace.";
      toast.error(message);
    },
    onSuccess: (workspace) => switchWorkspace(workspace.id),
  });
}
