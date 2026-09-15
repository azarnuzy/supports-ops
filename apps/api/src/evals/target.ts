import { randomUUID } from "node:crypto";
import {
  createReplyModel,
  runAiAgentTurn,
  type AgentMessage,
  type AiAgentTurnRuntime,
  type EscalationReason,
} from "@repo/ai-agent";
import { aiAgentConfig, embeddingConfig, evalConfig } from "../config";
import { unscopedPrisma } from "../utils/prisma";
import { withWorkspaceContext } from "../utils/workspace-context";
import { acknowledgementFor } from "../modules/ai-agent/turn";
import { createAssignedToolExecutor, describeAssignedTools } from "../modules/tools/orchestration";
import { resolveTools } from "../modules/tools/services";

/**
 * The eval suite runs the AI Agent exactly as production does — same
 * `runAiAgentTurn`, same `AiAgent.instructions`, same assigned Tools, same
 * agentic `searchKnowledge` retrieval over the Workspace's own Knowledge
 * Sources. Only the Runtime's side effects are swapped: replies, escalations,
 * and resolutions are captured in memory instead of being written to the
 * Ticket, published to the Widget, or queued for follow-up.
 *
 * That makes an Eval Case a real turn against the configured Workspace, which
 * is the point — the thing under evaluation is the Agent an Admin configured,
 * not a reconstruction of it. See ADR-0010.
 */

export type EvalToolCall = {
  failed: boolean;
  name: string;
  result: string;
};

export type EvalTurnOutput = {
  /** The Customer-visible reply text. `@anvia/core/evals`' text metrics read
   * this field by default, so `contains`/`exactMatch`/`gEval` need no selector. */
  output: string;
  decision: "REPLY" | "CLARIFY" | "ESCALATE" | "RESOLVE";
  escalationReason: EscalationReason | null;
  /** Knowledge passages the Agent actually retrieved this turn, in the order it
   * retrieved them. Fed to `faithfulness` as the retrieval context, so the
   * metric judges the answer against what retrieval really returned. */
  retrieved: string[];
  toolCalls: EvalToolCall[];
};

export type EvalTurnInput = {
  /** Prior turns, oldest first, when a case needs conversation history — a
   * Customer confirming a proposal, or a "thanks" that follows an answer. */
  history?: Array<{ content: string; role: "assistant" | "user" }>;
  message: string;
};

/** Tools the eval suite refuses to hand the Agent regardless of assignment.
 * These reach the live Northstar Outfitters store, and a suite that runs on
 * every prompt change must never create or complete a real checkout. Cases
 * about mutation assert that the Agent *asks or escalates*, which needs the
 * Tool offered but is graded on the Agent's own refusal — so only the
 * genuinely irreversible ones are withheld. */
const forbiddenToolPattern = /(complete|cancel)_checkout$|^.*_cancel_cart$/;

type EvalTicket = {
  aiAgentId: string;
  channelId: string;
  customerIdentityId: string;
  sessionId: string;
  ticketId: string;
  workspaceId: string;
};

let scratchTicket: EvalTicket | undefined;

/**
 * Creates the one scratch Ticket every Eval Case runs against. A Ticket row is
 * required because the production Tool path scopes retrieval and records AI
 * Activity by Ticket; reusing a single one keeps the Workspace's own Ticket
 * list from filling up with eval noise. Torn down by {@link teardownEvalTicket}.
 */
export async function setupEvalTicket(): Promise<EvalTicket> {
  if (scratchTicket) return scratchTicket;
  const workspaceId = evalConfig.workspaceId;
  if (!workspaceId) {
    throw new Error("EVAL_WORKSPACE_ID is required to run the eval suite.");
  }

  scratchTicket = await withWorkspaceContext(workspaceId, async () => {
    const channel = await unscopedPrisma.channel.findFirstOrThrow({
      select: { aiAgentId: true, id: true, type: true },
      where: { type: "WEB", workspaceId },
    });
    const customerIdentityId = randomUUID();
    const sessionId = randomUUID();
    const ticketId = randomUUID();

    await unscopedPrisma.customerIdentity.create({
      data: {
        canonicalId: customerIdentityId,
        channelType: channel.type,
        id: customerIdentityId,
        name: "Eval Suite",
        workspaceId,
      },
    });
    await unscopedPrisma.session.create({
      data: {
        channelId: channel.id,
        customerIdentityId,
        id: sessionId,
        workspaceId,
      },
    });
    await unscopedPrisma.conversation.create({
      data: {
        id: randomUUID(),
        metadata: {},
        scopeKey: `eval:${sessionId}`,
        sessionId,
        updatedAt: new Date(),
        userId: customerIdentityId,
        workspaceId,
      },
    });
    await unscopedPrisma.ticket.create({
      data: {
        aiAgentId: channel.aiAgentId,
        category: "GENERAL",
        channelId: channel.id,
        customerIdentityId,
        id: ticketId,
        priority: "NORMAL",
        sessionId,
        title: "AI Agent eval suite",
        workspaceId,
      },
    });

    return {
      aiAgentId: channel.aiAgentId,
      channelId: channel.id,
      customerIdentityId,
      sessionId,
      ticketId,
      workspaceId,
    };
  });

  return scratchTicket;
}

/** Removes the scratch Ticket and everything written against it, so a run
 * leaves the Workspace exactly as it found it. */
export async function teardownEvalTicket(): Promise<void> {
  const ticket = scratchTicket;
  if (!ticket) return;
  scratchTicket = undefined;
  await withWorkspaceContext(ticket.workspaceId, async () => {
    await unscopedPrisma.aiActivity.deleteMany({ where: { ticketId: ticket.ticketId } });
    await unscopedPrisma.message.deleteMany({ where: { ticketId: ticket.ticketId } });
    await unscopedPrisma.ticket.delete({ where: { id: ticket.ticketId } });
    await unscopedPrisma.conversation.deleteMany({ where: { sessionId: ticket.sessionId } });
    await unscopedPrisma.message.deleteMany({ where: { sessionId: ticket.sessionId } });
    await unscopedPrisma.session.delete({ where: { id: ticket.sessionId } });
    await unscopedPrisma.customerIdentity.delete({ where: { id: ticket.customerIdentityId } });
  });
}

/** Runs one Customer Message through the configured AI Agent and reports what
 * it did, without persisting the outcome to the Ticket. */
export async function runEvalTurn(input: EvalTurnInput): Promise<EvalTurnOutput> {
  const ticket = await setupEvalTicket();
  const modelConfig =
    aiAgentConfig.apiKey && embeddingConfig.apiKey
      ? { ...aiAgentConfig, apiKey: aiAgentConfig.apiKey }
      : undefined;
  if (!modelConfig) {
    throw new Error(
      "COMPLETION_GATEWAY_API_KEY (or OPENROUTER_API_KEY) and OPENROUTER_API_KEY are both required: the Agent needs a completion model and an embedding model.",
    );
  }

  let text = "";
  let decision: EvalTurnOutput["decision"] = "REPLY";
  let escalationReason: EscalationReason | null = null;
  let resolutionMessage: string | null = null;
  const retrieved: string[] = [];
  const toolCalls: EvalToolCall[] = [];
  const memory: AgentMessage[] = (input.history ?? []).map((turn) => ({
    content: turn.content,
    role: turn.role,
  })) as AgentMessage[];

  await withWorkspaceContext(ticket.workspaceId, async () => {
    const runtime: AiAgentTurnRuntime = {
      countClarifications: async () => 0,
      escalate: async (reason) => {
        decision = "ESCALATE";
        escalationReason = reason;
        // An escalation is not a silent turn: production sends the Customer an
        // acknowledgement. Reporting it keeps the graded text equal to what a
        // Customer would actually read.
        text = acknowledgementFor(input.message);
      },
      finish: async () => {},
      isActive: () => true,
      loadMemory: async () => memory,
      loadTicket: async () => {
        const loaded = await unscopedPrisma.ticket.findUniqueOrThrow({
          select: { aiAgent: { select: { instructions: true, resolutionMessage: true } } },
          where: { id: ticket.ticketId },
        });
        resolutionMessage = loaded.aiAgent.resolutionMessage;
        return {
          instructions: loaded.aiAgent.instructions ?? undefined,
          sessionId: ticket.sessionId,
          userId: ticket.customerIdentityId,
        };
      },
      publishDelta: () => {},
      reply: async (replyDecision, content) => {
        decision = replyDecision;
        text = content;
      },
      resolve: async () => {
        decision = "RESOLVE";
        text = resolutionMessage ?? "This conversation has been resolved.";
      },
      // Ticket Attachments only; Knowledge is retrieved agentically via the
      // searchKnowledge Tool, exactly as it is in production.
      retrieve: async () => ({ attachments: [] }),
      saveMemory: async () => {},
      start: async () => {},
      tools: async () => {
        const assigned = (await resolveTools(ticket.aiAgentId)).filter(
          (tool) => !forbiddenToolPattern.test(tool.name),
        );
        const execute = createAssignedToolExecutor({
          aiAgentId: ticket.aiAgentId,
          customerMessage: input.message,
          getPriorAiMessage: async () =>
            [...memory]
              .reverse()
              .find((entry) => entry.role === "assistant")
              ?.content?.toString() ?? null,
          model: createReplyModel(modelConfig),
          ticketId: ticket.ticketId,
          tools: assigned,
          workspaceId: ticket.workspaceId,
        });
        return {
          descriptors: describeAssignedTools(assigned),
          execute: async ({ input: toolInput, toolId }) => {
            const tool = assigned.find((item) => item.id === toolId);
            const name = tool?.name ?? toolId;
            try {
              const result = await execute({ input: toolInput, toolId });
              toolCalls.push({ failed: false, name, result });
              if (tool?.name === "searchKnowledge") retrieved.push(...knowledgePassages(result));
              return result;
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              toolCalls.push({ failed: true, name, result: message });
              throw error;
            }
          },
        };
      },
    };

    await runAiAgentTurn({
      customerMessage: input.message,
      modelConfig,
      runtime,
      ticketId: ticket.ticketId,
      workspaceId: ticket.workspaceId,
    });
  });

  return { decision, escalationReason, output: text, retrieved, toolCalls };
}

/** `searchKnowledge` returns JSON-encoded chunk rows; faithfulness needs their
 * text. A shape we do not recognise is passed through whole rather than
 * silently dropped, so a changed Tool Result shows up as a failing case
 * instead of an empty retrieval context. */
function knowledgePassages(result: string): string[] {
  try {
    const parsed: unknown = JSON.parse(result);
    if (!Array.isArray(parsed)) return [result];
    return parsed.map((row) => {
      const content = (row as { content?: unknown } | null)?.content;
      return typeof content === "string" ? content : JSON.stringify(row);
    });
  } catch {
    return [result];
  }
}
