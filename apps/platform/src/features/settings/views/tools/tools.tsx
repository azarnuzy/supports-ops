import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { toast } from "@repo/ui/components/sonner";
import { PlusIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { PlatformAppShell } from "../../../app-shell";
import { SettingsNav } from "../../components/settings-nav";
import { HttpToolDialog, ToolRow } from "./components";
import {
  useAiAgentId,
  useCreateToolMutation,
  useDeleteToolMutation,
  useToggleToolEnabledMutation,
  useToolsQuery,
  useUpdateToolMutation,
} from "./tools.hooks";
import { getTool } from "./tools.services";
import { emptyHttpToolForm, type HttpToolFormState } from "./tools.types";

const ToolsSettingsView = () => {
  const aiAgentId = useAiAgentId();
  const tools = useToolsQuery(aiAgentId);
  const createTool = useCreateToolMutation(aiAgentId);
  const updateTool = useUpdateToolMutation(aiAgentId);
  const deleteTool = useDeleteToolMutation(aiAgentId);
  const toggleEnabled = useToggleToolEnabledMutation(aiAgentId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hasBearerToken, setHasBearerToken] = useState(false);
  const [hasSecretHeaders, setHasSecretHeaders] = useState(false);
  const [form, setForm] = useState<HttpToolFormState>(emptyHttpToolForm);

  const items = tools.data?.tools ?? [];

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyHttpToolForm);
    setHasBearerToken(false);
    setHasSecretHeaders(false);
  }

  function openCreate() {
    setForm(emptyHttpToolForm);
    setEditingId(null);
    setHasBearerToken(false);
    setHasSecretHeaders(false);
    setDialogOpen(true);
  }

  async function openEdit(id: string) {
    try {
      const { tool } = await getTool(id);
      setForm({
        bearerToken: "",
        clearBearerToken: false,
        clearSecretHeaders: false,
        description: tool.description,
        inputSchema: JSON.stringify(tool.inputSchema, null, 2),
        method: tool.method,
        name: tool.name,
        risk: tool.risk,
        secretHeaders: "",
        url: tool.url,
      });
      setHasBearerToken(tool.hasBearerToken);
      setHasSecretHeaders(tool.hasSecretHeaders);
      setEditingId(id);
      setDialogOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load the HTTP Tool.");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let inputSchema: Record<string, unknown>;
    try {
      inputSchema = JSON.parse(form.inputSchema);
    } catch {
      toast.error("The input schema must be valid JSON.");
      return;
    }

    let secretHeaders: Record<string, string> | null | undefined;
    if (form.clearSecretHeaders) secretHeaders = null;
    else if (form.secretHeaders.trim()) {
      try {
        secretHeaders = JSON.parse(form.secretHeaders);
      } catch {
        toast.error("Secret headers must be a valid JSON object.");
        return;
      }
    }

    const input = {
      bearerToken: form.clearBearerToken ? null : form.bearerToken.trim() || undefined,
      description: form.description.trim(),
      enabled: true,
      inputSchema,
      method: form.method,
      name: form.name.trim(),
      risk: form.risk,
      secretHeaders,
      url: form.url.trim(),
    };

    const onError = (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Failed to save the HTTP Tool.");
    const onSuccess = () => {
      toast.success(editingId ? "HTTP Tool updated." : "HTTP Tool created.");
      closeDialog();
    };

    if (editingId) updateTool.mutate({ id: editingId, input }, { onError, onSuccess });
    else createTool.mutate(input, { onError, onSuccess });
  }

  function handleDelete(id: string) {
    deleteTool.mutate(id, {
      onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to delete."),
      onSuccess: () => toast.success("HTTP Tool deleted."),
    });
  }

  function handleToggleEnabled(toolId: string, enabled: boolean) {
    toggleEnabled.mutate(
      { enabled, toolId },
      {
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Failed to update the Tool."),
      },
    );
  }

  return (
    <PlatformAppShell>
      <section className="mx-auto grid w-full max-w-6xl gap-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Workspace settings</p>
            <h1 className="mt-1 text-3xl font-semibold text-balance">Tools</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Built-in, HTTP, and MCP Tools the AI Agent can be assigned.
            </p>
          </div>
          <Button onClick={openCreate}>
            <PlusIcon className="size-4" /> Create HTTP Tool
          </Button>
        </div>
        <SettingsNav />

        <div className="overflow-hidden rounded-lg border">
          {tools.isPending ? (
            <div className="grid gap-3 p-5">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : null}
          {tools.isError ? (
            <div className="grid place-items-center gap-3 p-12 text-center">
              <p className="text-sm text-destructive">Unable to load Tools.</p>
              <Button variant="outline" onClick={() => void tools.refetch()}>
                Retry
              </Button>
            </div>
          ) : null}
          {!tools.isPending && !tools.isError && items.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted-foreground">No Tools yet.</p>
          ) : null}
          {items.map((tool) => (
            <ToolRow
              key={tool.id}
              tool={tool}
              onToggleEnabled={(enabled) => handleToggleEnabled(tool.id, enabled)}
              onEdit={tool.origin === "HTTP" ? () => void openEdit(tool.id) : undefined}
              onDelete={tool.origin === "HTTP" ? () => handleDelete(tool.id) : undefined}
            />
          ))}
        </div>
      </section>

      <HttpToolDialog
        open={dialogOpen}
        onOpenChange={(open) => !open && closeDialog()}
        mode={editingId ? "edit" : "create"}
        form={form}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        onSubmit={handleSubmit}
        isPending={createTool.isPending || updateTool.isPending}
        hasBearerToken={hasBearerToken}
        hasSecretHeaders={hasSecretHeaders}
      />
    </PlatformAppShell>
  );
};

export default ToolsSettingsView;
