import { randomUUID } from "node:crypto";
import { executeMcpTool } from "../mcp/services";
import { unscopedPrisma } from "../../utils/prisma";
import { executeHttpTool } from "./execution";
import {
  executeBuiltInTool,
  resolveRequiredTool,
  resolveTools,
  type TicketCategory,
} from "./services";

export type AssignedTool = Awaited<ReturnType<typeof resolveTools>>[number];

export class RequiredToolFailedError extends Error {
  constructor(
    readonly toolName: string,
    options?: { cause?: unknown },
  ) {
    super(`Required Tool "${toolName}" failed.`, options);
    this.name = "RequiredToolFailedError";
  }
}

async function recordToolActivity(params: {
  latencyMs: number;
  outcome: "SUCCESS" | "FAILED";
  ticketId: string;
  tool: AssignedTool;
  workspaceId: string;
}) {
  await unscopedPrisma.aiActivity.create({
    data: {
      eventType: params.outcome === "SUCCESS" ? "TOOL_CALLED" : "TOOL_FAILED",
      id: randomUUID(),
      metadata: {
        latencyMs: params.latencyMs,
        origin: params.tool.origin,
        outcome: params.outcome,
        risk: params.tool.risk,
        tool: params.tool.name,
        toolId: params.tool.id,
      },
      ticketId: params.ticketId,
      workspaceId: params.workspaceId,
    },
  });
}

/** Dispatches an assigned Tool call to its origin-specific executor. Mutating
 * Tools are denied unless the current Customer Message explicitly requested one;
 * a denial surfaces as a Tool Result, never a crash. */
async function dispatchTool(params: {
  aiAgentId: string;
  explicitCustomerRequest: boolean;
  input: unknown;
  ticketId: string;
  tool: AssignedTool;
}): Promise<string> {
  const { tool } = params;
  if (tool.risk === "MUTATING" && !params.explicitCustomerRequest) {
    throw new Error("Mutating Tool requires an explicit Customer request in the current message.");
  }
  if (tool.origin === "BUILT_IN") {
    const result = await executeBuiltInTool({
      aiAgentId: params.aiAgentId,
      embedding: [],
      ticketId: params.ticketId,
      toolName: tool.name as "searchKnowledge" | "searchCustomerTicketHistory",
    });
    return JSON.stringify(result);
  }
  if (tool.origin === "HTTP") {
    return executeHttpTool({
      explicitCustomerRequest: params.explicitCustomerRequest,
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

/** Executes the Ticket Category's required Tool before response generation; its
 * successful result becomes Grounding. Failure, timeout, invalid, or oversized
 * result throws RequiredToolFailedError — the caller escalates with
 * BUSINESS_TOOL_FAILURE. Returns null when no policy applies to this category. */
export async function runRequiredTool(params: {
  aiAgentId: string;
  category: TicketCategory;
  ticketId: string;
  workspaceId: string;
}): Promise<{ id: string; name: string; result: string } | null> {
  const tool = await resolveRequiredTool(params.aiAgentId, params.category);
  if (!tool) return null;
  const startedAt = Date.now();
  try {
    const result = await dispatchTool({
      aiAgentId: params.aiAgentId,
      explicitCustomerRequest: false,
      input: {},
      ticketId: params.ticketId,
      tool,
    });
    await recordToolActivity({
      latencyMs: Date.now() - startedAt,
      outcome: "SUCCESS",
      ticketId: params.ticketId,
      tool,
      workspaceId: params.workspaceId,
    });
    return { id: tool.id, name: tool.name, result };
  } catch (error) {
    await recordToolActivity({
      latencyMs: Date.now() - startedAt,
      outcome: "FAILED",
      ticketId: params.ticketId,
      tool,
      workspaceId: params.workspaceId,
    });
    throw new RequiredToolFailedError(tool.name, { cause: error });
  }
}

/** Descriptors for every assigned Tool the model may call, excluding the
 * category's required Tool (already executed above). */
export function describeOptionalTools(tools: readonly AssignedTool[], requiredToolId?: string) {
  return tools
    .filter((tool) => tool.id !== requiredToolId)
    .map((tool) => ({
      description: tool.description,
      id: tool.id,
      inputSchema: tool.inputSchema,
      name: tool.name,
    }));
}

/**
 * ponytail: no Customer-intent detector exists yet to prove a Customer Message
 * explicitly requested a mutation, so every model-directed call passes
 * explicitCustomerRequest: false — safe today because every shipped demo Tool
 * is READ_ONLY. Wire a real intent signal (e.g. from classification) before
 * assigning a MUTATING Tool to an AI Agent for real.
 */
export function createOptionalToolExecutor(params: {
  aiAgentId: string;
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
        explicitCustomerRequest: false,
        input,
        ticketId: params.ticketId,
        tool,
      });
      await recordToolActivity({
        latencyMs: Date.now() - startedAt,
        outcome: "SUCCESS",
        ticketId: params.ticketId,
        tool,
        workspaceId: params.workspaceId,
      });
      return result;
    } catch (error) {
      await recordToolActivity({
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
