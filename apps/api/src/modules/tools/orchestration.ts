import { randomUUID } from "node:crypto";
import { executeMcpTool } from "../mcp/services";
import { unscopedPrisma } from "../../utils/prisma";
import { executeHttpTool } from "./execution";
import { executeBuiltInTool, resolveTools } from "./services";

export type AssignedTool = Awaited<ReturnType<typeof resolveTools>>[number];

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
          explicitCustomerRequest: false,
          input: params.input,
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
        return [tool.name, result] as const;
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

/**
 * ponytail: no Customer-intent detector exists yet to prove a Customer Message
 * explicitly requested a mutation, so every model-directed call passes
 * explicitCustomerRequest: false — safe today because every shipped demo Tool
 * is READ_ONLY. Wire a real intent signal (e.g. from classification) before
 * assigning a MUTATING Tool to an AI Agent for real.
 */
export function createAssignedToolExecutor(params: {
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
