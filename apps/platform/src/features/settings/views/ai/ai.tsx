import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Field, FieldDescription, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { Switch } from "@repo/ui/components/switch";
import { createApiClient, fetchAiSettings, updateAiSettings, type AiSettings } from "@repo/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PlatformAppShell } from "../../../app-shell";
import { SettingsNav } from "../../components/settings-nav";

const apiClient = createApiClient(import.meta.env.VITE_API_URL ?? "http://localhost:8000");

const AiSettingsView = () => {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["workspace", "ai-settings"], queryFn: () => fetchAiSettings(apiClient) });
  const [form, setForm] = useState<AiSettings | null>(null);
  useEffect(() => { if (settings.data) setForm(settings.data.aiSettings); }, [settings.data]);
  const save = useMutation({
    mutationFn: (input: AiSettings) => updateAiSettings(apiClient, input),
    onSuccess: (result) => queryClient.setQueryData(["workspace", "ai-settings"], result),
  });
  const update = (key: keyof AiSettings, value: number | boolean) => setForm((current) => current ? { ...current, [key]: value } : current);

  return <PlatformAppShell><section className="grid gap-8"><div className="max-w-2xl"><p className="text-sm font-medium text-muted-foreground">Workspace settings</p><h1 className="text-3xl font-semibold text-balance">AI Agent</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Set when the AI Agent checks in after Customer silence and when it can resolve an inactive Ticket.</p></div><SettingsNav />
    {settings.isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
    {form ? <Card className="max-w-xl"><CardHeader><CardTitle>Follow-Up and Auto-Resolution</CardTitle><CardDescription>These timers only run while the AI Agent owns the Ticket.</CardDescription></CardHeader><CardContent><form className="grid gap-5" onSubmit={(event) => { event.preventDefault(); if (form) save.mutate(form); }}>
      <Field><FieldLabel htmlFor="follow-up-delay">Follow-Up delay (seconds)</FieldLabel><Input id="follow-up-delay" type="number" min={1} value={form.followUpAfterSeconds} onChange={(event) => update("followUpAfterSeconds", Number(event.target.value))} /><FieldDescription>After this silence, the AI Agent asks whether its answer helped.</FieldDescription></Field>
      <Field><FieldLabel htmlFor="auto-resolve-delay">Auto-Resolution delay (seconds)</FieldLabel><Input id="auto-resolve-delay" type="number" min={1} value={form.autoResolveAfterSeconds} onChange={(event) => update("autoResolveAfterSeconds", Number(event.target.value))} /></Field>
      <Field><div className="flex items-center justify-between gap-4"><div><FieldLabel htmlFor="auto-resolve-enabled">Enable Auto-Resolution</FieldLabel><FieldDescription>Resolve only after a sent Follow-Up also receives no reply.</FieldDescription></div><Switch id="auto-resolve-enabled" checked={form.autoResolveEnabled} onCheckedChange={(checked) => update("autoResolveEnabled", checked)} /></div></Field>
      <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save changes"}</Button>
    </form></CardContent></Card> : null}
  </section></PlatformAppShell>;
};

export default AiSettingsView;
