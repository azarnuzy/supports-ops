import { randomUUID } from "node:crypto";
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
  loadTicket(): Promise<{ instructions?: string; sessionId: string } | null>;
  publishDelta(delta: string, provisionalId: string): Promise<void> | void;
  reply(decision: "CLARIFY" | "REPLY", content: string, provisionalId: string): Promise<void>;
  resolve(): Promise<void>;
  retrieve(): Promise<{ attachments: Source[] }>;
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
  // Anvia Lens lists traces by this name; a static "ai_agent.run" forced
  // opening every trace to find the right session. The Customer's message
  // makes the list itself searchable/skimmable.
  const traceName = `ai_agent.run: ${params.customerMessage.trim().slice(0, 60)}`;
  return withSpan(
    traceName,
    {
      "supportops.ticket_id": params.ticketId,
      "supportops.workspace_id": params.workspaceId,
    },
    async (run) => {
      const ticket = await params.runtime.loadTicket();
      if (!ticket) {
        run.setAttribute("ai_agent.decision", "SKIPPED");
        return;
      }
      // The Session, not the Ticket, is the conversation: it starts before the
      // Ticket exists and outlives every run on it, so it is what groups this
      // run with the Customer's earlier messages and the Human Agent's replies.
      run.setAttributes(sessionAttributes(ticket.sessionId));
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
              model,
              onDelta: (delta) => {
                if (params.runtime.isActive()) {
                  return params.runtime.publishDelta(delta, provisionalId);
                }
              },
              sessionId: ticket.sessionId,
              tools,
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
