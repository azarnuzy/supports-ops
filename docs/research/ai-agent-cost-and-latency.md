# AI Agent cost and latency: measured baseline and approach

Date: 2026-09-16

Scope: what an AI Agent turn actually spends, where it spends it, and which levers are worth pulling. Companion to [`ai-agent-eval-production-readiness.md`](./ai-agent-eval-production-readiness.md), which covers what the eval report *should* report; this document covers what the numbers say once it does.

This file is the running record for this workstream. A condensed Indonesian summary for reading rather than working from lives in [`ai-agent-performance-tracking.md`](../ai-agent-performance-tracking.md); keep the two in step when something ships. Section 1 is the frozen baseline every later run is compared against, section 6 lists every change already shipped, and section 7 is what happens next. Update section 6 when something ships and add a new measured run beside the baseline in section 1 — do not overwrite the baseline.

## 1. Baseline B0 (frozen)

Every suite below was run against the eval Workspace on 2026-09-16 (`pnpm eval:ai-agent <suite>`), one process per suite, sequentially, at commit `ad293a3` **before** any change in section 6. This is the reference point; re-measure after section 6 lands and add the result as a new row-set rather than editing this one.

| Suite | Cases | Pass | Target tokens | Tokens/case | Wall time | ms/case |
| --- | --- | --- | --- | --- | --- | --- |
| `contains` | 6 | 6 | 159,398 | 26,566 | 40,748 ms | 6,791 |
| `faithfulness` | 3 | 1 (1 fail, 1 invalid) | 62,366 | 20,789 | 69,664 ms | 23,221 |
| `decision` | 14 | 12 | 310,890 | 22,206 | 99,276 ms | 7,091 |
| `tool` | 7 | 6 | 218,779 | 31,254 | 60,312 ms | 8,616 |
| `visibility` | 4 | 4 | 87,979 | 21,995 | 25,347 ms | 6,337 |
| `negativeControl` | 1 | 0 | 25,048 | 25,048 | 4,661 ms | 4,661 |
| `language` | 3 | 3 | 76,179 | 25,393 | 18,806 ms | 6,269 |
| `relevancy` | 3 | 3 | 76,427 | 25,476 | 72,266 ms | 24,089 |
| `gEval` | 23 | 17 | 521,837 | 22,689 | 310,991 ms | 13,521 |

Failing and invalid Cases in B0 — the quality floor any optimisation must not push further down:

| Case | Suite | Result |
| --- | --- | --- |
| `negative-control` | `negativeControl` | fail (1 of 1 — the suite's only Case) |
| `edge-no-first-scan` | `faithfulness` | fail, score 0.33 |
| `common-split-shipment` | `faithfulness` | invalid — a harness defect, fixed in 6.1 |
| `common-return-window` | `gEval` | fail |
| `escalation-two-completed-charges` | `gEval` | fail |
| `tool-unknown-order` | `tool` | fail |
| 2 unnamed Cases | `decision` | fail |
| 4 further Cases | `gEval` | fail (17 of 23 pass) |

Judge cost is separate and small: 6,133 evaluation tokens for `relevancy`, 20,969 for `gEval`, 15,549 for `faithfulness`. The judge is not the expense.

Per-turn figures sampled from the Cases whose printed payload was not truncated:

- end-to-end duration p50 ≈ 6.3 s, p90 ≈ 13.4 s, max 17.7 s;
- input tokens per model call ≈ 11.7 k, near-constant regardless of question;
- cached input tokens 71 % of all input across the sample, and 11,658 / 11,677 = 99.8 % on a turn that made no Tool call;
- output tokens p50 70, p90 212, of which **51.5 % are reasoning tokens**, not Customer-visible text.

Two facts follow immediately, and both contradict the intuitive reading of the `contains` run:

1. **Prompt caching is already active.** `Usage.cachedInputTokens` is populated by the gateway with no `cache_control` in this codebase — the provider caches the stable prefix automatically. Input tokens are therefore not billed at the headline rate; on GPT-5.6-class models cached input is 0.1× the uncached rate ([OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)). "26.6 k tokens per turn" is an accounting figure, not a cost figure.
2. **Tokens per turn are roughly constant and roughly independent of the question.** A one-line clarification costs about as much input as a grounded multi-Tool answer. That is the signature of a fixed per-request payload, not of retrieval bloat.

## 2. Where the input tokens actually go

Measured directly against the eval Workspace's assigned Tools (`describeAssignedTools` output, ~4 chars/token estimate):

| Component | Estimated tokens | Share |
| --- | --- | --- |
| `replyPrompt` static platform instructions | ~1,160 | ~9 % |
| `searchKnowledge` + `searchCustomerTicketHistory` definitions | ~48 | <1 % |
| 13 Shopify MCP Tool definitions | ~13,480 | ~91 % |
| Retrieved Knowledge chunks (when retrieval runs) | variable, added per Tool Result | — |

The five largest Tool schemas alone — `create_checkout` (~2,600), `update_checkout` (~2,600), `complete_checkout` (~1,765), `update_cart` (~1,395), `create_cart` (~1,374) — are roughly 8× the entire system prompt. `createAssignedTools` compounds this by appending the full `JSON.stringify(inputSchema)` into each Tool's *description* as well, so a checkout schema is paid for twice in the rendered request.

This reframes the problem. Retrieval is not the cost driver; the Tool manifest is. Published measurements put the same effect at 15,000 tokens of manifest for ~70 tools before the conversation starts ([Archestra](https://archestra.ai/blog/how-many-mcp-tools-too-many)), which matches what is measured here at 15 Tools with verbose commerce schemas.

The manifest is also an accuracy problem, not only a token problem. Tool-selection accuracy degrades as the Tool set grows, sharply so past a few dozen Tools ([the over-tooled agent problem](https://tianpan.co/blog/2026-04-19-over-tooled-agent-problem), [ToolChoiceConfusion](https://arxiv.org/html/2606.06284)). SupportOps is below the cliff at 15, but the `tool` suite already shows one failure out of seven and the failing `negativeControl` Case is exactly the shape this failure mode produces.

## 3. Cost: what the evidence supports

Ordered by measured return, not by how interesting the technique is.

### 3.1 Do not start with retrieval trimming

The earlier hypothesis — cut `DEFAULT_SEARCH_LIMIT`, add a reranker — is not supported by the numbers. Retrieved chunks enter the request as `role: "tool"` results *after* the cached prefix; they are a minority of input tokens and they are the part that is actually load-bearing for `faithfulness`. Cutting them trades a small, heavily discounted token saving against the metric that is already failing (`edge-no-first-scan` scored 0.33). AWS's guidance is explicit that re-ranking and hybrid retrieval are stages to add where the corpus justifies them, not stacked by default, and that the return flattens before the last layer while the latency cost does not ([AGENTPERF03-BP03](https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentperf03-bp03.html)).

Revisit retrieval only when the eval reports precision@k against gold chunk IDs. Until then it is tuning without a signal.

### 3.2 Trim the Tool manifest, and stop paying for schemas twice

Two independent changes:

- **Remove the duplicated schema from the Tool description.** `createAssignedTools` embeds `Arguments JSON Schema: ${JSON.stringify(tool.inputSchema)}` in the description while the same schema is already sent as the Tool's parameter schema. For the checkout Tools this is ~5 k tokens of pure duplication per request. Verify against the provider's rendered request before removing — the duplication exists because `inputSchema` is passed as `z.record(z.string(), z.unknown())`, so the real schema reaches the model only through the description text. The fix is to convert the stored JSON Schema into the Tool's actual parameter schema, not to delete the description text. → done in 6.6.
- **Scope the manifest to the turn.** Not every Customer message needs checkout mutation Tools in context. The published patterns are lazy loading (declare Tools on request) and Tool RAG (retrieve the 3–5 relevant Tools per turn), the latter reported to move selection accuracy from 13 % to 43 % at 100+ Tools ([Tool RAG](https://webscraft.org/blog/tool-rag-scho-robiti-koli-u-agenta-zabagato-instrumentiv?lang=en), [semantic tool discovery](https://arxiv.org/pdf/2603.20313)). At 15 Tools SupportOps does not need a retrieval layer over Tools; a static grouping — read-only catalog/order Tools always, cart/checkout mutation Tools only once the conversation is in a purchase flow — captures most of the benefit with no new machinery. → not yet done; 7.4.

Both changes shrink the cached prefix, which reduces the prefill the provider must do even on a cache hit.

### 3.3 Protect the cache prefix

Caching is already working, so the main risk is silently breaking it. Cache reuse requires the entire rendered prefix to match, and it is invalidated by a change of model, Tool set, Tool ordering, schemas, output format, or reasoning effort ([OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)). Consequences for this codebase:

- `resolveTools` returned Prisma `findMany` order with no explicit `orderBy`. An unstable Tool order is an unstable prefix. → sorted in 6.4.
- Section 3.2's per-turn Tool scoping trades cache stability for a smaller manifest. Use a small number of fixed loadouts, not a per-message computed set, so each loadout keeps its own warm cache.
- `replyPrompt` interpolated `${clarificationCount}` in the middle of otherwise static text, splitting the static block into a cacheable head (~610 tokens) and a tail (~550 tokens) that changed whenever the count changed. → moved to the tail in 6.5, taking the cacheable prefix to ~1,150 tokens.
- Admin `instructions` and `resolutionMessage` are stable per Workspace, so their position near the top is fine.

### 3.4 Budget the output, including reasoning

51.5 % of output tokens are reasoning. Output tokens are the expensive bucket and the one that drives generation time: cutting 50 % of output tokens cuts roughly 50 % of latency, while cutting 50 % of the prompt yields only 1–5 % ([OpenAI latency optimization](https://developers.openai.com/api/docs/guides/latency-optimization)). The model is `gpt-5.6-luna`, and `@anvia/openai` types its reasoning effort as `"none" | "low" | "medium" | "high" | "xhigh" | "max"`, settable through `Agent`'s `controls` (`{ reasoningEffort }`) or `completionModel({ controls })`. Neither was set, so the turn ran at the provider default. → both are now configurable (6.7), with no value chosen yet (7.3).

Test `low` — and `none` for the no-Tool conversational path — against the `decision`, `gEval`, and `visibility` suites. Reasoning effort is part of the cache key, so each setting needs its own warm-up before the comparison is fair.

### 3.5 Do not run the agent loop when nothing needs it

`maxTurns` is 5 with Tools and 1 without, and the Tool budget is 15 calls / 60 s. A `RESOLVE` on "thanks" or a `CLARIFY` that asks for an order number does not need the checkout manifest, does not need retrieval, and does not need 5 turns. The cheapest token is the one never sent ([OpenAI latency optimization](https://developers.openai.com/api/docs/guides/latency-optimization), principle 7).

## 4. Latency: what the evidence supports

### 4.1 The number that matters is not being measured

`EvalTurnOutput.durationMs` is total turn time. The Customer sees streamed deltas, so the perceived latency is time to first token, and a 4 s completion behind a 300 ms TTFT is a different product from the same 4 s behind a 4 s TTFT ([TTFT as an SLO](https://tianpan.co/blog/2026/04/23/ttft-latency-slo-streaming-reasoning-models)). The defensive target quoted for chat UX is sub-2 s p95 TTFT, and p95 typically inflates 1.6–3.2× over p50, so SLOs anchor on p95.

TTFT was one field away: `streamReply` already has `onDelta`. → `ttftMs` and `ttfcMs` added in 6.1. Every latency figure in baseline B0 above predates them, so B0 has no TTFT column; B1 will.

Caveat for this stack: the reply is a structured output (`replyOutputSchema`), so the first text delta is a JSON fragment, and the first *Customer-visible* token arrives only once `content` starts streaming. Measure both — first delta and first `content` character — because the widget can only render the second.

### 4.2 Overlap stages instead of chaining them

`runAiAgentTurn` runs `retrieve()` → `countClarifications()` → `loadMemory()` → `tools()` → model, each awaited in sequence. These four are independent: they touch different rows and none consumes another's output. `Promise.all` removes three serial database round trips from before the first model token. → done in 6.3. Overlapping pipeline stages rather than running them in series is the single largest recoverable latency budget in agent systems ([OpenAI latency optimization](https://developers.openai.com/api/docs/guides/latency-optimization), [AWS AGENTPERF03-BP03](https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentperf03-bp03.html)).

Inside the loop, the grounded path is model → `searchKnowledge` → model → MCP → model. The `tool` suite's 8.6 s/case versus `visibility`'s 6.3 s/case is that extra round trip. Published approaches reduce it by predicting and prefetching the likely retrieval in parallel with the first model call and discarding it on a miss ([Stream RAG](https://arxiv.org/html/2510.02044), [predictive prefetching for RAG](https://arxiv.org/pdf/2605.17989), [VoiceAgentRAG](https://arxiv.org/html/2603.02206v1) reports a 75 % cache hit rate on a dual-agent prefetch design). For SupportOps the cheap version is speculative: start the `searchKnowledge` embedding + query on the raw Customer message at the same time as the first model call, and hand the result to the Tool executor if the model asks for it. It costs one embedding call per turn and removes one full round trip from the common path. → not yet done; 7.6.

### 4.3 The retry loop is an unbounded tail

`runAiAgentTurn` retries `streamReply` twice with no timeout between attempts, and the Tool budget allows 60 s inside each. The worst case is therefore roughly two minutes, and the second attempt starts from scratch. Bound the per-attempt wall clock so the retry can still fit inside a Customer-tolerable envelope, or drop the retry for the streaming path where deltas have already been published. → not yet done; 7.5.

### 4.4 Cap the output

`Agent` accepts `maxTokens`. A Customer-facing support reply has a natural ceiling well under the model's default. This is the same lever as section 3.4 and pays in both currencies. → wired in 6.7, value still unset (7.3).

## 5. Harness defects found while measuring

Two defects made this analysis harder than it should have been, and both were in the reporting, not the Agent. Both are fixed — see 6.1 and 6.2.

1. **The printed Case payload truncated away the numbers.** `retrieved` is serialised before `usage` and `toolCalls`, so the 16 KB capture cut off exactly the fields cost and latency work needs — 10 of 17 sampled Cases had no readable usage. → 6.1.
2. **`faithfulness` reported `invalid` when the Agent legitimately did not retrieve.** `common-split-shipment` chose `CLARIFY` with `retrieved: []` — correct behaviour graded as a metric error. → 6.2.

Still missing after 6.1, and worth adding when a question needs them: retrieval duration as its own span, per-Tool duration rolled up per Case, model-call count per Case, and suite-level p50/p95 aggregation rather than per-Case lines a reader has to add up by hand.

## 6. Changes implemented

All of the following landed on 2026-09-16 against baseline B0, verified by `vitest run --root packages/ai-agent` (40 passing), `tsc --noEmit`, and `biome check`. **None of them has been measured against the eval suite yet** — that is step 7.1. Expected effects below are predictions, not results.

### 6.1 Per-Case cost and latency line, and TTFT instrumentation

- `apps/api/src/evals/target.ts:60` — `ttftMs` and `ttfcMs` added to `EvalTurnOutput`; `target.ts:250` records the first streamed delta and `target.ts:253` the first character of Customer-visible `content`.
- `apps/api/src/evals/run.ts:277` — `costLine()` prints one compact line per Case as the turn finishes: `ttft / content / total`, `in (cached) out (reasoning)`, tool-call count, chunk count.

Why: the reporter serialises `retrieved` before `usage`, so the 16 KB capture cut off exactly the fields a cost or latency question needs — 10 of 17 sampled Cases in B0 had no readable usage at all. Two numbers now exist that never did: `ttftMs`, the latency the Customer actually perceives behind a stream, and `ttfcMs`, the point the Widget can render text rather than JSON envelope (the reply is a structured output, so the first delta is not text).

Verify: any suite run now prints a `cost:` line per Case.

### 6.2 `faithfulness` grades a non-retrieving turn instead of reporting `invalid`

- `apps/api/src/evals/run.ts:100` — an empty retrieval context is replaced with an explicit statement that nothing was retrieved.

Why: `common-split-shipment` chose `CLARIFY` with `retrieved: []` — correct behaviour, reported as a metric error. Stating the absence keeps the Case gradable in the direction that matters: a reply that asserts a company fact with no Knowledge behind it now fails, where before it was not graded at all.

Verify: `pnpm eval:ai-agent faithfulness` reports 3 graded Cases, 0 invalid.

### 6.3 Four serial pre-model loads run in parallel

- `packages/ai-agent/src/turn.ts:84` — `retrieve`, `countClarifications`, `loadMemory` and `tools` moved into one `Promise.all`.

Why: none consumes another's output, and all four sat in front of the first model token — the part of the turn the Customer feels. Expected effect: three database round trips removed from TTFT. Risk: none identified; the four runtime methods touch different rows and the `loadTicket` they depend on is still awaited before them.

Verify: `ttftMs` in 6.1 drops by roughly the cost of three sequential Prisma queries.

### 6.4 Stable Tool ordering

- `apps/api/src/modules/tools/services.ts:186` — `orderBy: { id: "asc" }` on `resolveTools`.

Why: the rendered Tool manifest is the cached prompt prefix, and cache reuse requires the entire prefix to match. Prisma's unordered `findMany` gave no guarantee the manifest rendered the same way twice, and a reordered manifest discards the whole cache on the next turn.

Verify: `cachedInputTokens / inputTokens` stays high across consecutive runs.

### 6.5 Clarification count moved to the volatile prompt tail

- `packages/ai-agent/src/prompts/reply.ts:39` — `${clarificationCount}` now sits at the end of the prompt, beside the Attachments block; the sentence that referenced it points forward instead of interpolating mid-prompt.

Why: a value interpolated into the middle of otherwise static text splits the static block and throws away the cache on every token after it. Measured: the prefix shared between a 0-clarification and a 2-clarification prompt went from ~610 to ~1,150 tokens — the whole system prompt is now cacheable.

Verify: `replyPrompt({ clarificationCount: 0 })` and `replyPrompt({ clarificationCount: 2 })` share everything up to the tail.

### 6.6 Tool schemas sent once, as real parameter schemas

- `packages/ai-agent/src/tools.ts:34` and `toInputSchema()` — the stored JSON Schema is converted with `z.fromJSONSchema` and passed as the Tool's own parameter schema. A schema that will not convert keeps the previous description-carried form, so no Tool loses its arguments.
- `packages/ai-agent/src/tools.test.ts` — two Cases: a convertible schema rejects a wrong-typed argument (proving the schema reaches the provider), an unconvertible one still accepts input (proving the fallback).

Why: `inputSchema` was `z.record(z.string(), z.unknown())` — an open schema — while the real JSON Schema was stringified into the Tool *description*. Every request therefore carried the checkout schemas twice. No new dependency: `z.fromJSONSchema` ships with the Zod 4.4 already installed.

Expected effect: removes one of two copies of a ~13.5 k-token manifest. Not the whole manifest — the provider still renders the parameter schema — so treat the saving as "one copy", and let 7.1 settle the number.

Verify: `cost:` lines show a lower `in` count than B0's ~11.7 k on a comparable Case.

### 6.7 Output budget and reasoning-effort knobs

- `apps/api/src/config.ts:162,164` — `LLM_MAIN_MAX_OUTPUT_TOKENS` and `LLM_MAIN_REASONING_EFFORT` on `aiAgentConfig`.
- `packages/ai-agent/src/turn.ts:46,48,105` → `reply.ts:55,75` → `telemetry.ts` — threaded to `Agent`'s `maxTokens` and `controls`.

**Both default to unset, so behaviour is unchanged.** This ships the knob, not a decision: 51.5 % of output tokens are reasoning and output tokens dominate generation time, but which effort level holds the quality floor is an empirical question, and reasoning effort is part of the prompt-cache key. Choosing a value is step 7.3.

### 6.8 Suite-level p50/p95 summary line

- `apps/api/src/evals/run.ts:238,268` — the per-Case outputs collected while a suite runs are rolled up into one `summary [...]` line printed right after that suite's last `cost:` line.

Why: section 5 named this as still missing — the reader adding up 23 per-Case `cost:` lines by hand is exactly where a baseline comparison goes wrong. The summary reports TTFT, time-to-content, and end-to-end duration as p50/p95 (not means, since a mean hides the tail this document cares about), total input tokens with the cached ratio, output and reasoning tokens, and tool calls per Case. A Case whose provider reported no `usage` is dropped from the token figures rather than counted as zero, so one untracked Case cannot understate the rest.

Verify: `pnpm eval:ai-agent negativecontrol` prints `summary [northstar-negative-control] (1 cases, 1 with usage): ttft p50 6360ms / p95 6360ms | content p50 6360ms / p95 6360ms | total p50 6368ms / p95 6368ms | in 22849 (cached 46%) out 107 (reasoning 10) | tools 1.0/case` after its Case.

### 6.9 Bound the retry tail — #185

- `packages/ai-agent/src/turn.ts` — each `streamReply` attempt is wrapped in a 60 s wall-clock timeout (`TURN_TIMEOUT_MS`, the same magnitude as the Tool budget in `tools.ts`). A timed-out attempt never retries. A fast, empty failure (no delta reached the Customer) still gets one retry, also bounded by the same clock. Once any delta has reached the Customer, the turn does not retry at all, whether the failure is a timeout or a plain error — restarting a reply the Customer is mid-way through reading is worse than escalating once.
- On timeout the turn escalates with the existing `AI_TIMEOUT` reason (already wired to a Customer-facing acknowledgement in `apps/api/src/modules/ai-agent/turn.ts`), not the generic `AI_GENERATION_FAILED` — a stated, deliberate outcome rather than a silent hang.
- `packages/ai-agent/src/turn.test.ts` — covers a hung attempt escalating with `AI_TIMEOUT` without retrying, and a failure after a delta has streamed not retrying either.

Why: `runAiAgentTurn` retried twice with no timeout at all outside the Tool budget, so a hung model call (no Tools involved) had no ceiling, and a retry after deltas had already streamed restarted a reply the Customer was reading. Stated worst-case wall clock for a single turn: 60 s if the first attempt hangs or the Customer has already seen output, up to 120 s only for the narrow case of a fast, silent failure followed by a full timeout on the retry — down from the previous unbounded-times-two.

Verify: `pnpm --filter @repo/ai-agent test` (42 passing), `tsc --noEmit`, `biome check`.

## 7. Next steps

Tracked as GitHub issues #176–#187, all labelled `ready-for-agent`. Each section below names the issues that carry it.

### 7.1 Re-measure B0 → B1 (do this first) — #176, #177

Nothing in section 6 has a measured result. Re-run every suite and record the new numbers beside the baseline in section 1:

```
pnpm eval:ai-agent faithfulness
pnpm eval:ai-agent decision
pnpm eval:ai-agent tool
pnpm eval:ai-agent visibility
pnpm eval:ai-agent negativecontrol
pnpm eval:ai-agent language
pnpm eval:ai-agent relevancy
pnpm eval:ai-agent geval
pnpm eval:ai-agent contains
```

Read from the new `cost:` lines: TTFT p50/p95, `ttfc` p50/p95, end-to-end p50/p95, input tokens, cached ratio, output and reasoning tokens. Two specific questions B1 answers: how much of the ~13.5 k manifest 6.6 actually removed, and whether 6.3 moved TTFT at all.

Watch for one regression class in particular: 6.6 turns an open argument schema into a strict one. A Tool whose stored schema is narrower than what the model was previously allowed to send will now reject arguments it used to accept. `tool-unknown-order` was already failing in B0; if more `tool` Cases fail in B1, that is the first thing to check.

### 7.2 Fix what B0 says is broken, before optimising further — #178, #179, #180, #181

Quality failures are not latency work and should not wait behind it:

- `negative-control` — a failing negative control means the suite cannot currently prove the Agent declines what it should decline. Highest priority of the set: it is the Case that certifies the others mean anything.
- `edge-no-first-scan` — faithfulness 0.33: the reply asserted carrier semantics ("label created means…", "no scan for three business days") that the retrieved passages do not contain. Either the Knowledge lacks a carrier-event section the answer needs, or the prompt permits explanation beyond retrieval. Decide which before touching retrieval parameters.
- `common-return-window`, `escalation-two-completed-charges`, `tool-unknown-order`, and the two `decision` failures — triage individually against their traces.

### 7.3 Choose values for the 6.7 knobs — #183

A/B `LLM_MAIN_REASONING_EFFORT` at `low`, then `none`, against `decision`, `gEval`, `visibility` and `negativeControl`. Set `LLM_MAIN_MAX_OUTPUT_TOKENS` to a ceiling a Customer-facing reply cannot legitimately exceed. Warm the cache separately for each setting before comparing — reasoning effort is part of the cache key, so the first run at a new setting pays full price and will look slower than it is.

Keep the setting only if the quality floor in section 8 holds. Reverting is one environment variable.

### 7.4 Scope the Tool manifest to fixed loadouts — #184

The manifest is still sent whole on every turn, including checkout mutation Tools on a "where is my order" question. Use a small number of *static* loadouts — read-only catalog/order Tools always, cart/checkout Tools only once the conversation is in a purchase flow — not a per-message computed set, so each loadout keeps its own warm cache.

`@anvia/core` ships `createToolIndex`/`embedTools` for retrieval over Tools. At 15 Tools that is more machinery than the problem needs; reach for it only if the Tool count grows past a few dozen, where the published accuracy cliff actually is.

### 7.5 Bound the retry tail — #185

Done — see 6.9.

### 7.6 Speculative retrieval prefetch — only if TTFT is still high — #186

Start the `searchKnowledge` embedding and query on the raw Customer message in parallel with the first model call, and hand the result to the Tool executor if the model asks for it. Costs one embedding call per turn, removes one full round trip from the common grounded path. Do this only if B1 shows TTFT still above target after 6.3.

### 7.7 Retrieval tuning — last — #182 (labelling), #187 (tuning)

Top-k, reranking, chunk sizing. Blocked on gold chunk IDs and precision@k in the eval; without them this is tuning without a signal, and 3.1 explains why the numbers do not currently justify it.

**#182 done, unmeasured.** 10 of 23 Cases now carry expected-passage labels — a Knowledge Source title plus a distinctive text fragment, resolved to live Chunk IDs at run time rather than stored as a position-based Chunk ID that silently repoints on re-chunking. A label that resolves to zero Chunks fails the Case as `invalid` instead of scoring zero. The `retrieval` suite reports recall@k, precision@k, and first-relevant rank per Case (`apps/api/src/evals/retrieval.ts`). Not yet run against the live Workspace — this environment has no `EVAL_WORKSPACE_ID` or model credentials — so #187 stays blocked until `pnpm eval:ai-agent retrieval` produces a real baseline.

## 8. Acceptance checks

No change in section 7 ships without both:

- **Quality floor holds.** `decision`, `tool`, `visibility`, `negativeControl`, `language` pass rates do not regress against the most recent measured baseline; `faithfulness` and `gEval` do not regress. `negativeControl` and `visibility` are hard gates — a cost or latency win that costs a leak is not a win.
- **The claimed saving is measured, not argued.** Report before/after for: TTFT p50/p95, `ttfc` p50/p95, end-to-end p50/p95, input tokens, cached-token ratio, output tokens, reasoning tokens, model calls per Case. A cached-token ratio that falls after a prompt or Tool change means the prefix was broken; that is a regression even if the raw token count went down.

## Sources

- [OpenAI — prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
- [OpenAI — latency optimization](https://developers.openai.com/api/docs/guides/latency-optimization)
- [OpenAI — model guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [AWS Well-Architected agentic AI lens — AGENTPERF03-BP03](https://docs.aws.amazon.com/wellarchitected/latest/agentic-ai-lens/agentperf03-bp03.html)
- [Time-to-first-token as a latency SLO](https://tianpan.co/blog/2026/04/23/ttft-latency-slo-streaming-reasoning-models)
- [The over-tooled agent problem](https://tianpan.co/blog/2026-04-19-over-tooled-agent-problem)
- [How many MCP tools is too many?](https://archestra.ai/blog/how-many-mcp-tools-too-many)
- [ToolChoiceConfusion: causal minimal tool filtering](https://arxiv.org/html/2606.06284)
- [Semantic tool discovery for MCP tool selection](https://arxiv.org/pdf/2603.20313)
- [Tool RAG for oversized tool sets](https://webscraft.org/blog/tool-rag-scho-robiti-koli-u-agenta-zabagato-instrumentiv?lang=en)
- [Stream RAG: streaming tool usage](https://arxiv.org/html/2510.02044)
- [Predictive prefetching for RAG](https://arxiv.org/pdf/2605.17989)
- [VoiceAgentRAG: dual-agent prefetch](https://arxiv.org/html/2603.02206v1)
- [Rerankers and the latency budget](https://dev.to/gabrielanhaia/rerankers-and-the-latency-budget-when-cross-encoders-are-worth-it-3efc)
