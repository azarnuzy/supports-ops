#!/usr/bin/env node
import { createClassificationModel } from "../classification";
import { createReplyModel } from "../reply";
import { runEvals } from "./runner";
import { evalCategoryNames, type EvalCategoryName } from "./suites";

/**
 * Runs the AI Agent eval suite by hand — not in CI, per ADR-0010. Usage:
 *
 *   pnpm eval:ai-agent [--category <name>] [--case <id>]
 *
 * `--category` filters to one of the eight defended requirements
 * (visibility-safety, grounding, escalation-required, escalation-forbidden,
 * tool-calling, classification, resolution-detection, language); `--case`
 * additionally filters to one case id within it. Requires OPENROUTER_API_KEY
 * (and, for a judge metric, whichever model runs it).
 */

const modelGatewayBaseUrl = "https://openrouter.ai/api/v1";

async function main() {
  const { category, caseId } = parseArgs(process.argv.slice(2));

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    process.stderr.write("OPENROUTER_API_KEY is required to run the eval suite.\n");
    process.exitCode = 2;
    return;
  }

  const models = {
    classificationModel: createClassificationModel({
      apiKey,
      baseUrl: modelGatewayBaseUrl,
      modelId: process.env.LLM_MODEL_FAST ?? "openai/gpt-4.1-nano",
    }),
    replyModel: createReplyModel({
      apiKey,
      baseUrl: modelGatewayBaseUrl,
      modelId: process.env.LLM_MODEL_MAIN ?? "openai/gpt-4o-mini",
    }),
  };

  process.exitCode = await runEvals({ category, caseId, models });
}

function parseArgs(argv: string[]): { category?: EvalCategoryName; caseId?: string } {
  let category: string | undefined;
  let caseId: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--category") category = argv[++index];
    if (argv[index] === "--case") caseId = argv[++index];
  }

  if (category && !evalCategoryNames.includes(category as EvalCategoryName)) {
    throw new Error(`Unknown category "${category}". Known categories: ${evalCategoryNames.join(", ")}`);
  }

  return { category: category as EvalCategoryName | undefined, caseId };
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 2;
});
