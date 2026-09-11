import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { Textarea } from "@repo/ui/components/textarea";
import { toast } from "@repo/ui/components/sonner";
import type { HttpMethod, ToolRisk } from "@repo/api-client";
import { CheckIcon, CodeIcon, CopyIcon, PlayIcon } from "lucide-react";
import { useState } from "react";
import type { HttpToolFormState } from "../../tools.types";
import type { ToolSheetProps } from "./index.types";

const methods: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const originLabel = { BUILT_IN: "System", HTTP: "Webhook", MCP: "MCP" } as const;

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const failureMessage: Record<string, string> = {
  DENIED: "This webhook is not configured for testing.",
  HTTP: "The endpoint answered with an error status.",
  NETWORK:
    "Could not reach the endpoint. Check the URL and that it is publicly reachable over HTTPS.",
  OVERSIZED_RESULT: "The response was too large to read.",
  TIMEOUT: "The endpoint did not answer in time.",
  VALIDATION: "The sample input does not match the input schema.",
};

/** The subset of the form that round-trips through the JSON editor. Secrets stay out of it —
 * they are write-only and never rendered back. */
const jsonFields = ["name", "description", "method", "url", "risk", "inputSchema"] as const;

function toJson(form: HttpToolFormState) {
  let inputSchema: unknown = form.inputSchema;
  try {
    inputSchema = JSON.parse(form.inputSchema);
  } catch {
    // Leave the raw text in place so an in-progress schema is not silently dropped.
  }
  return JSON.stringify(
    {
      name: form.name,
      description: form.description,
      method: form.method,
      url: form.url,
      risk: form.risk,
      inputSchema,
    },
    null,
    2,
  );
}

export default function ToolSheet({
  open,
  onOpenChange,
  tool,
  form,
  onChange,
  onSubmit,
  isPending,
  hasBearerToken,
  hasSecretHeaders,
  onTest,
  isTesting,
  testResult,
  log,
  isLogPending,
  onSaveUsage,
  isSavingUsage,
}: ToolSheetProps) {
  const [jsonDraft, setJsonDraft] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [sampleInput, setSampleInput] = useState("{}");
  const [copied, setCopied] = useState(false);
  const [usage, setUsage] = useState<string | null>(null);
  const editable = !tool || tool.origin === "HTTP";

  function toggleJsonMode() {
    if (jsonDraft === null) {
      setJsonDraft(toJson(form));
      setJsonError(null);
      return;
    }
    setJsonDraft(null);
    setJsonError(null);
  }

  function applyJson(next: string) {
    setJsonDraft(next);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(next) as Record<string, unknown>;
    } catch {
      setJsonError("Not valid JSON yet.");
      return;
    }
    setJsonError(null);
    const patch: Partial<HttpToolFormState> = {};
    for (const key of jsonFields) {
      const value = parsed[key];
      if (value === undefined) continue;
      if (key === "inputSchema") patch.inputSchema = JSON.stringify(value, null, 2);
      else if (typeof value === "string") patch[key] = value as never;
    }
    onChange(patch);
  }

  async function copyId() {
    if (!tool) return;
    try {
      await navigator.clipboard.writeText(tool.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy the tool ID.");
    }
  }

  const meta = tool ? (
    <aside className="grid content-start gap-5 border-b p-5 lg:border-r lg:border-b-0">
      <div className="grid gap-1">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Tool ID
        </p>
        <button
          type="button"
          className="flex items-center gap-2 text-left font-mono text-xs break-all text-muted-foreground hover:text-foreground"
          onClick={() => void copyId()}
        >
          {tool.id}
          {copied ? (
            <CheckIcon className="size-3.5 shrink-0" />
          ) : (
            <CopyIcon className="size-3.5 shrink-0" />
          )}
        </button>
      </div>
      <div className="grid gap-1">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Stats
        </p>
        {isLogPending ? (
          <Skeleton className="h-4 w-32" />
        ) : (
          <p className="text-[13px] text-muted-foreground">
            {log?.stats.total
              ? `${log.stats.total} calls · ${log.stats.avgLatencyMs} ms average${log.stats.failed ? ` · ${log.stats.failed} failed` : ""}`
              : "Never called yet"}
          </p>
        )}
      </div>
      <div className="grid gap-1">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Status
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={tool.assigned ? "default" : "outline"}>
            {tool.assigned ? "On for this agent" : "Off"}
          </Badge>
          <Badge variant={tool.risk === "MUTATING" ? "secondary" : "outline"}>
            {tool.risk === "MUTATING" ? "Requires approval" : "Read only"}
          </Badge>
          {tool.availability === "AVAILABLE" ? null : <Badge variant="destructive">Disconnected</Badge>}
        </div>
      </div>
    </aside>
  ) : null;

  /** The agent picks its own tools from what it reads here, so this is the one place an Admin
   * can steer that choice. It is per agent, which is why it lives beside the assignment
   * switch rather than in the Tool definition. */
  const usagePanel =
    tool && onSaveUsage ? (
      <div className="grid gap-3 rounded-lg border bg-muted/30 p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">When to use this tool</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
            {tool.assigned
              ? "Added to what the agent reads about this tool, so it knows which requests call for it. Leave empty to rely on the description alone."
              : "Switch this tool on for the agent first — guidance only reaches the agent for tools it can call."}
          </p>
        </div>
        <Textarea
          aria-label="When to use this tool"
          disabled={!tool.assigned || isSavingUsage}
          maxLength={1000}
          rows={3}
          className="bg-background"
          placeholder="Use when the customer asks about their subscription, plan, or renewal date."
          value={usage ?? tool.usageInstruction ?? ""}
          onChange={(event) => setUsage(event.target.value)}
        />
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!tool.assigned || isSavingUsage || usage === null}
            onClick={() => {
              onSaveUsage(usage?.trim() ? usage.trim() : null);
              setUsage(null);
            }}
          >
            {isSavingUsage ? "Saving…" : "Save guidance"}
          </Button>
        </div>
      </div>
    ) : null;

  const testPanel = onTest ? (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Test tool</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
            Calls the endpoint once with the sample input below. No ticket or customer is involved,
            and the saved configuration is used — save your edits first.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isTesting}
          onClick={() => onTest(sampleInput)}
        >
          <PlayIcon className="size-3.5" />
          {isTesting ? "Testing…" : "Run test"}
        </Button>
      </div>
      <Textarea
        aria-label="Sample input"
        rows={3}
        className="bg-background font-mono text-xs"
        value={sampleInput}
        onChange={(event) => setSampleInput(event.target.value)}
      />
      {testResult ? (
        testResult.ok ? (
          <div className="grid gap-2">
            <p className="text-[13px] font-medium text-emerald-600 dark:text-emerald-400">
              {testResult.status} · {testResult.latencyMs} ms
            </p>
            <pre className="max-h-40 overflow-auto rounded-md border bg-background p-3 font-mono text-[11px] leading-5">
              {testResult.body || "(empty response)"}
            </pre>
          </div>
        ) : (
          <p className="text-[13px] text-destructive">
            {failureMessage[testResult.code] ?? "The test failed."}
          </p>
        )
      ) : null}
    </div>
  ) : null;

  const logsPanel = (
    <div className="grid gap-3">
      {isLogPending ? <Skeleton className="h-24 w-full rounded-lg" /> : null}
      {!isLogPending && !log?.calls.length ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          No calls recorded yet. Every time the agent uses this tool, the attempt shows up here with
          how long it took.
        </p>
      ) : null}
      {log?.calls.length ? (
        <>
          <p className="text-[13px] text-muted-foreground">
            The {log.stats.total} most recent calls · {log.stats.avgLatencyMs} ms average
            {log.stats.failed ? ` · ${log.stats.failed} failed` : ""}
          </p>
          <div className="overflow-hidden rounded-lg border">
            {log.calls.map((call) => (
              <div
                key={`${call.ticketId}-${call.at}`}
                className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5 text-[13px] last:border-b-0"
              >
                <span className="text-muted-foreground">{timeFormatter.format(new Date(call.at))}</span>
                <span className="font-mono text-xs text-muted-foreground">{call.latencyMs} ms</span>
                <Badge variant={call.succeeded ? "outline" : "destructive"}>
                  {call.succeeded ? "Succeeded" : "Failed"}
                </Badge>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-3xl"
      >
        <SheetHeader className="border-b p-5">
          <SheetTitle>{tool ? tool.name : "Add webhook tool"}</SheetTitle>
          <SheetDescription>
            {tool ? (
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{originLabel[tool.origin]}</Badge>
                <span className="truncate">{tool.description}</span>
              </span>
            ) : (
              "Describe to the agent how and when to use the tool. GET sends the input as query parameters; other methods send it as a JSON body."
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="grid lg:grid-cols-[16rem_1fr]">
          {meta}
          <div className="min-w-0 p-5">
            <Tabs defaultValue={editable ? "edit" : "logs"}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <TabsList>
                  {editable ? <TabsTrigger value="edit">Edit tool</TabsTrigger> : null}
                  {tool ? <TabsTrigger value="logs">Logs</TabsTrigger> : null}
                </TabsList>
                {editable ? (
                  <Button type="button" size="sm" variant="outline" onClick={toggleJsonMode}>
                    <CodeIcon className="size-4" />
                    {jsonDraft === null ? "Edit as JSON" : "Back to form"}
                  </Button>
                ) : null}
              </div>

              {editable ? (
                <TabsContent value="edit" className="mt-4">
                  <form className="grid gap-5" onSubmit={onSubmit}>
                    {jsonDraft !== null ? (
                      <Field>
                        <FieldLabel htmlFor="http-tool-json">Tool definition</FieldLabel>
                        <Textarea
                          id="http-tool-json"
                          rows={16}
                          className="font-mono text-xs"
                          value={jsonDraft}
                          onChange={(event) => applyJson(event.target.value)}
                        />
                        <FieldDescription className={jsonError ? "text-destructive" : undefined}>
                          {jsonError ?? "Edits apply to the form as you type. Secrets are edited in the form."}
                        </FieldDescription>
                      </Field>
                    ) : (
                      <>
                        <Field>
                          <FieldLabel htmlFor="http-tool-name">Name</FieldLabel>
                          <Input
                            id="http-tool-name"
                            required
                            maxLength={100}
                            value={form.name}
                            onChange={(event) => onChange({ name: event.target.value })}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="http-tool-description">Description</FieldLabel>
                          <Textarea
                            id="http-tool-description"
                            required
                            maxLength={2000}
                            value={form.description}
                            onChange={(event) => onChange({ description: event.target.value })}
                          />
                          <FieldDescription>
                            The agent reads this to decide when to call the tool.
                          </FieldDescription>
                        </Field>
                        <div className="grid grid-cols-[auto_1fr] gap-3">
                          <Field>
                            <FieldLabel htmlFor="http-tool-method">Method</FieldLabel>
                            <Select
                              value={form.method}
                              onValueChange={(value) => onChange({ method: value as HttpMethod })}
                            >
                              <SelectTrigger id="http-tool-method" className="w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {methods.map((method) => (
                                  <SelectItem key={method} value={method}>
                                    {method}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="http-tool-url">URL</FieldLabel>
                            <Input
                              id="http-tool-url"
                              required
                              type="url"
                              placeholder="https://api.example.com/v1"
                              value={form.url}
                              onChange={(event) => onChange({ url: event.target.value })}
                            />
                          </Field>
                        </div>
                        <Field>
                          <FieldLabel htmlFor="http-tool-risk">Approval</FieldLabel>
                          <Select
                            value={form.risk}
                            onValueChange={(value) => onChange({ risk: value as ToolRisk })}
                          >
                            <SelectTrigger id="http-tool-risk">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="READ_ONLY">Read only</SelectItem>
                              <SelectItem value="MUTATING">Requires approval</SelectItem>
                            </SelectContent>
                          </Select>
                          <FieldDescription>
                            A read-only tool runs whenever the agent needs it. One that requires approval only
                            runs when the customer asks for that action in their own message.
                          </FieldDescription>
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="http-tool-schema">Input JSON Schema</FieldLabel>
                          <Textarea
                            id="http-tool-schema"
                            required
                            rows={6}
                            className="font-mono text-xs"
                            value={form.inputSchema}
                            onChange={(event) => onChange({ inputSchema: event.target.value })}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="http-tool-bearer">Bearer token</FieldLabel>
                          <Input
                            id="http-tool-bearer"
                            type="password"
                            placeholder={
                              hasBearerToken ? "Configured — leave blank to keep" : "Not configured"
                            }
                            value={form.bearerToken}
                            onChange={(event) =>
                              onChange({ bearerToken: event.target.value, clearBearerToken: false })
                            }
                          />
                          {hasBearerToken ? (
                            <FieldDescription>
                              <button
                                type="button"
                                className="text-destructive underline"
                                onClick={() => onChange({ bearerToken: "", clearBearerToken: true })}
                              >
                                {form.clearBearerToken ? "Will clear on save" : "Clear stored token"}
                              </button>
                            </FieldDescription>
                          ) : null}
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="http-tool-headers">Secret headers (JSON object)</FieldLabel>
                          <Textarea
                            id="http-tool-headers"
                            rows={3}
                            className="font-mono text-xs"
                            placeholder={
                              hasSecretHeaders ? "Configured — leave blank to keep" : '{"X-Api-Key":"..."}'
                            }
                            value={form.secretHeaders}
                            onChange={(event) =>
                              onChange({ secretHeaders: event.target.value, clearSecretHeaders: false })
                            }
                          />
                          {hasSecretHeaders ? (
                            <FieldDescription>
                              <button
                                type="button"
                                className="text-destructive underline"
                                onClick={() => onChange({ secretHeaders: "", clearSecretHeaders: true })}
                              >
                                {form.clearSecretHeaders ? "Will clear on save" : "Clear stored headers"}
                              </button>
                            </FieldDescription>
                          ) : null}
                        </Field>
                      </>
                    )}


                    {testPanel}

                    <div className="flex justify-end gap-2 border-t pt-5">
                      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isPending || Boolean(jsonError)}>
                        {isPending ? "Saving…" : tool ? "Save changes" : "Add tool"}
                      </Button>
                    </div>
                  </form>
                </TabsContent>
              ) : null}

              {tool ? (
                <TabsContent value="logs" className="mt-4">
                  {logsPanel}
                </TabsContent>
              ) : null}
            </Tabs>
            {usagePanel ? <div className="mt-5">{usagePanel}</div> : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
