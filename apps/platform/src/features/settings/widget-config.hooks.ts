import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { getWebWidgetConfig, updateWebWidgetConfig } from "./widget-config.services";

export const webWidgetConfigQueryOptions = queryOptions({
  queryKey: queryKeys.workspace.widgetConfig,
  queryFn: getWebWidgetConfig,
});

export function useUpdateWebWidgetConfigMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateWebWidgetConfig,
    onSuccess: (webWidgetConfig) => {
      queryClient.setQueryData(webWidgetConfigQueryOptions.queryKey, webWidgetConfig);
    },
  });
}
