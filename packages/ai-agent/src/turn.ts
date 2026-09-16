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

// ponytail: reuses the Tool budget's own 60s magnitude (see tools.ts) rather than
// inventing a second tuned number — one clock for the whole attempt, not just its
// Tool calls, since a model call with no Tools has never had a ceiling at all.
// A timed-out attempt never retries (see below), so this is also the stated
// worst-case wall clock for a turn that produces no output at all. A turn that
// fails fast with no output still gets one retry, also bounded by this clock,
// so the absolute worst case — a fast failure followed by a full timeout, or
// vice versa — is 2x this.
const TURN_TIMEOUT_MS = 60_000;

class AiAgentTurnTimeoutError extends Error {
  constructor() {
    super(`The AI Agent did not finish its turn within ${TURN_TIMEOUT_MS}ms.`);
    this.name = "AiAgentTurnTimeoutError";
  }
}

function withTurnTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new AiAgentTurnTimeoutError()), TURN_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

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
        let deltaPublished = false;
        let timedOut = false;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            decision = await withTurnTimeout(
              streamReply({
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
                  deltaPublished = true;
                  if (!timedOut && params.runtime.isActive()) {
                    return params.runtime.publishDelta(delta, provisionalId);
                  }
                },
                onMessages: params.runtime.saveMemory,
                onResult: params.onResult,
                resolutionMessage: ticket.resolutionMessage,
                sessionId: ticket.sessionId,
                tools,
                userId: ticket.userId,
              }),
            );
            break;
          } catch (error) {
            lastError = error;
            // A retry restarts the reply from scratch. Once the Customer has
            // already seen part of it stream in, restarting would replace a
            // reply they are mid-way through reading — worse than escalating
            // once. And an attempt that already burned the full time budget
            // gains nothing from doubling that wait, so a timeout never
            // retries either way; only a fast, empty failure does.
            if (deltaPublished || error instanceof AiAgentTurnTimeoutError) break;
          }
        }
        if (!decision) {
          if (lastError instanceof AiAgentTurnTimeoutError) {
            timedOut = true;
            run.setAttributes({
              "ai_agent.decision": "ESCALATE",
              "ai_agent.escalation_reason": "AI_TIMEOUT",
            });
            await params.runtime.escalate("AI_TIMEOUT");
            return;
          }
          throw lastError ?? new ReplyGenerationFailedError();
        }
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
