import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { classifyExplicitMutationRequest, type ReplyModel } from "@repo/ai-agent";
import { createOpenAiEmbeddingClient } from "@repo/knowledge";
import { embeddingConfig } from "../../config";
import { executeMcpTool } from "../mcp/services";
import { unscopedPrisma } from "../../utils/prisma";
import { executeHttpTool } from "./execution";
import { executeBuiltInTool, resolveTools } from "./services";

export type AssignedTool = Awaited<ReturnType<typeof resolveTools>>[number];

/** AI Activity metadata lives in a Prisma `Json` column: cap free-form fields
 * so one oversized Tool input or failure message cannot bloat the row. */
const MAX_METADATA_STRING = 2000;

function clippedInputJson(input: unknown) {
  if (input === null || input === undefined) return undefined;
  try {
    const json = JSON.stringify(input) ?? "";
    return json.length <= MAX_METADATA_STRING ? json : `${json.slice(0, MAX_METADATA_STRING)}…`;
  } catch {
    return undefined;
  }
}

/** One Tool call's AI Activity row. `inputJson` carries the model's serialized
 * arguments and `error` the executor's failure message, both clipped, so the
 * Activity Timeline can show what a Tool was asked and why it failed. */
async function recordToolActivity(params: {
  error?: unknown;
  input: unknown;
  latencyMs: number;
  outcome: "SUCCESS" | "FAILED";
  ticketId: string;
  tool: AssignedTool;
  workspaceId: string;
}) {
  const inputJson = clippedInputJson(params.input);
  let failureMessage: string | undefined;
  if (params.outcome === "FAILED") {
    const message =
      params.error instanceof Error ? params.error.message : String(params.error ?? "");
    if (message) {
      failureMessage =
        message.length <= MAX_METADATA_STRING
          ? message
          : `${message.slice(0, MAX_METADATA_STRING)}…`;
    }
  }
  const metadata: Prisma.InputJsonObject = {
    latencyMs: params.latencyMs,
    origin: params.tool.origin,
    outcome: params.outcome,
    risk: params.tool.risk,
    tool: params.tool.name,
    toolId: params.tool.id,
    ...(inputJson === undefined ? null : { inputJson }),
    ...(failureMessage === undefined ? null : { error: failureMessage }),
  };
  await unscopedPrisma.aiActivity.create({
    data: {
      eventType: params.outcome === "SUCCESS" ? "TOOL_CALLED" : "TOOL_FAILED",
      id: randomUUID(),
      metadata,
      ticketId: params.ticketId,
      workspaceId: params.workspaceId,
    },
  });
}

/** Dispatches an assigned Tool call to its origin-specific executor. A
 * MUTATING or MUTATING_IRREVERSIBLE Tool is denied unless
 * {@link classifyExplicitMutationRequest} confirms the Customer actually
 * authorized it this turn; a denial surfaces as a Tool Result, never a crash.
 * `model`/`customerMessage`/`getPriorAiMessage` are only required for those
 * two risk tiers — a READ_ONLY-only caller (e.g. `executeReadOnlyAssignedTools`)
 * can omit them, and omitting them denies by default if a risky Tool slips
 * through anyway. */
async function dispatchTool(params: {
  aiAgentId: string;
  customerMessage?: string;
  getPriorAiMessage?: () => Promise<string | null>;
  input: unknown;
  model?: ReplyModel;
  ticketId: string;
  tool: AssignedTool;
}): Promise<string> {
  const { tool } = params;
  if (tool.risk !== "READ_ONLY") {
    const requireConfirmation = tool.risk === "MUTATING_IRREVERSIBLE";
    if (!params.model || params.customerMessage === undefined) {
      throw new Error(
        "Mutating Tool requires an explicit Customer request in the current message.",
      );
    }
    const priorAiMessage = (await params.getPriorAiMessage?.()) ?? null;
    const explicit = await classifyExplicitMutationRequest({
      customerMessage: params.customerMessage,
      model: params.model,
      priorAiMessage,
      requireConfirmation,
      toolDescription: tool.description,
      toolName: tool.name,
    });
    if (!explicit) {
      throw new Error(
        requireConfirmation
          ? "This Tool is irreversible: propose the exact action to the Customer first and wait for their explicit confirmation in a later message before calling it."
          : "Mutating Tool requires an explicit Customer request in the current message.",
      );
    }
  }
  if (tool.origin === "BUILT_IN") {
    const query = (params.input as { query?: unknown } | null)?.query;
    if (typeof query !== "string" || !query.trim()) {
      throw new Error("This Tool requires a non-empty query.");
    }
    if (!embeddingConfig.apiKey) throw new Error("Embedding client is not configured.");
    const [embedding] = await createOpenAiEmbeddingClient({
      ...embeddingConfig,
      apiKey: embeddingConfig.apiKey,
    }).embed([query]);
    const result = await executeBuiltInTool({
      aiAgentId: params.aiAgentId,
      embedding: embedding ?? [],
      ticketId: params.ticketId,
      toolName: tool.name as "searchKnowledge" | "searchCustomerTicketHistory",
    });
    return JSON.stringify(result);
  }
  if (tool.origin === "HTTP") {
    return executeHttpTool({
      explicitCustomerRequest: tool.risk === "READ_ONLY" ? undefined : true,
      input: params.input,
      ticketId: params.ticketId,
      toolId: tool.id,
    });
  }
  const result = await executeMcpTool(
    tool.id,
    params.aiAgentId,
    (params.input ?? {}) as Record<string, unknown>,
  );
  return JSON.stringify(result);
}

/** Executes every READ_ONLY assigned Tool with the same input (used by AI
 * Copilot's Suggested Reply, which has no model-directed tool-calling loop of
 * its own). MUTATING Tools are always excluded, defensively, even if the
 * caller already filtered its Tool list. Returns `{ toolName: result }`. */
export async function executeReadOnlyAssignedTools(params: {
  aiAgentId: string;
  input: unknown;
  ticketId: string;
  tools: readonly AssignedTool[];
  workspaceId: string;
}): Promise<Record<string, string>> {
  const readOnlyTools = params.tools.filter((tool) => tool.risk === "READ_ONLY");
  const entries = await Promise.all(
    readOnlyTools.map(async (tool) => {
      const startedAt = Date.now();
      try {
        const result = await dispatchTool({
          aiAgentId: params.aiAgentId,
          input: params.input,
          ticketId: params.ticketId,
          tool,
        });
        await recordToolActivity({
          input: params.input,
          latencyMs: Date.now() - startedAt,
          outcome: "SUCCESS",
          ticketId: params.ticketId,
          tool,
          workspaceId: params.workspaceId,
        });
        return [tool.name, result] as const;
      } catch (error) {
        await recordToolActivity({
          error,
          input: params.input,
          latencyMs: Date.now() - startedAt,
          outcome: "FAILED",
          ticketId: params.ticketId,
          tool,
          workspaceId: params.workspaceId,
        });
        throw error;
      }
    }),
  );
  return Object.fromEntries(entries);
}

/** Descriptors for every assigned Tool the model may call. The Admin's usage instruction is
 * appended to the description, because a Tool description is the only thing that steers model
 * Tool selection. */
export function describeAssignedTools(tools: readonly AssignedTool[]) {
  return tools.map((tool) => ({
    description: tool.usageInstruction
      ? `${tool.description}\n\nWhen to use: ${tool.usageInstruction}`
      : tool.description,
    id: tool.id,
    inputSchema: tool.inputSchema,
    name: tool.name,
  }));
}

/** Builds the executor Anvia calls for every model-directed Tool call in this
 * turn. `customerMessage` and `model` let a MUTATING/MUTATING_IRREVERSIBLE
 * Tool call be judged by {@link classifyExplicitMutationRequest} instead of
 * being denied outright. The prior AI Agent message lets a short confirmation
 * such as "yes please" authorize the exact action just proposed. */
export function createAssignedToolExecutor(params: {
  aiAgentId: string;
  customerMessage: string;
  getPriorAiMessage: () => Promise<string | null>;
  model: ReplyModel;
  ticketId: string;
  tools: readonly AssignedTool[];
  workspaceId: string;
}) {
  return async ({ input, toolId }: { input: unknown; toolId: string }) => {
    const tool = params.tools.find((item) => item.id === toolId);
    if (!tool) throw new Error("Tool not found.");
    const startedAt = Date.now();
    try {
      const result = await dispatchTool({
        aiAgentId: params.aiAgentId,
        customerMessage: params.customerMessage,
        getPriorAiMessage: params.getPriorAiMessage,
        input,
        model: params.model,
        ticketId: params.ticketId,
        tool,
      });
      await recordToolActivity({
        input,
        latencyMs: Date.now() - startedAt,
        outcome: "SUCCESS",
        ticketId: params.ticketId,
        tool,
        workspaceId: params.workspaceId,
      });
      return result;
    } catch (error) {
      await recordToolActivity({
        error,
        input,
        latencyMs: Date.now() - startedAt,
        outcome: "FAILED",
        ticketId: params.ticketId,
        tool,
        workspaceId: params.workspaceId,
      });
      throw error;
    }
  };
}
