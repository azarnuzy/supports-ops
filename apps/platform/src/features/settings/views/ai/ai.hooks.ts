import type { AiSettings } from "@repo/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { queryKeys } from "../../../../lib/query-keys";
import { getAiSettings, saveAiSettings } from "./ai.services";

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
