import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import {
  getWhatsAppConfig,
  getWebWidgetConfig,
  replaceWhatsAppCredentials,
  updateWhatsAppConfig,
  updateWebWidgetConfig,
  uploadWebWidgetLogo,
  verifyWhatsAppConfig,
} from "./widget-config.services";

export const webWidgetConfigQueryOptions = queryOptions({
  queryKey: queryKeys.workspace.widgetConfig,
  queryFn: getWebWidgetConfig,
});

export const whatsAppConfigQueryOptions = queryOptions({
  queryKey: queryKeys.workspace.whatsAppConfig,
  queryFn: getWhatsAppConfig,
  refetchInterval: 10_000,
});

export function useVerifyWhatsAppConfigMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: verifyWhatsAppConfig,
    onSuccess: (config) => queryClient.setQueryData(whatsAppConfigQueryOptions.queryKey, config),
  });
}

export function useUpdateWhatsAppConfigMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateWhatsAppConfig,
    onSuccess: (config) => queryClient.setQueryData(whatsAppConfigQueryOptions.queryKey, config),
  });
}

export function useReplaceWhatsAppCredentialsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: replaceWhatsAppCredentials,
    onSuccess: (config) => queryClient.setQueryData(whatsAppConfigQueryOptions.queryKey, config),
  });
}

export function useUpdateWebWidgetConfigMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateWebWidgetConfig,
    onSuccess: (webWidgetConfig) => {
      queryClient.setQueryData(webWidgetConfigQueryOptions.queryKey, webWidgetConfig);
    },
  });
}

export function useUploadWebWidgetLogoMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: uploadWebWidgetLogo,
    onSuccess: (webWidgetConfig) => {
      queryClient.setQueryData(webWidgetConfigQueryOptions.queryKey, webWidgetConfig);
    },
  });
}
