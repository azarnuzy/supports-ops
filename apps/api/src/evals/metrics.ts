import { Usage, type CompletionModel } from "@anvia/core";
import { defineMetric, EvalOutcome, type EvalMetric } from "@anvia/core/evals";
import { extract } from "@anvia/core/extractor";
import { z } from "zod";
import type { AgentEvalCase } from "./cases";
import {
  ndcgAtK,
  precisionAtK,
  recallAtK,
  reciprocalRank,
  resolveExpectedPassages,
} from "./retrieval";
import type { EvalTurnInput, EvalTurnOutput } from "./target";

type Metric<Score> = EvalMetric<EvalTurnInput, EvalTurnOutput, Score, string, string>;

/**
 * Deterministic metrics over the parts of a turn that are not text. The five
 * text metrics carried over from the reference project judge what the Agent
 * *said*; these judge what it *did* — whether it escalated, which Tool it
 * reached for, whether an Internal-Only canary survived into a Customer-facing
 * reply, and which language it answered in. A suite of text metrics alone
 * would pass an Agent that escalates every hard question in well-chosen words.
 *
 * Each metric reads its expectation from the Case's own `metadata`, so one
 * metric instance grades a whole suite of cases the way the built-in
 * `contains` and `exactMatch` read `expected`.
 */

/**
 * Folds the typographic variation a model freely chooses between into one
 * form, so a case asserting "5-10 business days" is not failed by a reply that
 * wrote "5–10", and "8999.99" is not failed by "8,999.99". Without this,
 * `contains` and `exactMatch` measure the model's punctuation habits rather
 * than whether it got the fact right.
 */
export function normalizeText(value: string): string {
  return value
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/(\d),(\d{3})/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

function metadataOf(testCase: { metadata?: unknown }): AgentEvalCase["metadata"] {
  return (testCase.metadata ?? {}) as AgentEvalCase["metadata"];
}

/** Passes when the turn ended in one of the decisions the Case allows. */
export function decisionMatches(): Metric<string> {
  return defineMetric<EvalTurnInput, EvalTurnOutput, string, string>({
    dataType: "CATEGORICAL",
    evaluate({ case: testCase, output }) {
      const allowed = metadataOf(testCase).decisions;
      if (!allowed?.length) {
        return EvalOutcome.invalid("case metadata is missing `decisions`", {
          kind: "configuration",
        });
      }
      const detail = output.escalationReason ? ` (${output.escalationReason})` : "";
      return allowed.includes(output.decision)
        ? EvalOutcome.pass(output.decision, { comment: `decided ${output.decision}${detail}` })
        : EvalOutcome.fail(output.decision, {
            comment: `expected ${allowed.join(" or ")}, got ${output.decision}${detail}`,
          });
    },
    name: "decision",
    required: true,
  });
}

/**
 * Grades which Tools the Agent reached for. `toolMustNotBeCalled` flips the
 * check: some cases are about a Tool the Agent should have left alone — a
 * policy question that needs no catalog lookup, or a checkout it must never
 * complete on its own.
 */
export function toolUsage(): Metric<boolean> {
  return defineMetric<EvalTurnInput, EvalTurnOutput, boolean, string>({
    dataType: "BOOLEAN",
    evaluate({ case: testCase, output }) {
      const { tool, toolMustNotBeCalled } = metadataOf(testCase);
      if (!tool) {
        return EvalOutcome.invalid("case metadata is missing `tool`", { kind: "configuration" });
      }
      const names = output.toolCalls.map((call) => call.name);
      const called = names.filter((name) => name.includes(tool));
      const summary = names.length ? names.join(", ") : "no Tools";

      if (toolMustNotBeCalled) {
        return called.length
          ? EvalOutcome.fail(false, {
              comment: `must not call "${tool}"; called ${called.join(", ")}`,
            })
          : EvalOutcome.pass(true, { comment: `called ${summary}` });
      }
      return called.length
        ? EvalOutcome.pass(true, { comment: `called ${called.join(", ")}` })
        : EvalOutcome.fail(false, {
            comment: `expected a Tool matching "${tool}"; called ${summary}`,
          });
    },
    name: "tool-usage",
    required: true,
  });
}

/**
 * Fails if any canary phrase from the Case shows up in the reply. Internal-Only
 * Knowledge is already filtered at the query (`retrievalMode: "CUSTOMER"`), so
 * this is an independent check: it catches a leak even if that filter
 * regresses, and it catches the model reciting an internal rule it picked up
 * some other way.
 */
export function neverLeaksInternal(): Metric<boolean> {
  return defineMetric<EvalTurnInput, EvalTurnOutput, boolean, string>({
    dataType: "BOOLEAN",
    evaluate({ case: testCase, output }) {
      const canaries = metadataOf(testCase).canaries;
      if (!canaries?.length) {
        return EvalOutcome.invalid("case metadata is missing `canaries`", {
          kind: "configuration",
        });
      }
      const haystack = output.output.toLocaleLowerCase();
      const leaked = canaries.find((snippet) => haystack.includes(snippet.toLocaleLowerCase()));
      return leaked
        ? EvalOutcome.fail(false, { comment: `leaked Internal-Only phrase: "${leaked}"` })
        : EvalOutcome.pass(true, { comment: "no canary phrase in the reply" });
    },
    name: "never-leaks-internal",
    required: true,
  });
}

/**
 * Passes when the reply is written in the language the Case expects.
 * Deliberately crude: it only has to tell Indonesian from English, and a
 * word-list does that without a model call that costs money and varies
 * between runs.
 */
export function languageMatches(): Metric<string> {
  const indonesianMarkers =
    /\b(?:yang|untuk|dengan|tidak|bisa|kami|anda|silakan|pesanan|pengiriman|dapat|sudah|akan|hari|kalian)\b/gi;
  const englishMarkers =
    /\b(?:the|your|you|we|can|order|shipping|please|will|return|within|days|size)\b/gi;

  return defineMetric<EvalTurnInput, EvalTurnOutput, string, string>({
    dataType: "CATEGORICAL",
    evaluate({ case: testCase, output }) {
      const expected = metadataOf(testCase).language;
      if (!expected) {
        return EvalOutcome.invalid("case metadata is missing `language`", {
          kind: "configuration",
        });
      }
      if (!output.output.trim()) {
        return EvalOutcome.invalid("the Agent produced no text to detect a language from", {
          kind: "target",
        });
      }
      const id = output.output.match(indonesianMarkers)?.length ?? 0;
      const en = output.output.match(englishMarkers)?.length ?? 0;
      const detected = id > en ? "id" : "en";
      return detected === expected
        ? EvalOutcome.pass(detected, { comment: `detected ${detected} (id=${id}, en=${en})` })
        : EvalOutcome.fail(detected, {
            comment: `expected ${expected}, detected ${detected} (id=${id}, en=${en})`,
          });
    },
    name: "language",
    required: true,
  });
}

/**
 * Resolves a `retrieval` Case's expected-passage labels to current Chunk IDs
 * and pairs them with what was actually retrieved. Shared by the three
 * `retrieval` metrics below so each one issues the same DB lookup rather than
 * three. Returns an `invalid` outcome directly when metadata is missing or a
 * label no longer resolves to any Chunk — the latter is the acceptance
 * criterion that a stale label must fail loudly, not score zero silently.
 */
async function loadRetrievalCase(testCase: {
  metadata?: unknown;
}): Promise<
  { relevant: Awaited<ReturnType<typeof resolveExpectedPassages>> } | EvalOutcome<never>
> {
  const expectedPassages = metadataOf(testCase).expectedPassages;
  if (!expectedPassages?.length) {
    return EvalOutcome.invalid("case metadata is missing `expectedPassages`", {
      kind: "configuration",
    });
  }
  const relevant = await resolveExpectedPassages(expectedPassages);
  const stale = relevant.filter((passage) => passage.chunkIds.length === 0);
  if (stale.length) {
    return EvalOutcome.invalid(
      `expected passage no longer resolves to any Chunk: ${stale
        .map((passage) => `"${passage.source}" / "${passage.fragment}"`)
        .join(", ")}`,
      { kind: "configuration" },
    );
  }
  return { relevant };
}

/**
 * The `retrieval` metrics follow standard IR evaluation (TREC/BEIR): Recall@k,
 * Precision@k, MRR and nDCG@k over graded passage labels. Per-Case outcomes
 * only flag Cases worth reading; the suite passes or fails on the *mean* of
 * each score against `retrievalGates` in `run.ts`, the way those benchmarks
 * report a retriever. Precision@k is informational and never gates: with one
 * labelled passage and a fixed top-5 that also carries neighbor context, its
 * ceiling is 0.2 by construction, so an "every chunk relevant" rule could
 * never pass.
 */
function retrievalMetric(options: {
  name: string;
  /** Per-Case pass threshold, for triage only. */
  threshold: number;
  required: boolean;
  score: (relevant: Parameters<typeof recallAtK>[0], retrievedIds: string[]) => number;
}): Metric<number> {
  return defineMetric<EvalTurnInput, EvalTurnOutput, number, string>({
    dataType: "NUMERIC",
    direction: "higher_is_better",
    async evaluate({ case: testCase, output }) {
      const loaded = await loadRetrievalCase(testCase);
      if ("outcome" in loaded) return loaded;
      const retrievedIds = output.retrievedChunks.map((chunk) => chunk.chunkId);
      const score = options.score(loaded.relevant, retrievedIds);
      const comment = `${options.name} ${score.toFixed(2)} over ${retrievedIds.length} chunks`;
      return score >= options.threshold
        ? EvalOutcome.pass(score, { comment })
        : EvalOutcome.fail(score, { comment });
    },
    name: options.name,
    required: options.required,
    threshold: options.threshold,
  });
}

/** Context recall: every required passage was retrieved somewhere this turn. */
export const retrievalRecall = () =>
  retrievalMetric({ name: "recall@k", required: true, score: recallAtK, threshold: 1 });

/** Reciprocal rank; the suite mean is MRR. A Case passes with a relevant Chunk in the top 3. */
export const retrievalReciprocalRank = () =>
  retrievalMetric({ name: "mrr", required: false, score: reciprocalRank, threshold: 1 / 3 });

export const retrievalNdcg = (k: number) =>
  retrievalMetric({
    name: `ndcg@${k}`,
    required: false,
    score: (relevant, ids) => ndcgAtK(relevant, ids, k),
    threshold: 0.5,
  });

export const retrievalPrecision = () =>
  retrievalMetric({ name: "precision@k", required: false, score: precisionAtK, threshold: 0 });

/**
 * Faithfulness judged against the retrieved passages themselves. The library
 * `faithfulness` first condenses the whole retrieval context into a short list
 * of "truths" and then checks claims against that list; a table row such as
 * "Label created | Shipment prepared; carrier may not have scanned it yet" is
 * routinely dropped in that summary, so a reply quoting it scored 0. Checking
 * each claim against the raw passages removes that lossy hop.
 */
export function groundedFaithfulness(options: {
  model: CompletionModel;
  threshold: number;
}): Metric<number> {
  const claimsSchema = z.object({ claims: z.array(z.string()) });
  const verdictsSchema = z.object({
    verdicts: z.array(z.object({ reason: z.string(), supported: z.boolean() })),
  });

  return defineMetric<EvalTurnInput, EvalTurnOutput, number, string>({
    dataType: "NUMERIC",
    direction: "higher_is_better",
    async evaluate({ case: testCase, output }) {
      try {
        const claimResult = await extract({
          instructions:
            "Extract every concise factual claim the answer makes about the company, its products, policies, orders, shipping, or billing. Omit requests for information from the Customer (such as asking for an order number), statements of what the assistant will do next, greetings, and opinions.",
          model: options.model,
          outputSchema: claimsSchema,
          temperature: 0,
          text: `Answer:\n${output.output}`,
        });
        const claims = claimResult.output.claims;
        if (!claims.length) {
          return EvalOutcome.pass(1, { comment: "no factual claims", usage: claimResult.usage });
        }

        const passages = output.retrieved.length
          ? output.retrieved
          : ["No Knowledge was retrieved for this turn."];
        const verdictResult = await extract({
          instructions:
            "For each claim, decide whether the passages support it. A claim is supported when a passage states it or it is a faithful paraphrase of a passage (including a table row). A claim that only restates what the Customer said about their own situation is supported by the Customer message. Return one verdict per claim, in order.",
          model: options.model,
          outputSchema: verdictsSchema,
          temperature: 0,
          text: JSON.stringify({
            claims,
            customerMessage: (testCase.input as EvalTurnInput).message,
            passages,
          }),
        });
        const verdicts = verdictResult.output.verdicts;
        const usage = Usage.add(claimResult.usage, verdictResult.usage);
        if (verdicts.length !== claims.length) {
          return EvalOutcome.invalid(
            `judge returned ${verdicts.length} verdicts for ${claims.length} claims`,
          );
        }

        const score = verdicts.filter((verdict) => verdict.supported).length / claims.length;
        const unsupported = claims
          .map((claim, index) => ({ claim, verdict: verdicts[index] }))
          .filter(({ verdict }) => !verdict?.supported)
          .map(({ claim, verdict }) => `"${claim}" (${verdict?.reason})`);
        const comment = unsupported.length
          ? `unsupported: ${unsupported.join("; ")}`
          : "every claim is supported by the retrieved passages";
        return score >= options.threshold
          ? EvalOutcome.pass(score, { comment, usage })
          : EvalOutcome.fail(score, { comment, usage });
      } catch (error) {
        return EvalOutcome.fromError(error);
      }
    },
    name: "faithfulness",
    required: true,
    threshold: options.threshold,
  });
}

/**
 * Always fails. One Case in the suite is wired to this so a broken evaluator —
 * one that reports "pass" no matter what — cannot quietly mark everything
 * green. The reference project has no equivalent; without it, a 100% run is
 * indistinguishable from a run where nothing was actually checked.
 */
export function negativeControl(): Metric<boolean> {
  return defineMetric<EvalTurnInput, EvalTurnOutput, boolean, string>({
    dataType: "BOOLEAN",
    evaluate() {
      return EvalOutcome.fail(false, {
        comment:
          "Negative control: this metric always fails. A run where it passes means the evaluator is broken.",
      });
    },
    name: "negative-control",
    required: true,
  });
}
