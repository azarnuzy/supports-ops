import type { AiSettings, TicketCategory } from "@repo/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { queryKeys } from "../../../../lib/query-keys";
import {
  getAgentTools,
  getAiSettings,
  removeCategoryPolicy,
  saveAiSettings,
  setCategoryPolicy,
} from "./ai.services";

export function useAgentToolsQuery(aiAgentId: string | undefined) {
  return useQuery({
    enabled: Boolean(aiAgentId),
    queryFn: () => getAgentTools(aiAgentId as string),
    queryKey: queryKeys.workspace.tools(aiAgentId ?? ""),
  });
}

function useInvalidateAgentTools(aiAgentId: string | undefined) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.workspace.tools(aiAgentId ?? "") });
}

export function useSetCategoryPolicyMutation(aiAgentId: string | undefined) {
  const invalidate = useInvalidateAgentTools(aiAgentId);
  return useMutation({ mutationFn: setCategoryPolicy, onSuccess: invalidate });
}

export function useRemoveCategoryPolicyMutation(aiAgentId: string | undefined) {
  const invalidate = useInvalidateAgentTools(aiAgentId);
  return useMutation({ mutationFn: removeCategoryPolicy, onSuccess: invalidate });
}

export function useAiSettingsForm() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryFn: getAiSettings,
    queryKey: queryKeys.workspace.aiSettings,
  });
  const [form, setForm] = useState<AiSettings | null>(null);

  useEffect(() => {
    if (settings.data) setForm(settings.data.aiSettings);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: saveAiSettings,
    onSuccess: (result) => queryClient.setQueryData(queryKeys.workspace.aiSettings, result),
  });

  function update(key: keyof AiSettings, value: string | number | boolean) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form) save.mutate(form);
  }

  return { form, handleSubmit, save, settings, update };
}
