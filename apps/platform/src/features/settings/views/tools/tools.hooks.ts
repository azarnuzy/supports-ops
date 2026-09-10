import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../../../lib/query-keys";
import {
  getAiSettings,
  getTools,
  createTool,
  deleteTool,
  toggleToolEnabled,
  updateTool,
} from "./tools.services";

export function useAiAgentId() {
  const settings = useQuery({ queryFn: getAiSettings, queryKey: queryKeys.workspace.aiSettings });
  return settings.data?.aiSettings.aiAgentId;
}

export function useToolsQuery(aiAgentId: string | undefined) {
  return useQuery({
    enabled: Boolean(aiAgentId),
    queryFn: () => getTools(aiAgentId as string),
    queryKey: queryKeys.workspace.tools(aiAgentId ?? ""),
  });
}

function useInvalidateTools(aiAgentId: string | undefined) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.workspace.tools(aiAgentId ?? "") });
}

export function useCreateToolMutation(aiAgentId: string | undefined) {
  const invalidate = useInvalidateTools(aiAgentId);
  return useMutation({ mutationFn: createTool, onSuccess: invalidate });
}

export function useUpdateToolMutation(aiAgentId: string | undefined) {
  const invalidate = useInvalidateTools(aiAgentId);
  return useMutation({ mutationFn: updateTool, onSuccess: invalidate });
}

export function useDeleteToolMutation(aiAgentId: string | undefined) {
  const invalidate = useInvalidateTools(aiAgentId);
  return useMutation({ mutationFn: deleteTool, onSuccess: invalidate });
}

export function useToggleToolEnabledMutation(aiAgentId: string | undefined) {
  const invalidate = useInvalidateTools(aiAgentId);
  return useMutation({ mutationFn: toggleToolEnabled, onSuccess: invalidate });
}
