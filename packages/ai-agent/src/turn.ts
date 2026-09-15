import { randomUUID } from "node:crypto";
import type { Message } from "@anvia/core";
import { sessionAttributes, withSpan } from "@repo/logger/telemetry";
import {
  createReplyModel,
  ReplyGenerationFailedError,
  streamReply,
  type ReplyDecision,
} from "./reply";
import {
  createAssignedTools,
  type AssignedToolDescriptor,
  type AssignedToolExecutor,
} from "./tools";

export type EscalationReason = NonNullable<ReplyDecision["escalationReason"]>;

type Source = { content: string; id: string };

export type AiAgentTurnRuntime = {
  countClarifications(): Promise<number>;
  escalate(reason: EscalationReason): Promise<void>;
  finish(): Promise<void>;
  isActive(): boolean;
  loadMemory(): Promise<Message[]>;
  loadTicket(): Promise<{ instructions?: string; sessionId: string; userId: string } | null>;
  publishDelta(delta: string, provisionalId: string): Promise<void> | void;
  reply(decision: "CLARIFY" | "REPLY", content: string, provisionalId: string): Promise<void>;
  resolve(): Promise<void>;
  retrieve(): Promise<{ attachments: Source[] }>;
  saveMemory(messages: Message[]): Promise<void>;
  start(): Promise<void>;
  tools(): Promise<{ descriptors: AssignedToolDescriptor[]; execute: AssignedToolExecutor }>;
};

export async function runAiAgentTurn(params: {
  customerMessage: string;
  modelConfig?: { apiKey: string; baseUrl?: string; modelId: string };
  runtime: AiAgentTurnRuntime;
  ticketId: string;
  workspaceId: string;
}) {
  const ticket = await params.runtime.loadTicket();
  if (!ticket) return;

  return withSpan(
    "ai_agent.turn",
    {
      ...sessionAttributes(ticket.sessionId, ticket.userId),
      "anvia.generation.model_id": params.modelConfig?.modelId ?? "unconfigured",
      "anvia.trace.name": "ai_agent.turn",
      "anvia.trace.tags": ["ai-agent", "customer-support"],
      "langfuse.trace.name": "ai_agent.turn",
      "langfuse.trace.tags": ["ai-agent", "customer-support"],
      "langfuse.trace.metadata.ticket_id": params.ticketId,
      "langfuse.trace.metadata.workspace_id": params.workspaceId,
      "supportops.ticket_id": params.ticketId,
      "supportops.workspace_id": params.workspaceId,
    },
    async (run) => {
      if (!params.modelConfig) {
        await params.runtime.escalate("AI_GENERATION_FAILED");
        return;
      }

      const provisionalId = randomUUID();
      await params.runtime.start();
      try {
        const { attachments } = await withSpan(
          "ai_agent.retrieve_knowledge",
          {},
          async (retrieval) => {
            const result = await params.runtime.retrieve();
            retrieval.setAttribute("ai_agent.attachments", result.attachments.length);
            return result;
          },
        );
        const clarificationCount = await params.runtime.countClarifications();
        const messages = await params.runtime.loadMemory();
        const assignedTools = await params.runtime.tools();
        run.setAttribute("ai_agent.assigned_tools", assignedTools.descriptors.length);

        const model = createReplyModel(params.modelConfig);
        const tools = createAssignedTools(assignedTools.descriptors, assignedTools.execute);
        let decision: ReplyDecision | undefined;
        let lastError: unknown;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            decision = await streamReply({
              attachments,
              clarificationCount,
              customerMessage: params.customerMessage,
              instructions: ticket.instructions,
              messages,
              model,
              onDelta: (delta) => {
                if (params.runtime.isActive()) {
                  return params.runtime.publishDelta(delta, provisionalId);
                }
              },
              onMessages: params.runtime.saveMemory,
              sessionId: ticket.sessionId,
              tools,
              userId: ticket.userId,
            });
            break;
          } catch (error) {
            lastError = error;
          }
        }
        if (!decision) throw lastError ?? new ReplyGenerationFailedError();
        run.setAttributes({
          "ai_agent.decision": decision.decision,
          ...(decision.escalationReason
            ? { "ai_agent.escalation_reason": decision.escalationReason }
            : {}),
        });

        if (
          decision.decision === "ESCALATE" ||
          (decision.decision === "CLARIFY" && clarificationCount >= 2)
        ) {
          const reason =
            decision.decision === "CLARIFY"
              ? "AI_FAILED_ATTEMPTS"
              : (decision.escalationReason ?? "NO_RELEVANT_KNOWLEDGE");
          run.setAttribute("ai_agent.escalation_reason", reason);
          await params.runtime.escalate(reason);
        } else if (decision.decision === "RESOLVE") {
          await params.runtime.resolve();
        } else {
          if (!decision.content) throw new ReplyGenerationFailedError();
          await params.runtime.reply(decision.decision, decision.content, provisionalId);
        }
      } catch (error) {
        run.recordException(error instanceof Error ? error : new Error(String(error)));
        run.setAttributes({
          "ai_agent.decision": "ESCALATE",
          "ai_agent.escalation_reason": "AI_GENERATION_FAILED",
        });
        await params.runtime.escalate("AI_GENERATION_FAILED");
      } finally {
        await params.runtime.finish();
      }
    },
  );
}
