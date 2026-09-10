import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { toast } from "@repo/ui/components/sonner";
import type { McpTool } from "@repo/api-client";
import { useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { PlatformAppShell } from "../../../app-shell";
import { SettingsNav } from "../../components/settings-nav";
import { ReviewToolDialog, ServerDialog, ServerRow } from "./components";
import {
  mcpServersQueryOptions,
  useCreateServerMutation,
  useDeleteServerMutation,
  useDiscoverToolsMutation,
  useReviewToolMutation,
  useTestConnectionMutation,
  useToggleToolEnabledMutation,
  useUpdateServerMutation,
} from "./mcp.hooks";
import { emptyMcpServerForm, type McpServerFormState } from "./mcp.types";

const McpServersSettingsView = () => {
  const servers = useQuery(mcpServersQueryOptions);
  const createServer = useCreateServerMutation();
  const updateServer = useUpdateServerMutation();
  const deleteServer = useDeleteServerMutation();
  const testConnection = useTestConnectionMutation();
  const discoverTools = useDiscoverToolsMutation();
  const reviewTool = useReviewToolMutation();
  const toggleToolEnabled = useToggleToolEnabledMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<McpServerFormState>(emptyMcpServerForm);
  const [toolsByServer, setToolsByServer] = useState<Record<string, McpTool[]>>({});
  const [reviewing, setReviewing] = useState<McpTool | null>(null);

  const items = servers.data?.servers ?? [];

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyMcpServerForm);
  }

  function openCreate() {
    setForm(emptyMcpServerForm);
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEdit(id: string) {
    const server = items.find((item) => item.id === id);
    setForm({ ...emptyMcpServerForm, name: server?.name ?? "", url: server?.url ?? "" });
    setEditingId(id);
    setDialogOpen(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
      name: form.name.trim(),
      secretHeaders,
      url: form.url.trim(),
    };

    const onError = (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Failed to save the MCP Server.");
    const onSuccess = () => {
      toast.success(editingId ? "MCP Server updated." : "MCP Server added.");
      closeDialog();
    };

    if (editingId) updateServer.mutate({ id: editingId, input }, { onError, onSuccess });
    else createServer.mutate(input, { onError, onSuccess });
  }

  function handleDelete(id: string) {
    deleteServer.mutate(id, {
      onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to delete."),
      onSuccess: () => toast.success("MCP Server deleted."),
    });
  }

  function handleToggleServerEnabled(id: string, enabled: boolean) {
    updateServer.mutate(
      { id, input: { enabled } },
      {
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Failed to update."),
      },
    );
  }

  function handleTest(id: string) {
    testConnection.mutate(id, {
      onError: () => toast.error("Failed to test the MCP Server."),
      onSuccess: (result) => {
        if (result.data.ok) toast.success("Connection succeeded.");
        else toast.error(result.data.error);
      },
    });
  }

  function handleDiscover(id: string) {
    discoverTools.mutate(id, {
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Failed to discover Tools."),
      onSuccess: (result) => {
        setToolsByServer((current) => ({ ...current, [id]: result.data }));
        toast.success("Tool discovery complete.");
      },
    });
  }

  function handleReviewSubmit(enabled: boolean, risk: "READ_ONLY" | "MUTATING") {
    if (!reviewing) return;
    reviewTool.mutate(
      { enabled, risk, toolId: reviewing.toolId },
      {
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Failed to review the Tool."),
        onSuccess: (result) => {
          setToolsByServer((current) => ({
            ...current,
            [result.data.mcpServerId]: (current[result.data.mcpServerId] ?? []).map((tool) =>
              tool.toolId === result.data.toolId ? result.data : tool,
            ),
          }));
          toast.success("Tool reviewed.");
          setReviewing(null);
        },
      },
    );
  }

  function handleToggleToolEnabled(serverId: string, toolId: string, enabled: boolean) {
    toggleToolEnabled.mutate(
      { enabled, toolId },
      {
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Failed to update the Tool."),
        onSuccess: () =>
          setToolsByServer((current) => ({
            ...current,
            [serverId]: (current[serverId] ?? []).map((tool) =>
              tool.toolId === toolId ? { ...tool, tool: { ...tool.tool, enabled } } : tool,
            ),
          })),
      },
    );
  }

  return (
    <PlatformAppShell>
      <section className="mx-auto grid w-full max-w-6xl gap-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Workspace settings</p>
            <h1 className="mt-1 text-3xl font-semibold text-balance">MCP Servers</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Connect remote Streamable HTTP MCP Servers and enable discovered Tools.
            </p>
          </div>
          <Button onClick={openCreate}>
            <PlusIcon className="size-4" /> Add MCP Server
          </Button>
        </div>
        <SettingsNav />

        <div className="overflow-hidden rounded-lg border">
          {servers.isPending ? (
            <div className="grid gap-3 p-5">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : null}
          {servers.isError ? (
            <div className="grid place-items-center gap-3 p-12 text-center">
              <p className="text-sm text-destructive">Unable to load MCP Servers.</p>
              <Button variant="outline" onClick={() => void servers.refetch()}>
                Retry
              </Button>
            </div>
          ) : null}
          {!servers.isPending && !servers.isError && items.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted-foreground">No MCP Servers yet.</p>
          ) : null}
          {items.map((server) => (
            <ServerRow
              key={server.id}
              server={server}
              tools={toolsByServer[server.id]}
              isTesting={testConnection.isPending && testConnection.variables === server.id}
              isDiscovering={discoverTools.isPending && discoverTools.variables === server.id}
              onTest={() => handleTest(server.id)}
              onDiscover={() => handleDiscover(server.id)}
              onToggleServerEnabled={(enabled) => handleToggleServerEnabled(server.id, enabled)}
              onEdit={() => openEdit(server.id)}
              onDelete={() => handleDelete(server.id)}
              onToggleToolEnabled={(toolId, enabled) =>
                handleToggleToolEnabled(server.id, toolId, enabled)
              }
              onReviewTool={setReviewing}
            />
          ))}
        </div>
      </section>

      <ServerDialog
        open={dialogOpen}
        onOpenChange={(open) => !open && closeDialog()}
        mode={editingId ? "edit" : "create"}
        form={form}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        onSubmit={handleSubmit}
        isPending={createServer.isPending || updateServer.isPending}
      />

      <ReviewToolDialog
        tool={reviewing}
        onOpenChange={(open) => !open && setReviewing(null)}
        onSubmit={handleReviewSubmit}
        isPending={reviewTool.isPending}
      />
    </PlatformAppShell>
  );
};

export default McpServersSettingsView;
