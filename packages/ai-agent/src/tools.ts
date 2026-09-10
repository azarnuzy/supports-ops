import { Agent, createTool } from "@anvia/core";
import { z } from "zod";

export type AgentTools = ConstructorParameters<typeof Agent>[0]["tools"];

export type AssignedToolDescriptor = {
  description: string;
  id: string;
  inputSchema: unknown;
  name: string;
};

export type AssignedToolExecutor = (params: { input: unknown; toolId: string }) => Promise<string>;

const CALL_BUDGET = 3;
const TIME_BUDGET_MS = 15_000;

/** Wraps optional assigned Tools as Anvia Tools for model-directed calls. Enforces
 * the shared per-Customer-Message budget: at most three calls and 15 seconds total
 * across every Tool this Agent is given. Anvia places each result into a `role:
 * "tool"` message, so a Tool Result can never be mistaken for an instruction. */
export function createAssignedTools(
  tools: readonly AssignedToolDescriptor[],
  execute: AssignedToolExecutor,
): AgentTools {
  const deadline = Date.now() + TIME_BUDGET_MS;
  let calls = 0;
  return tools.map((tool) =>
    createTool({
      description: `${tool.description}\n\nArguments JSON Schema: ${JSON.stringify(tool.inputSchema)}`,
      execute: async (input) => {
        if (calls >= CALL_BUDGET || Date.now() >= deadline) {
          return "Tool call budget exhausted for this Customer Message. Answer with what you already have, or ESCALATE.";
        }
        calls += 1;
        try {
          return await execute({ input, toolId: tool.id });
        } catch (error) {
          return `Tool call failed: ${error instanceof Error ? error.message : "unknown error"}.`;
        }
      },
      inputSchema: z.record(z.string(), z.unknown()),
      name: tool.name,
    }),
  );
}
