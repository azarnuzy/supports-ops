import type { CompletionModel } from "@anvia/core";
import { createReplyModel } from "@repo/ai-agent";
import { aiAgentConfig, evalConfig } from "../../config";
import { gatewayModelId } from "../ai-agent/model-catalog";

/** Raised inside a metric when the Judge may not be called because Credits ran out. */
export class JudgeUnavailableError extends Error {
  constructor() {
    super("Credits ran out before the Judge could grade this Case.");
  }
}

/** What one Case's Judge did: how many calls succeeded (and were charged), and why it stopped. */
export type JudgeMeter = { calls: number; exhausted: boolean; failed: boolean };

export const judgeModelId = () => gatewayModelId(evalConfig.judgeModelId);

export function createJudgeBaseModel(): CompletionModel {
  if (!aiAgentConfig.apiKey) {
    throw new Error("COMPLETION_GATEWAY_API_KEY (or OPENROUTER_API_KEY) is required for the Judge.");
  }
  return createReplyModel({
    apiKey: aiAgentConfig.apiKey,
    baseUrl: aiAgentConfig.baseUrl,
    modelId: judgeModelId(),
  });
}

/**
 * Wraps a Judge model so every metric's calls are metered and paid for, however many a metric
 * makes. Before each call it asks `canCall` (Credit Exhaustion stops Judge work); after each
 * *successful* call it charges, so a failed call costs nothing. Each call is charged as it
 * completes, which is what lets an interrupted Case keep exactly what it already spent.
 */
export function meterJudge(
  model: CompletionModel,
  hooks: {
    canCall: () => Promise<boolean>;
    charge: (usage: {
      cachedInputTokens: number;
      inputTokens: number;
      outputTokens: number;
    }) => Promise<void>;
  },
) {
  const meter: JudgeMeter = { calls: 0, exhausted: false, failed: false };
  const metered = new Proxy(model, {
    get(target, property) {
      if (property !== "completion") {
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return async (...args: Parameters<CompletionModel["completion"]>) => {
        if (!(await hooks.canCall())) {
          meter.exhausted = true;
          throw new JudgeUnavailableError();
        }
        let response: Awaited<ReturnType<CompletionModel["completion"]>>;
        try {
          response = await target.completion(...args);
        } catch (error) {
          meter.failed = true;
          throw error;
        }
        await hooks.charge(response.usage);
        meter.calls += 1;
        return response;
      };
    },
  });
  return { meter, model: metered };
}
