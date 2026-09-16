import { defineMetric, EvalOutcome, type EvalMetric } from "@anvia/core/evals";
import type { AgentEvalCase } from "./cases";
import { firstRelevantRank, precisionAtK, recallAtK, resolveExpectedPassages } from "./retrieval";
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
}): Promise<{ relevant: Awaited<ReturnType<typeof resolveExpectedPassages>> } | EvalOutcome<never>> {
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

/** Passes when every expected passage was recovered somewhere in retrieval. */
export function retrievalRecall(): Metric<number> {
  return defineMetric<EvalTurnInput, EvalTurnOutput, number, string>({
    dataType: "NUMERIC",
    async evaluate({ case: testCase, output }) {
      const loaded = await loadRetrievalCase(testCase);
      if ("outcome" in loaded) return loaded;
      const retrievedIds = output.retrievedChunks.map((chunk) => chunk.chunkId);
      const score = recallAtK(loaded.relevant, retrievedIds);
      return score === 1
        ? EvalOutcome.pass(score, { comment: "all expected passages retrieved" })
        : EvalOutcome.fail(score, { comment: `recall@k ${score.toFixed(2)}` });
    },
    name: "retrieval-recall",
    required: true,
  });
}

/** Passes when the retrieved set is entirely relevant (recall's counterpart:
 * a search that returns 20 chunks to net one relevant hit is not "working"). */
export function retrievalPrecision(): Metric<number> {
  return defineMetric<EvalTurnInput, EvalTurnOutput, number, string>({
    dataType: "NUMERIC",
    async evaluate({ case: testCase, output }) {
      const loaded = await loadRetrievalCase(testCase);
      if ("outcome" in loaded) return loaded;
      const retrievedIds = output.retrievedChunks.map((chunk) => chunk.chunkId);
      const score = precisionAtK(loaded.relevant, retrievedIds);
      return score === 1
        ? EvalOutcome.pass(score, { comment: "every retrieved chunk was relevant" })
        : EvalOutcome.fail(score, { comment: `precision@k ${score.toFixed(2)}` });
    },
    name: "retrieval-precision",
    required: true,
  });
}

/** Passes when the first relevant Chunk is retrieval's own top result — the
 * rank a reranker or top-k change (#187) is meant to move. */
export function retrievalFirstRelevantRank(): Metric<number | null> {
  return defineMetric<EvalTurnInput, EvalTurnOutput, number | null, string>({
    dataType: "NUMERIC",
    async evaluate({ case: testCase, output }) {
      const loaded = await loadRetrievalCase(testCase);
      if ("outcome" in loaded) return loaded;
      const retrievedIds = output.retrievedChunks.map((chunk) => chunk.chunkId);
      const rank = firstRelevantRank(loaded.relevant, retrievedIds);
      return rank === 1
        ? EvalOutcome.pass(rank, { comment: "first relevant chunk ranked first" })
        : EvalOutcome.fail(rank, {
            comment: rank === null ? "no relevant chunk retrieved" : `first relevant rank ${rank}`,
          });
    },
    name: "retrieval-first-relevant-rank",
    required: true,
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
