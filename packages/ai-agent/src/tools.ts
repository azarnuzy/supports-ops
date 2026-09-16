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

// ponytail: fixed budget, not per-workspace/agent tunable; add a config knob if a
// customer's tool mix genuinely needs a different ceiling than this.
const CALL_BUDGET = 15;
const TIME_BUDGET_MS = 60_000;

/** Wraps optional assigned Tools as Anvia Tools for model-directed calls. Enforces
 * the shared per-Customer-Message budget: at most fifteen calls and 60 seconds total
 * across every Tool this Agent is given — generous enough that legitimate multi-hop
 * flows (knowledge + ticket history + a catalog lookup + cart/checkout, with retries)
 * never trip it, while still cutting off a runaway loop or a hung MCP server. Anvia
 * places each result into a `role: "tool"` message, so a Tool Result can never be
 * mistaken for an instruction. */
export function createAssignedTools(
  tools: readonly AssignedToolDescriptor[],
  execute: AssignedToolExecutor,
): AgentTools {
  const deadline = Date.now() + TIME_BUDGET_MS;
  let calls = 0;
  return tools.map((tool) => {
    const inputSchema = toInputSchema(tool.inputSchema);
    return createTool({
      description: inputSchema.described
        ? tool.description
        : `${tool.description}\n\nArguments JSON Schema: ${JSON.stringify(tool.inputSchema)}`,
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
      inputSchema: inputSchema.schema,
      name: tool.name,
    });
  });
}

/**
 * A Tool's arguments are stored as JSON Schema. Passing them to the provider as
 * the Tool's own parameter schema is what makes the model see them — and it is
 * paid for once. The previous shape sent `z.record(...)` as the schema and
 * repeated the full JSON Schema inside the description, so every request
 * carried the checkout schemas twice: ~13.5k tokens of Tool manifest for the
 * Northstar Workspace, against ~1.2k for the whole system prompt.
 *
 * `z.fromJSONSchema` rejects drafts and keywords it cannot represent, so a Tool
 * whose schema does not convert keeps the old description-carried form rather
 * than losing its arguments.
 */
function toInputSchema(jsonSchema: unknown): { described: boolean; schema: z.ZodType } {
  try {
    const converted = z.fromJSONSchema(jsonSchema as never);
    return { described: true, schema: converted as z.ZodType };
  } catch {
    return { described: false, schema: z.record(z.string(), z.unknown()) };
  }
}
