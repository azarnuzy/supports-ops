#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { defineMetric, EvalOutcome, runEvalCli, type EvalCase } from "@anvia/core/evals";
import { extract } from "@anvia/core/extractor";
import { createOtelEvalReporter } from "@anvia/otel";
import {
  classifyMessage,
  createClassificationModel,
  type ClassificationDecision,
  type ClassificationModel,
} from "@repo/ai-agent";
import { shutdownTelemetry, startTelemetry, withSpan } from "@repo/logger/telemetry";
import { z } from "zod";
import { embeddingGatewayBaseUrl, evalConfig, telemetryConfig } from "../config";
import { ticketCategoryOptions } from "../modules/ticket-categories/services";
import { classificationCases, type ClassificationEvalCase } from "./classification-cases";

type Result = {
  id: string;
  model: string;
  repeat: number;
  durationMs: number;
  passed: boolean;
  critical: boolean;
  errors: string[];
  decision?: ClassificationDecision;
  trace: { observer: "otel"; traceId: string; observationId: string };
};

type Input = Pick<ClassificationEvalCase, "message" | "history">;
type Expected = ClassificationEvalCase["expected"];

function option(name: string): string | undefined {
  return process.argv.slice(2).find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function percentile(values: number[], p: number): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function textLanguage(text: string): "en" | "id" | "unknown" {
  if (/[\u0600-\u06ff\u3040-\u30ff\u3400-\u9fff]/u.test(text) ||
    /\b(?:kumusta|salamat|hindi|makapag|dahil|iniciar|sesión|cuenta|contraseña|puedo|bonjour|merci|akaun|kerana|laluan|boleh)\b/i.test(text)) {
    return "unknown";
  }
  const id = text.match(/\b(?:ada|bantu|bisa|saya|kami|anda|silakan|ceritakan|butuh|perlu|terima|kasih|pesanan|halo|tidak|belum|akun|masalah|gagal|masuk|pembayaran|kirim|pengiriman|terkunci|diterima|mohon|pertanyaan|kata|sandi|ditolak|saat|akses|kesulitan|kendala|sudah)\b/gi)?.length ?? 0;
  const en = text.match(/\b(?:can|could|help|you|your|please|tell|need|here|thanks|hello|hi|what|the|we|how|order|account|payment|shipping|delivery|unable|cannot|missing|received|sign|request|issue|with|for|to|not|my|password|rejected|access)\b/gi)?.length ?? 0;
  return id === en ? "unknown" : id > en ? "id" : "en";
}

const invitesExplanationSchema = z.object({ invitesExplanation: z.boolean() });

/**
 * A word-list can't tell "please describe your issue" from "thanks, bye" once
 * either is phrased with a suffix or synonym the list doesn't happen to name
 * (Indonesian "butuhkan" vs "butuh", for instance). A judge model reads intent
 * instead of guessing at surface words — deliberately a different model from
 * the one under test, same as the AI Agent eval's own judge (see evalConfig).
 */
async function invitesExplanation(judgeModel: ClassificationModel, reply: string): Promise<boolean> {
  const { output } = await extract({
    instructions:
      "You judge one candidate reply to a Customer's greeting or small talk, in isolation. " +
      "Answer invitesExplanation=true only if the reply warmly invites the Customer to describe " +
      "what they need help with (any wording, any language). Answer false if it does not, or if " +
      "it states a policy, fact, or answer instead of inviting one.",
    model: judgeModel,
    outputSchema: invitesExplanationSchema,
    retries: { maxAttempts: 2 },
    text: reply,
  });
  return output.invitesExplanation;
}

async function grade(
  testCase: ClassificationEvalCase,
  decision: ClassificationDecision,
  judgeModel: ClassificationModel,
): Promise<string[]> {
  const expected = testCase.expected;
  if (decision.qualifies !== expected.qualifies) {
    return [`support decision: expected ${expected.qualifies}, got ${decision.qualifies}`];
  }
  if (decision.qualifies && expected.qualifies) {
    const errors: string[] = [];
    if (expected.category && decision.category !== expected.category) {
      errors.push(`category: expected ${expected.category}, got ${decision.category}`);
    }
    if (expected.priority && decision.priority !== expected.priority) {
      errors.push(`priority: expected ${expected.priority}, got ${decision.priority}`);
    }
    if (decision.title.length < 5 || decision.title.length > 120) {
      errors.push(`title length: ${decision.title.length}`);
    }
    if (expected.titleIncludes?.length &&
      !expected.titleIncludes.some((word) => decision.title.toLowerCase().includes(word))) {
      errors.push(`title misses ${expected.titleIncludes.join("/")}: ${decision.title}`);
    }
    if (expected.language && textLanguage(decision.title) !== expected.language) {
      errors.push(`title language: expected ${expected.language}, got ${textLanguage(decision.title)}`);
    }
    return errors;
  }
  if (!decision.qualifies && !expected.qualifies) {
    const errors: string[] = [];
    if (decision.reply.length > 300) errors.push(`reply too long: ${decision.reply.length}`);
    const language = textLanguage(decision.reply);
    if (language !== expected.language) errors.push(`reply language: expected ${expected.language}, got ${language}`);
    // Greeting replies must invite the Customer to explain their need, without
    // guessing a policy or stating a merchant-specific fact.
    if (!(await invitesExplanation(judgeModel, decision.reply))) {
      errors.push("reply does not invite the Customer to explain their need");
    }
    if (/\b(?:refund|return window|shipping time|diskon|pengembalian dana|ongkos kirim)\b/i.test(decision.reply)) {
      errors.push("reply makes or hints at a business-specific claim");
    }
    return errors;
  }
  return ["unreachable decision state"];
}

async function main() {
  const models = option("models")?.split(",").map((model) => model.trim()).filter(Boolean);
  const repeats = Number(option("repeat") ?? "1");
  const idFilter = option("id");
  const outputPath = option("json");
  if (!models?.length || !Number.isInteger(repeats) || repeats < 1 || repeats > 20) {
    throw new Error("Usage: pnpm eval:classification --models=openai/gpt-5.4-nano,google/gemini-3.1-flash-lite [--repeat=1] [--id=greeting-hi] [--json=report.json]");
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required.");
  if (!evalConfig.workspaceId) throw new Error("EVAL_WORKSPACE_ID is required.");
  if (!telemetryConfig.enabled || telemetryConfig.exporter !== "otlp" || !telemetryConfig.otlpEndpoint) {
    throw new Error("Lens Runs require ENABLE_TELEMETRY=true, TELEMETRY_EXPORTER=otlp, and TELEMETRY_EXPORTER_OTLP_ENDPOINT.");
  }
  const selected = classificationCases.filter((testCase) => !idFilter || testCase.id.includes(idFilter));
  if (!selected.length) throw new Error(`No Eval Cases match ${idFilter}.`);

  const categories = await ticketCategoryOptions(evalConfig.workspaceId);
  const needed = new Set(selected.flatMap((testCase) =>
    testCase.expected.qualifies && testCase.expected.category ? [testCase.expected.category] : [],
  ));
  const missing = [...needed].filter((key) => !categories.some((category) => category.key === key));
  if (missing.length) throw new Error(`Eval Workspace is missing category keys: ${missing.join(", ")}`);

  // Deliberately a different model from anything under test, same as the AI
  // Agent eval's own judge (see evalConfig.judgeModelId).
  const judgeModel = createClassificationModel({ apiKey, baseUrl: embeddingGatewayBaseUrl, modelId: evalConfig.judgeModelId });

  // A deliberately wrong decision must fail, so the scoring path cannot
  // accidentally produce an all-green report.
  if (!(await grade(classificationCases[0], { qualifies: true, title: "Wrong", category: "GENERAL", priority: "NORMAL" }, judgeModel)).length) {
    throw new Error("Classification Eval negative control failed.");
  }
  if (!(await grade({ id: "language-control", message: "Halo", expected: { qualifies: false, language: "id" } },
    { qualifies: false, reply: "Hello! How can I help you?" }, judgeModel)).some((error) => error.startsWith("reply language"))) {
    throw new Error("Classification Eval language control failed.");
  }

  const caseById = new Map(selected.map((testCase) => [testCase.id, testCase]));
  startTelemetry({ config: telemetryConfig, serviceName: "classification-evals" });
  const reporter = createOtelEvalReporter<Input, Result, Expected>({
    captureMaxBytes: 8_000,
    includePayloads: true,
    onMissingTrace: "throw",
    transformOutput: (value) => {
      const output = value as Result;
      return { model: output.model, decision: output.decision, durationMs: Math.round(output.durationMs), errors: output.errors };
    },
  });
  const metrics = [
    defineMetric<Input, Result, boolean, Expected>({
      name: "support-decision",
      dataType: "BOOLEAN",
      required: true,
      evaluate({ case: testCase, output }) {
        if (!testCase.expected) return EvalOutcome.invalid("missing expected support decision", { kind: "configuration" });
        const correct = output.decision?.qualifies === testCase.expected.qualifies;
        return correct
          ? EvalOutcome.pass(true)
          : EvalOutcome.fail(false, { comment: `expected qualifies=${testCase.expected.qualifies}, got ${output.decision?.qualifies ?? "provider failure"}` });
      },
    }),
    defineMetric<Input, Result, boolean, Expected>({
      name: "classification-quality",
      dataType: "BOOLEAN",
      required: true,
      evaluate({ output }) {
        return output.passed
          ? EvalOutcome.pass(true)
          : EvalOutcome.fail(false, { comment: output.errors.join("; ") });
      },
    }),
    defineMetric<Input, Result, number, Expected>({
      name: "latency-ms",
      dataType: "NUMERIC",
      direction: "lower_is_better",
      required: false,
      evaluate({ output }) {
        return EvalOutcome.pass(Math.round(output.durationMs));
      },
    }),
  ];
  const results: Result[] = [];
  try {
    for (const model of models) {
      const client = createClassificationModel({
        apiKey,
        baseUrl: embeddingGatewayBaseUrl,
        modelId: model,
      });
      const cases: EvalCase<Input, Expected>[] = Array.from({ length: repeats }, (_, index) =>
        selected.map((testCase) => ({
          id: `${testCase.id}-r${index + 1}`,
          input: { message: testCase.message, history: testCase.history },
          expected: testCase.expected,
          metadata: { caseId: testCase.id, critical: testCase.critical ?? false, repeat: index + 1 },
        })),
      ).flat();
      await runEvalCli({
        name: `supportops-classification ${model}`,
        cases,
        concurrency: 1,
        metrics: metrics as never,
        reporters: [reporter],
        maxValueLength: 2_000,
        run: {
          datasetName: "supportops-pre-ticket-classification",
          datasetVersion: "3",
          metadata: { targetModel: model, gateway: "openrouter", workspaceId: evalConfig.workspaceId,
            repeats, caseFilter: idFilter ?? "all" },
        },
        target: async (input, testCase) => {
          const original = caseById.get(String(testCase.metadata?.caseId))!;
          const repeat = Number(testCase.metadata?.repeat);
          const output = await withSpan("eval.classification_case", {
            "anvia.trace.name": "eval.classification_case",
            "anvia.trace.tags": ["classification-eval", model],
            "supportops.eval.case_id": original.id,
            "supportops.eval.model": model,
          }, async (span): Promise<Result> => {
            const trace = { observer: "otel" as const,
              traceId: span.spanContext().traceId, observationId: span.spanContext().spanId };
            const started = performance.now();
            try {
              const decision = await classifyMessage({
                categories, content: input.message, history: input.history, model: client,
              });
              // Measured before grading: grading now includes a judge-model call for
              // greeting cases, which must not leak into the classifier's own latency.
              const durationMs = performance.now() - started;
              const errors = await grade(original, decision, judgeModel);
              return { id: original.id, model, repeat, durationMs,
                passed: errors.length === 0, critical: original.critical ?? false, errors, decision, trace };
            } catch (error) {
              return { id: original.id, model, repeat, durationMs: performance.now() - started,
                passed: false, critical: original.critical ?? false,
                errors: [`provider/schema failure: ${error instanceof Error ? error.message : String(error)}`], trace };
            }
          });
          results.push(output);
          process.stdout.write(`${output.passed ? "PASS" : "FAIL"} ${model} ${original.id} #${repeat} ${Math.round(output.durationMs)}ms${output.errors.length ? ` | ${output.errors.join("; ")}` : ""}\n`);
          return output;
        },
      });
    }
  } finally {
    await shutdownTelemetry();
  }

  for (const model of models) {
    const rows = results.filter((row) => row.model === model);
    const successes = rows.filter((row) => row.passed);
    const criticalFailures = rows.filter((row) => row.critical && !row.passed);
    const decisionErrors = rows.filter((row) => row.errors.some((error) => error.startsWith("support decision")));
    const falseNegatives = decisionErrors.filter((row) =>
      selected.find((testCase) => testCase.id === row.id)?.expected.qualifies === true);
    const falsePositives = decisionErrors.length - falseNegatives.length;
    const greeting = rows.filter((row) => selected.find((testCase) => testCase.id === row.id)?.expected.qualifies === false);
    const display = (values: number[]) => `${Math.round(percentile(values, 50) ?? 0)}/${Math.round(percentile(values, 95) ?? 0)}ms`;
    process.stdout.write(`\n${model}: accuracy ${successes.length}/${rows.length}, critical failures ${criticalFailures.length}, false negatives ${falseNegatives.length}, false positives ${falsePositives}, latency p50/p95 all ${display(rows.map((row) => row.durationMs))}, greeting ${display(greeting.map((row) => row.durationMs))}\n`);
    if (criticalFailures.length || decisionErrors.length || successes.length / rows.length < 0.95) process.exitCode = 1;
  }
  if (outputPath) writeFileSync(outputPath, JSON.stringify({ workspaceId: evalConfig.workspaceId,
    gateway: embeddingGatewayBaseUrl, models, repeats, categories, results }, null, 2));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 2;
});
