import { randomUUID } from "node:crypto";
import type { AgentResponse, Message } from "@anvia/core";
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
  escalate(reason: EscalationReason, content?: string): Promise<void>;
  finish(): Promise<void>;
  isActive(): boolean;
  loadMemory(): Promise<Message[]>;
  loadTicket(): Promise<{
    instructions?: string;
    resolutionMessage?: string;
    sessionId: string;
    userId: string;
  } | null>;
  publishDelta(delta: string, provisionalId: string): Promise<void> | void;
  reply(decision: "CLARIFY" | "REPLY", content: string, provisionalId: string): Promise<void>;
  resolve(content: string): Promise<void>;
  retrieve(): Promise<{ attachments: Source[] }>;
  saveMemory(messages: Message[]): Promise<void>;
  start(): Promise<void>;
  tools(): Promise<{ descriptors: AssignedToolDescriptor[]; execute: AssignedToolExecutor }>;
};

export async function runAiAgentTurn(params: {
  customerMessage: string;
  modelConfig?: {
    apiKey: string;
    baseUrl?: string;
    maxOutputTokens?: number;
    modelId: string;
    reasoningEffort?: string;
  };
  onResult?(result: AgentResponse<ReplyDecision>): Promise<void> | void;
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
        // Four independent loads, none of which consumes another's output.
        // Awaited in sequence they were four serial round trips in front of the
        // first model token, which is the part of the turn the Customer feels.
        const [{ attachments }, clarificationCount, messages, assignedTools] = await Promise.all([
          withSpan("ai_agent.retrieve_knowledge", {}, async (retrieval) => {
            const result = await params.runtime.retrieve();
            retrieval.setAttribute("ai_agent.attachments", result.attachments.length);
            return result;
          }),
          params.runtime.countClarifications(),
          params.runtime.loadMemory(),
          params.runtime.tools(),
        ]);
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
              ...(params.modelConfig.reasoningEffort
                ? { controls: { reasoningEffort: params.modelConfig.reasoningEffort } }
                : {}),
              ...(params.modelConfig.maxOutputTokens
                ? { maxOutputTokens: params.modelConfig.maxOutputTokens }
                : {}),
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
              onResult: params.onResult,
              resolutionMessage: ticket.resolutionMessage,
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
          await params.runtime.escalate(
            reason,
            decision.decision === "ESCALATE" ? (decision.content ?? undefined) : undefined,
          );
        } else if (decision.decision === "RESOLVE") {
          if (!decision.content) throw new ReplyGenerationFailedError();
          await params.runtime.resolve(decision.content);
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
