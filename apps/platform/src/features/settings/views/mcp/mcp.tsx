import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { toast } from "@repo/ui/components/sonner";
import type { McpTool } from "@repo/api-client";
import { useQuery } from "@tanstack/react-query";
import { PlugIcon, PlusIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ReviewToolDialog, ServerDialog, ServerRow, ServerSheet } from "./components";
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

export const McpPanel = () => {
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
  const [detailId, setDetailId] = useState<string | null>(null);
  const [lastTestByServer, setLastTestByServer] = useState<
    Record<string, { message?: string; ok: boolean }>
  >({});
  const [reviewing, setReviewing] = useState<McpTool | null>(null);

  const items = servers.data?.servers ?? [];
  const detailServer = items.find((server) => server.id === detailId) ?? null;

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
      onError: () => {
        setLastTestByServer((current) => ({ ...current, [id]: { ok: false } }));
        toast.error("Failed to test the MCP server.");
      },
      onSuccess: (result) => {
        setLastTestByServer((current) => ({
          ...current,
          [id]: result.data.ok ? { ok: true } : { message: result.data.error, ok: false },
        }));
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
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Connect a remote Streamable HTTP MCP server to import its tools. Nothing it exposes is
          callable until you review and enable it.
        </p>
        <Button onClick={openCreate}>
          <PlusIcon className="size-4" />
          Add server
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {servers.isPending ? (
          <div className="grid gap-3 p-5">
            {["a", "b", "c"].map((key) => (
              <Skeleton key={key} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : null}
        {servers.isError ? (
          <div className="grid place-items-center gap-3 p-12 text-center">
            <p className="text-sm text-destructive">Unable to load MCP servers.</p>
            <Button variant="outline" onClick={() => void servers.refetch()}>
              Retry
            </Button>
          </div>
        ) : null}
        {!servers.isPending && !servers.isError && items.length === 0 ? (
          <div className="grid place-items-center gap-3 p-12 text-center">
            <div className="grid size-10 place-items-center rounded-lg bg-muted">
              <PlugIcon className="size-5 text-muted-foreground" />
            </div>
            <div className="grid gap-1">
              <p className="text-base font-medium">No MCP servers found</p>
              <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                This agent has no connected MCP servers yet.
              </p>
            </div>
            <Button className="mt-1" size="sm" variant="outline" onClick={openCreate}>
              <PlusIcon className="size-4" />
              Add MCP Server
            </Button>
          </div>
        ) : null}
        {items.map((server) => (
          <ServerRow
            key={server.id}
            server={server}
            activeToolCount={toolsByServer[server.id]?.filter((tool) => tool.tool.enabled).length}
            onOpenDetail={() => setDetailId(server.id)}
            onToggleServerEnabled={(enabled) => handleToggleServerEnabled(server.id, enabled)}
            onDelete={() => handleDelete(server.id)}
          />
        ))}
      </div>

      <ServerSheet
        open={detailId !== null}
        onOpenChange={(open) => !open && setDetailId(null)}
        server={detailServer}
        tools={detailId ? toolsByServer[detailId] : undefined}
        lastTest={detailId ? lastTestByServer[detailId] : undefined}
        isTesting={testConnection.isPending && testConnection.variables === detailId}
        isDiscovering={discoverTools.isPending && discoverTools.variables === detailId}
        onTest={() => detailId && handleTest(detailId)}
        onDiscover={() => detailId && handleDiscover(detailId)}
        onToggleServerEnabled={(enabled) =>
          detailId && handleToggleServerEnabled(detailId, enabled)
        }
        onEdit={() => {
          if (!detailId) return;
          const id = detailId;
          setDetailId(null);
          openEdit(id);
        }}
        onDelete={() => {
          if (!detailId) return;
          handleDelete(detailId);
          setDetailId(null);
        }}
        onToggleToolEnabled={(toolId, enabled) =>
          detailId && handleToggleToolEnabled(detailId, toolId, enabled)
        }
        onReviewTool={setReviewing}
      />

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
    </div>
  );
};

export default McpPanel;
