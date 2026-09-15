import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import type { McpTool, ToolRisk } from "@repo/api-client";
import { useQuery } from "@tanstack/react-query";
import { PlugIcon, PlusIcon, SearchIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { PlatformAppShell } from "../../../app-shell";
import ResourceListState from "../../components/resource-list-state";
import ResourcePagination from "../../components/resource-pagination";
import { SettingsHeader } from "../../components/settings-header";
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
import { getConnectionState } from "./mcp.utils";

const PAGE_SIZE = 8;

const McpServersView = () => {
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
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const allServers = servers.data?.servers ?? [];
  const query = search.trim().toLowerCase();
  const items = allServers.filter(
    (server) =>
      !query ||
      server.name.toLowerCase().includes(query) ||
      server.url.toLowerCase().includes(query),
  );
  const detailServer = allServers.find((server) => server.id === detailId) ?? null;
  const detailLastTest = detailId ? lastTestByServer[detailId] : undefined;
  const detailConnectionState = detailServer
    ? getConnectionState(detailServer.enabled, detailLastTest)
    : "disconnected";
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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
    const server = allServers.find((item) => item.id === id);
    setForm({
      ...emptyMcpServerForm,
      name: server?.name ?? "",
      staticArguments: server?.staticArguments
        ? JSON.stringify(server.staticArguments, null, 2)
        : "",
      url: server?.url ?? "",
    });
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

    let staticArguments: Record<string, unknown> | null | undefined;
    if (form.clearStaticArguments) staticArguments = null;
    else if (form.staticArguments.trim()) {
      try {
        staticArguments = JSON.parse(form.staticArguments);
      } catch {
        toast.error("Static arguments must be a valid JSON object.");
        return;
      }
    }

    const input = {
      bearerToken: form.clearBearerToken ? null : form.bearerToken.trim() || undefined,
      name: form.name.trim(),
      secretHeaders,
      staticArguments,
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

  function handleReviewSubmit(enabled: boolean, risk: ToolRisk) {
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
      <section className="grid gap-6">
        <SettingsHeader
          title="MCP Servers"
          description="Connect a remote Streamable HTTP MCP server to import its tools. Nothing it exposes is callable until you review and enable it."
          action={
            <Button onClick={openCreate}>
              <PlusIcon className="size-4" />
              Add server
            </Button>
          }
        />

        <div className="relative max-w-sm">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search MCP servers"
            className="pl-9"
            placeholder="Search servers…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <ResourceListState
            isPending={servers.isPending}
            skeletonCount={3}
            isError={servers.isError}
            errorLabel="Unable to load MCP servers."
            onRetry={() => void servers.refetch()}
            isEmpty={items.length === 0}
            emptyIcon={<PlugIcon className="size-5 text-muted-foreground" />}
            emptyTitle={allServers.length === 0 ? "No MCP servers found" : "No matching servers"}
            emptyDescription={
              allServers.length === 0
                ? "This agent has no connected MCP servers yet."
                : "Try a different search term."
            }
            emptyAction={
              allServers.length === 0 ? (
                <Button size="sm" variant="outline" onClick={openCreate}>
                  <PlusIcon className="size-4" />
                  Add MCP Server
                </Button>
              ) : undefined
            }
          />
          {!servers.isPending && !servers.isError && items.length > 0
            ? pageItems.map((server) => (
                <ServerRow
                  key={server.id}
                  server={server}
                  connectionState={getConnectionState(server.enabled, lastTestByServer[server.id])}
                  activeToolCount={
                    toolsByServer[server.id]?.filter((tool) => tool.tool.enabled).length
                  }
                  onOpenDetail={() => setDetailId(server.id)}
                  onToggleServerEnabled={(enabled) =>
                    handleToggleServerEnabled(server.id, enabled)
                  }
                  onDelete={() => handleDelete(server.id)}
                />
              ))
            : null}
          <ResourcePagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
        </div>
      </section>

      <ServerSheet
        open={detailId !== null}
        onOpenChange={(open) => !open && setDetailId(null)}
        server={detailServer}
        connectionState={detailConnectionState}
        tools={detailId ? toolsByServer[detailId] : undefined}
        lastTest={detailLastTest}
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
    </PlatformAppShell>
  );
};

export default McpServersView;
