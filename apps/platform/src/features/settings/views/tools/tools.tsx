import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import { toast } from "@repo/ui/components/sonner";
import { cn } from "@repo/ui/lib/utils";
import type { HttpToolTestResult } from "@repo/api-client";
import { PlusIcon, SearchIcon, WrenchIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { PlatformAppShell } from "../../../app-shell";
import { SettingsHeader } from "../../components/settings-header";
import { McpPanel } from "../mcp/mcp";
import { SystemToolsCard, ToolRow, ToolSheet } from "./components";
import {
  useAiAgentId,
  useCreateToolMutation,
  useDeleteToolMutation,
  useSetAttachedMutation,
  useSetUsageInstructionMutation,
  useTestToolMutation,
  useToolCallsQuery,
  useToggleToolEnabledMutation,
  useToolsQuery,
  useUpdateToolMutation,
} from "./tools.hooks";
import { getTool } from "./tools.services";
import { emptyHttpToolForm, type HttpToolFormState } from "./tools.types";

type Tab = "tools" | "mcp";
type OriginFilter = "ALL" | "HTTP" | "MCP";

const tabs: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "tools", label: "Tools" },
  { id: "mcp", label: "MCP" },
];

const ToolsView = () => {
  const aiAgentId = useAiAgentId();
  const tools = useToolsQuery(aiAgentId);
  const createTool = useCreateToolMutation(aiAgentId);
  const updateTool = useUpdateToolMutation(aiAgentId);
  const deleteTool = useDeleteToolMutation(aiAgentId);
  const toggleEnabled = useToggleToolEnabledMutation(aiAgentId);
  const setAttached = useSetAttachedMutation(aiAgentId);
  const setUsage = useSetUsageInstructionMutation(aiAgentId);
  const testTool = useTestToolMutation();

  const [tab, setTab] = useState<Tab>("tools");
  const [search, setSearch] = useState("");
  const [originFilter, setOriginFilter] = useState<OriginFilter>("ALL");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hasBearerToken, setHasBearerToken] = useState(false);
  const [hasSecretHeaders, setHasSecretHeaders] = useState(false);
  const [form, setForm] = useState<HttpToolFormState>(emptyHttpToolForm);
  const [testResult, setTestResult] = useState<HttpToolTestResult | null>(null);

  const allTools = tools.data?.tools ?? [];
  const openTool = allTools.find((tool) => tool.id === editingId) ?? null;
  const toolCalls = useToolCallsQuery(sheetOpen ? editingId : null);
  const query = search.trim().toLowerCase();
  // System tools live in their own panel, so the list only holds what an Admin configured.
  const items = allTools.filter(
    (tool) =>
      tool.origin !== "BUILT_IN" &&
      (originFilter === "ALL" || tool.origin === originFilter) &&
      (!query ||
        tool.name.toLowerCase().includes(query) ||
        tool.description.toLowerCase().includes(query)),
  );
  const configuredCount = allTools.filter((tool) => tool.origin !== "BUILT_IN").length;

  function closeSheet() {
    setSheetOpen(false);
    setEditingId(null);
    setForm(emptyHttpToolForm);
    setHasBearerToken(false);
    setHasSecretHeaders(false);
    setTestResult(null);
  }

  function openCreate() {
    setForm(emptyHttpToolForm);
    setEditingId(null);
    setHasBearerToken(false);
    setHasSecretHeaders(false);
    setTestResult(null);
    setSheetOpen(true);
  }

  /** An MCP Tool has no editable configuration here, so its sheet opens straight on the logs. */
  function openDetail(id: string) {
    setForm(emptyHttpToolForm);
    setEditingId(id);
    setTestResult(null);
    setSheetOpen(true);
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
      setTestResult(null);
      setSheetOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load the webhook.");
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
      toast.error(error instanceof Error ? error.message : "Failed to save the webhook.");
    const onSuccess = () => {
      toast.success(editingId ? "Webhook updated." : "Webhook added.");
      closeSheet();
    };

    if (editingId) updateTool.mutate({ id: editingId, input }, { onError, onSuccess });
    else createTool.mutate(input, { onError, onSuccess });
  }

  function handleDelete(id: string) {
    deleteTool.mutate(id, {
      onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to delete."),
      onSuccess: () => toast.success("Webhook deleted."),
    });
  }

  function handleTest(rawInput: string) {
    if (!editingId) return;
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(rawInput);
    } catch {
      toast.error("The sample input must be valid JSON.");
      return;
    }
    setTestResult(null);
    testTool.mutate(
      { id: editingId, input },
      {
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Failed to run the test."),
        onSuccess: (response) => setTestResult(response.result),
      },
    );
  }

  /** One switch, two calls: a Tool has to be enabled in the Workspace before it can be attached
   * to the AI Agent, and keeping that as two controls is what made this page confusing. */
  function handleToggleAttached(toolId: string, enabled: boolean, attached: boolean) {
    if (!aiAgentId) return;
    const onError = (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Failed to update the tool.");
    const attach = () => setAttached.mutate({ aiAgentId, assigned: attached, toolId }, { onError });
    if (attached && !enabled) {
      toggleEnabled.mutate({ enabled: true, toolId }, { onError, onSuccess: attach });
      return;
    }
    attach();
  }

  const addButton =
    tab === "tools" ? (
      <Button onClick={openCreate}>
        <PlusIcon className="size-4" />
        Add tool
      </Button>
    ) : null;

  return (
    <PlatformAppShell>
      <section className="grid gap-6">
        <SettingsHeader
          title="Tools"
          description="Give your agent a way to read from and act on your own systems. A tool only runs once you switch it on here."
          action={addButton}
        />

        <div
          role="tablist"
          aria-label="Tool sources"
          className="inline-flex w-max gap-1 rounded-lg border bg-muted/60 p-1"
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={cn(
                "rounded-md px-4 py-1.5 text-[13px] font-medium text-muted-foreground outline-none transition-colors",
                "hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                tab === item.id && "bg-background text-foreground shadow-sm dark:bg-input/60",
              )}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "mcp" ? (
          <McpPanel />
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-[1fr_20rem]">
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[12rem] flex-1">
                  <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="Search tools"
                    className="pl-9"
                    placeholder="Search tools…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <Select
                  value={originFilter}
                  onValueChange={(value) => setOriginFilter(value as OriginFilter)}
                >
                  <SelectTrigger aria-label="Filter by type" className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All types</SelectItem>
                    <SelectItem value="HTTP">Webhook</SelectItem>
                    <SelectItem value="MCP">MCP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                {tools.isPending ? (
                  <div className="grid gap-3 p-5">
                    {["a", "b", "c", "d"].map((key) => (
                      <Skeleton key={key} className="h-14 w-full rounded-lg" />
                    ))}
                  </div>
                ) : null}
                {tools.isError ? (
                  <div className="grid place-items-center gap-3 p-12 text-center">
                    <p className="text-sm text-destructive">Unable to load tools.</p>
                    <Button variant="outline" onClick={() => void tools.refetch()}>
                      Retry
                    </Button>
                  </div>
                ) : null}
                {!tools.isPending && !tools.isError && items.length === 0 ? (
                  <div className="grid place-items-center gap-3 p-12 text-center">
                    <div className="grid size-10 place-items-center rounded-lg bg-muted">
                      <WrenchIcon className="size-5 text-muted-foreground" />
                    </div>
                    <div className="grid gap-1">
                      <p className="text-base font-medium">
                        {configuredCount === 0 ? "No tools found" : "No matching tools"}
                      </p>
                      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                        {configuredCount === 0
                          ? "This agent has no attached tools yet. Add a webhook to call your own API, or connect an MCP server to import its tools."
                          : "Try a different search term or type filter."}
                      </p>
                    </div>
                    {configuredCount === 0 ? (
                      <Button className="mt-1" size="sm" onClick={openCreate}>
                        <PlusIcon className="size-4" />
                        Add tool
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {items.map((tool) => (
                  <ToolRow
                    key={tool.id}
                    tool={tool}
                    isToggling={setAttached.isPending || toggleEnabled.isPending}
                    onToggleAttached={(attached) =>
                      handleToggleAttached(tool.id, tool.enabled, attached)
                    }
                    onOpenDetail={() =>
                      tool.origin === "HTTP" ? void openEdit(tool.id) : openDetail(tool.id)
                    }
                    onDelete={tool.origin === "HTTP" ? () => handleDelete(tool.id) : undefined}
                  />
                ))}
              </div>
            </div>

            <SystemToolsCard tools={allTools} />
          </div>
        )}
      </section>

      <ToolSheet
        open={sheetOpen}
        onOpenChange={(open) => !open && closeSheet()}
        tool={openTool}
        form={form}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        onSubmit={handleSubmit}
        isPending={createTool.isPending || updateTool.isPending}
        hasBearerToken={hasBearerToken}
        hasSecretHeaders={hasSecretHeaders}
        onTest={openTool?.origin === "HTTP" ? handleTest : undefined}
        isTesting={testTool.isPending}
        testResult={testResult}
        log={toolCalls.data}
        isLogPending={toolCalls.isPending}
        onSaveUsage={
          aiAgentId && editingId
            ? (usageInstruction) =>
                setUsage.mutate(
                  { aiAgentId, toolId: editingId, usageInstruction },
                  {
                    onError: (error) =>
                      toast.error(
                        error instanceof Error ? error.message : "Failed to save the guidance.",
                      ),
                    onSuccess: () => toast.success("Guidance saved."),
                  },
                )
            : undefined
        }
        isSavingUsage={setUsage.isPending}
      />
    </PlatformAppShell>
  );
};

export default ToolsView;
