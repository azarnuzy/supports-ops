import { randomUUID } from "node:crypto";
import { withSpan } from "@repo/logger/telemetry";
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
  loadTicket(): Promise<{ instructions?: string } | null>;
  publishDelta(delta: string, provisionalId: string): Promise<void> | void;
  reply(decision: "CLARIFY" | "REPLY", content: string, provisionalId: string): Promise<void>;
  resolve(): Promise<void>;
  retrieve(): Promise<{ attachments: Source[]; sources: Source[]; ticketContext: Source[] }>;
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
  return withSpan(
    "ai_agent.run",
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
      if (!params.modelConfig) {
        await params.runtime.escalate("AI_GENERATION_FAILED");
        return;
      }

      const provisionalId = randomUUID();
      await params.runtime.start();
      try {
        const { attachments, sources, ticketContext } = await withSpan(
          "ai_agent.retrieve_knowledge",
          {},
          async (retrieval) => {
            const result = await params.runtime.retrieve();
            retrieval.setAttributes({
              "ai_agent.attachments": result.attachments.length,
              "ai_agent.knowledge_chunks": result.sources.length,
              "ai_agent.ticket_knowledge_chunks": result.ticketContext.length,
            });
            return result;
          },
        );
        const clarificationCount = await params.runtime.countClarifications();
        const assignedTools = await params.runtime.tools();
        run.setAttribute("ai_agent.assigned_tools", assignedTools.descriptors.length);
        if (
          !sources.length &&
          !attachments.length &&
          !assignedTools.descriptors.length &&
          !looksLikeResolutionSignal(params.customerMessage)
        ) {
          run.setAttributes({
            "ai_agent.decision": "ESCALATE",
            "ai_agent.escalation_reason": "NO_RELEVANT_KNOWLEDGE",
          });
          await params.runtime.escalate("NO_RELEVANT_KNOWLEDGE");
          return;
        }

        const model = createReplyModel(params.modelConfig);
        const tools = createAssignedTools(assignedTools.descriptors, assignedTools.execute);
        let decision: ReplyDecision | undefined;
        let lastError: unknown;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            decision = await streamReply({
              clarificationCount,
              customerMessage: params.customerMessage,
              instructions: ticket.instructions,
              model,
              onDelta: (delta) => {
                if (params.runtime.isActive()) {
                  return params.runtime.publishDelta(delta, provisionalId);
                }
              },
              sources: [...sources, ...attachments],
              ticketContext,
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

function looksLikeResolutionSignal(content: string) {
  return /\b(?:thanks?|thank you|solved|resolved|fixed|working|works now|got it|all good|that('?s| is) (?:it|all)|makasih|terima kasih|sudah (?:selesai|beres|bisa|oke?)|beres|selesai|berhasil)\b/i.test(
    content,
  );
}
