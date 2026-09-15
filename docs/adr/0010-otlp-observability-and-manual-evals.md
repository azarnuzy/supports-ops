# OTLP-based observability, and evals as a manual tool

Agent telemetry goes through `@anvia/otel` to an OTLP endpoint. `packages/logger` exports only explicit AI Agent, model, retrieval, and Tool spans; automatic HTTP, database, DNS, and network instrumentation is deliberately disabled so infrastructure noise does not consume the telemetry backend's quota. The OTLP destination is configuration, not architecture: Langfuse Cloud to begin with, swappable for Phoenix, SigNoz, Grafana, or self-hosted Lens by changing an environment variable.

Lens was the obvious choice — it is Anvia's native product and captures agent, tool, and model spans end to end. It was rejected because self-hosting it needs seven services including ClickHouse, which does not fit the 4GB machine this product deploys to, and because `@anvia/otel` turns out to offer the same three capabilities that mattered: full agent/tool/model tracing, eval reporting, and runtime scoring. `@anvia/langfuse`, despite being the first-party adapter for the chosen backend, is **not** used: its documented emphasis is evals and scores rather than complete agent tracing. Routing through OTLP also means one telemetry pipeline instead of two disconnected ones, since `packages/logger` was already configured for OpenTelemetry and unused.

## Telemetry is not the audit trail

AI Activity is a product record: what knowledge was retrieved and from which sources, which Business Tool was called and whether it succeeded, what the AI Agent decided, why it escalated, what it classified. It is written to our own database, surfaced to Admins in the Activity Timeline, retained for the life of the Ticket, and never contains the model's private reasoning. Telemetry is a developer tool: spans, prompts, tokens, latency, captured in `safe` mode, and free to expire. Neither may stand in for the other, and Anvia's own documentation is explicit that its telemetry must not replace product records or audit logs.

## Evals run on demand, not in CI

Eval suites are built with `runEvalSuite` and `agentEvalTarget` from `@anvia/core/evals`, and are run by hand — before a release, and whenever a prompt, retrieval strategy, or model changes. They are deliberately not a CI gate: judge-based metrics call a real model, so gating every push would spend money on commits that never touch the AI Agent, and would make CI slow and flaky because judge scores carry variance. Evals here are an instrument for judging a change to the AI, not a check on every commit.

Metrics favour deterministic checks (`exactMatch`, `contains`) and reserve model-judged ones (`faithfulness`, `answerRelevancy`, `gEval`) for the few requirements that genuinely need them. Every suite includes negative controls — cases that must fail — so that a broken evaluator cannot quietly mark everything as passing.

## Cases run against a configured Workspace, not a fixed corpus

An earlier version of this decision held that Eval Cases run against an in-memory corpus and never against a live Workspace, because a Workspace's contents change. That is now reversed. The thing worth evaluating is the AI Agent an Admin actually configured — its `AiAgent.instructions`, its published Knowledge Sources, its assigned MCP Tools, its chunking and embedding of those Sources — and none of that exists in a fixed corpus. A suite that passes against a hand-written corpus says nothing about whether retrieval found the right chunk, whether a Tool description steered the model correctly, or whether an Internal-Only document leaks.

So `apps/api/src/evals` runs `runAiAgentTurn` — the production turn, unmodified — against the Workspace named by `EVAL_WORKSPACE_ID`. Only the Runtime's side effects are swapped: replies, escalations, and resolutions are captured in memory rather than written to the Ticket, published to the Widget, or queued for follow-up. One scratch Ticket is created per run and deleted afterwards, because the production Tool path scopes retrieval and records AI Activity by Ticket.

The cost of that reversal is real and accepted: a case can now fail because a Knowledge Source changed rather than because the Agent regressed. That is the correct trade. A stable suite that tests a reconstruction of the Agent is worse than a suite that tells the truth about the one in production.

Tools that irreversibly mutate live commerce state — `complete_checkout`, `cancel_checkout`, `cancel_cart` — are withheld from the eval Agent regardless of assignment. A suite that runs on every prompt change must never place a real order. Cases about mutation assert that the Agent proposes, confirms, or escalates, which is the behaviour worth defending anyway.

## Completions and embeddings may use different gateways

`COMPLETION_GATEWAY_BASE_URL` routes reply, classification, and judge calls, and defaults to OpenRouter so an environment that sets only `OPENROUTER_API_KEY` keeps working. Embeddings stay pinned to OpenRouter via `embeddingGatewayBaseUrl`: the vector store holds chunks embedded by `EMBEDDING_MODEL`, so changing that provider or model invalidates every stored chunk and forces a full re-ingest. The judge model (`EVAL_JUDGE_MODEL`) is configured separately from the model under test, so a judge is never grading its own output.

## Lens in development, Langfuse in production

This ADR originally rejected Lens because self-hosting it needs seven services including ClickHouse. That objection stands for the 4GB production machine and is why production still exports to Langfuse. It does not apply to a developer's own machine, where Lens now runs locally and receives the same OTLP stream. Nothing in the code chooses between them: `createOtelEvalReporter` publishes eval results as OTLP scores, and `TELEMETRY_EXPORTER_OTLP_ENDPOINT` decides where they land.

