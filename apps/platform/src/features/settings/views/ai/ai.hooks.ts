import type { AiSettings } from "@repo/api-client";
import { toast } from "@repo/ui/components/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { queryKeys } from "../../../../lib/query-keys";
import { getAiSettings, saveAiSettings } from "./ai.services";
import { validateAiSettings } from "./ai.utils";

export function useAiSettingsForm() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryFn: getAiSettings,
    queryKey: queryKeys.workspace.aiSettings,
  });
  const current = settings.data?.aiSettings ?? null;
  const [form, setForm] = useState<AiSettings | null>(null);

  useEffect(() => {
    if (current) setForm(current);
  }, [current]);

  const save = useMutation({
    mutationFn: saveAiSettings,
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save AI Agent settings.");
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.workspace.aiSettings, result);
      toast.success("AI Agent saved.");
    },
  });

  const validationError = useMemo(() => (form ? validateAiSettings(form) : null), [form]);
  const isDirty = !!form && !!current && JSON.stringify(form) !== JSON.stringify(current);

  function update(key: keyof AiSettings, value: string | number | boolean) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function handleReset() {
    if (current) setForm(current);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form && !validationError) save.mutate(form);
  }

  return {
    current,
    form,
    handleReset,
    handleSubmit,
    isDirty,
    save,
    settings,
    update,
    validationError,
  };
}
