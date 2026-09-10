import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../../../lib/query-keys";
import {
  createServer,
  deleteServer,
  discoverTools,
  getMcpServers,
  reviewTool,
  testConnection,
  toggleToolEnabled,
  updateServer,
} from "./mcp.services";

export const mcpServersQueryOptions = queryOptions({
  queryFn: getMcpServers,
  queryKey: queryKeys.workspace.mcpServers,
});

function useInvalidateServers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.workspace.mcpServers });
}

export function useCreateServerMutation() {
  const invalidate = useInvalidateServers();
  return useMutation({ mutationFn: createServer, onSuccess: invalidate });
}

export function useUpdateServerMutation() {
  const invalidate = useInvalidateServers();
  return useMutation({ mutationFn: updateServer, onSuccess: invalidate });
}

export function useDeleteServerMutation() {
  const invalidate = useInvalidateServers();
  return useMutation({ mutationFn: deleteServer, onSuccess: invalidate });
}

export function useTestConnectionMutation() {
  return useMutation({ mutationFn: testConnection });
}

export function useDiscoverToolsMutation() {
  return useMutation({ mutationFn: discoverTools });
}

export function useReviewToolMutation() {
  return useMutation({ mutationFn: reviewTool });
}

export function useToggleToolEnabledMutation() {
  return useMutation({ mutationFn: toggleToolEnabled });
}
