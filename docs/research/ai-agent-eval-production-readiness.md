# AI Agent eval: production-readiness gaps and recommendations

Date: 2026-09-16

## Executive summary

The pasted `northstar-contains` run proves only that six required substrings appeared in six answers. It does **not** yet prove that retrieval was good, answers were fully correct and grounded, Tools were selected correctly, unsafe information was withheld, or the system meets a production latency/cost budget. `Usage: target=0 evaluation=0 total=0 tokens` is not evidence of zero token consumption: the run clearly called the completion model, Knowledge retrieval, and Shopify. It means token accounting is absent or not propagated into the eval runner's usage summary.

The highest-value next step is not another evaluator framework. Keep the existing Anvia + OTLP path and make each run report a small, comparable scorecard: quality by dimension, latency percentiles, model/Tool/token usage, estimated cost, and version metadata.

## What is missing from this report

### 1. Reproducibility metadata

The report has a suite name and run ID, but lacks:

- timestamp and environment;
- git SHA/application version;
- Workspace and Knowledge snapshot/version;
- model-under-test provider/model ID and parameters;
- judge provider/model ID and threshold where applicable;
- prompt/instruction version or hash;
- embedding model, chunking/retrieval configuration, and `top_k`;
- enabled Tool set and Tool schema/version.

Without these, two green runs cannot be compared or reproduced. Official LangSmith guidance treats an experiment as a run of one application version on one dataset and recommends recording metadata so configurations can be compared and grouped ([evaluation concepts](https://docs.langchain.com/langsmith/evaluation-concepts), [evaluating an application](https://docs.langchain.com/langsmith/evaluate-llm-application)).

### 2. Real usage and cost

The zero-token line is the most obvious reporting defect. Record separately for the target and evaluators:

- input, cached-input, output, and reasoning tokens;
- model-call count and judge-call count;
- embedding tokens or requests;
- estimated target cost, evaluation cost, and total cost;
- tokens and cost per Case plus suite totals.

The OpenAI response schema exposes `input_tokens`, `cached_tokens`, `output_tokens`, `reasoning_tokens`, and total tokens, so these values should be propagated instead of inferred ([Responses API reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)). OpenTelemetry's GenAI conventions likewise define input/output usage attributes and state that input usage includes cached tokens ([GenAI semantic attributes](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/)).

### 3. Latency breakdown and distribution

`Duration: 43134ms` is only suite wall time. It does not show whether the bottleneck is the model, vector search, Shopify MCP, serial execution, or setup/teardown. Capture per Case and per span:

- end-to-end latency;
- time to first token and streaming completion time, if Customer-facing streaming is used;
- each model call's duration;
- retrieval duration;
- each Tool call's duration, retry count, timeout, and result status;
- number of model turns/agent loop iterations;
- setup and teardown duration.

Aggregate with median and p90/p95, not average alone; report min/max for this small offline dataset. OpenTelemetry prescribes duration histograms for discrete operations and standardized GenAI operation attributes ([metric naming](https://opentelemetry.io/docs/specs/semconv/general/naming/), [GenAI semantic attributes](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/)).

### 4. Retrieval quality

The dump shows eight retrieved Chunks for simple questions and many are visibly irrelevant. For example, the refund Case retrieved wrong-item, gift-return, fraud, return-lifecycle, and policy-edge passages. The answer passed because it contained the expected duration, not because retrieval was efficient or precise.

Add a small gold set of relevant `chunkId` or section IDs per retrieval Case and report:

- hit rate / recall@k: did at least one required Chunk appear?;
- precision@k: how much of the returned set was relevant?;
- reciprocal rank or rank of the first relevant Chunk;
- retrieved Chunk count and retrieved characters/tokens;
- duplicate/adjacent-overlap rate;
- wrong-visibility and stale-source rate.

Also keep answer-level dimensions separate: correctness against the reference answer, relevance to the Customer question, and groundedness against actual retrieved context. This decomposition is the recommended RAG evaluation model in LangSmith's official guide ([RAG evaluation tutorial](https://docs.langchain.com/langsmith/evaluate-rag-tutorial)). OpenTelemetry also defines structured retrieval documents with at least document ID and relevance score, which maps well to the existing `chunkId` and similarity values ([GenAI semantic attributes](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/)).

### 5. Tool-call correctness

The report records Tool calls but the `contains` metric does not grade them. A correct price can pass even if the Agent used the wrong Tool, issued a broad query, selected the wrong product among similar results, called an unnecessary Tool, retried wastefully, or ignored a failed Tool.

Grade Tool behavior independently:

- required/forbidden Tool selection;
- argument/schema correctness and minimum necessary query scope;
- result selection correctness (exact product/variant/SKU);
- unnecessary Tool-call count;
- failed call, retry, and timeout handling;
- trajectory/ordering where order matters;
- abstention or Escalation when a Tool fails or returns ambiguity.

Official agent-evaluation guidance separates final-response, single-step Tool selection/arguments, and full trajectory evaluation ([application-specific evaluation approaches](https://docs.langchain.com/langsmith/evaluation-approaches)).

### 6. Output quality beyond substring presence

`contains` is useful as a cheap deterministic smoke check, but it permits materially wrong answers such as “refunds take 5–10 business days before processing” because the expected substring is still present. For each important Case, score the dimensions that matter rather than one omnibus pass:

- factual correctness and required conditions/exceptions;
- groundedness/no unsupported claims;
- directness and completeness;
- correct decision (`REPLY`, `CLARIFY`, `ESCALATE`, `RESOLVE`);
- safety/privacy and Internal-Only leakage;
- language and tone;
- concise Customer-facing form;
- valid structured output/schema.

Prefer deterministic graders for exact decisions, Tools, schema, canaries, numbers, and prohibited claims; reserve LLM judges for semantic correctness, completeness, and tone. OpenAI's Eval API supports string, similarity, label/score-model, Python, and combined graders, matching this mixed approach ([grader types](https://developers.openai.com/api/reference/ruby/resources/graders/subresources/grader_models)).

### 7. Statistical confidence and regression comparison

Six of six on one nondeterministic run is too small to estimate reliability. The full suite should show:

- total Cases by category and metric, including skipped/invalid Cases;
- pass rate per category, not only an overall rate;
- repeated-run pass rate for judge-based or flaky Cases;
- baseline-versus-candidate delta for quality, p95 latency, tokens, and cost;
- the worst regressions and links/IDs for failed traces;
- positive and negative controls.

Run repetitions only for nondeterministic high-risk Cases; deterministic Cases do not need repeated spend. Official evaluation guidance distinguishes offline benchmark/regression tests from online production monitoring and supports aggregate metrics such as precision, recall, F1, and distributions ([evaluation types](https://docs.langchain.com/langsmith/evaluation-types)).

## Recommended compact report shape

```text
northstar / contains / run <id>
candidate: git=<sha> prompt=<hash> model=<provider/model> knowledge=<snapshot>
dataset: 6 run, 6 pass, 0 fail, 0 invalid, 0 skipped

quality: contains 100% | groundedness n/a | retrieval hit@8 n/a | tool accuracy n/a
latency: e2e p50 ...ms | p95 ...ms | model ...ms | retrieval ...ms | tools ...ms
usage: target in/cached/out/reasoning .../.../.../... | judge ... | cost $...
efficiency: model calls/case ... | tool calls/case ... | retrieved tokens/case ...

case                         result  ms     in/out  retrieval       tools
common-refund-posting        PASS    ...    ...     hit 1/8 @ rank1 searchKnowledge OK
...
```

For a filtered `contains` run, explicitly render unmeasured dimensions as `n/a`; never let `6/6 pass` look like a claim about the whole Agent.

## Performance plan, ordered by return on effort

1. **Measure before tuning.** Fix usage propagation and add span timing first. Keep the existing OTLP pipeline; no new observability dependency is needed.
2. **Reduce retrieved context.** The examples return eight Chunks when one or two contain the answer. Tune `top_k`, similarity threshold, deduplication, and section/adjacent-Chunk expansion against recall@k and answer quality. Optimize retrieved tokens, not merely Chunk count.
3. **Cap response shape.** Ask for a direct answer with explicit length/format constraints and enforce structured output for the decision envelope. OpenAI recommends treating answer length separately from reasoning quality and using Structured Outputs rather than describing schemas in prose ([model guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.5)).
4. **Exploit stable prompt prefixes.** Put static system instructions and Tool definitions first, dynamic conversation/retrieval later, then measure cached tokens/cache-hit rate. OpenAI states that prompt caching can reduce latency and input cost, recommends stable prefixes and a stable cache key, and exposes cached-token usage ([model guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.5)).
5. **Minimize calls, not safeguards.** Avoid Knowledge search for pure conversational turns and avoid catalog calls for static policy; preserve required verification for dynamic price, stock, order, payment, and security facts.
6. **Use the cheapest model that passes the same scorecard.** Compare candidate models on quality floor, p95 latency, and cost per successful Case. Do not choose on token price alone.
7. **Parallelize only after state isolation.** The runner intentionally uses one scratch Ticket and `concurrency: 1`; parallel Cases would corrupt shared Agent Memory. If full-suite runtime becomes material, give each Case its own scratch Session/Ticket, then use bounded concurrency. For the current six-Case filtered run, retrieval/context reduction is the safer first optimization.

## Production release gates

Use two layers:

- **Offline before AI changes:** full curated suite, category floors, zero critical guardrail/privacy failures, and no material regression in p95 latency or cost per successful Case.
- **Online after release:** sampled production traces with reference-free groundedness/relevance/safety checks, plus operational dashboards and alerts for error rate, Escalation rate, Tool failures, p95 latency, token/cost drift, and Customer feedback.

Production traces should retain inputs, outputs, intermediate Tool/retrieval steps, metadata, latency, and feedback under the repository's existing safe-mode/privacy policy. LangSmith's official model similarly separates offline evaluation from online monitoring and defines a run as inputs, outputs, intermediate steps, and metadata ([evaluation concepts](https://docs.langchain.com/langsmith/evaluation-concepts)).

## Minimal implementation sequence

1. Make non-zero provider usage visible per model span and roll it up by Case/suite.
2. Add per-Case end-to-end and component timings; print p50/p95 and slowest Cases.
3. Add run metadata hashes/IDs and baseline comparison.
4. Add gold Chunk IDs to a focused retrieval subset and compute hit/precision/rank metrics.
5. Report existing `decision`, `tool`, `visibility`, `faithfulness`, and semantic suites together as a release scorecard instead of presenting one filtered metric as the overall result.
6. Only then tune `top_k`, context size, prompt length, output budget, model choice, caching, or concurrency, accepting a change only when the quality floor holds.

## Reporting backend recommendation

Keep Lens for local trace debugging and Langfuse for the production backend. The current OTLP design already avoids vendor coupling, and Langfuse provides datasets, experiment runs, scores, annotation workflows, and OpenTelemetry experiment ingestion; adding another hosted backend now would duplicate data and operational work rather than fix the missing measurements ([Langfuse datasets](https://langfuse.com/docs/evaluation/experiments/datasets), [Langfuse experiment data model](https://langfuse.com/docs/evaluation/experiments/data-model)).

Consider another tool only when a concrete workflow remains missing:

- **Phoenix** for a local/open-source RAG investigation workspace with tracing, datasets, experiments, and evaluations. It is the most relevant complement if Chunk-level retrieval debugging becomes the main bottleneck ([Phoenix documentation](https://arize.com/docs/phoenix/)).
- **Braintrust** when immutable experiment snapshots, side-by-side regression comparison, and a dedicated eval workflow become more important than keeping the existing OTLP pipeline minimal ([Braintrust experiments](https://www.braintrust.dev/docs/evaluate/run-evaluations)).
- **LangSmith** when the team specifically wants mature dataset versioning, experiment comparison, human review, and online evaluators. It would overlap heavily with Langfuse and is therefore a replacement candidate, not a default addition ([LangSmith evaluation concepts](https://docs.langchain.com/langsmith/evaluation-concepts)).

For the current system, first complete usage, trace correlation, timing, and score payloads in Lens/Langfuse. Reassess tooling only after those are visible and a remaining limitation can be named.
