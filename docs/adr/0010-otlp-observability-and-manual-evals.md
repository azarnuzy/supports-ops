# OTLP-based observability, and evals as a manual tool

Agent telemetry goes through `@anvia/otel` to an OTLP endpoint. `packages/logger` exports only explicit AI Agent, model, retrieval, and Tool spans; automatic HTTP, database, DNS, and network instrumentation is deliberately disabled so infrastructure noise does not consume the telemetry backend's quota. The OTLP destination is configuration, not architecture: Langfuse Cloud to begin with, swappable for Phoenix, SigNoz, Grafana, or self-hosted Lens by changing an environment variable.

Lens was the obvious choice — it is Anvia's native product and captures agent, tool, and model spans end to end. It was rejected because self-hosting it needs seven services including ClickHouse, which does not fit the 4GB machine this product deploys to, and because `@anvia/otel` turns out to offer the same three capabilities that mattered: full agent/tool/model tracing, eval reporting, and runtime scoring. `@anvia/langfuse`, despite being the first-party adapter for the chosen backend, is **not** used: its documented emphasis is evals and scores rather than complete agent tracing. Routing through OTLP also means one telemetry pipeline instead of two disconnected ones, since `packages/logger` was already configured for OpenTelemetry and unused.

## Telemetry is not the audit trail

AI Activity is a product record: what knowledge was retrieved and from which sources, which Business Tool was called and whether it succeeded, what the AI Agent decided, why it escalated, what it classified. It is written to our own database, surfaced to Admins in the Activity Timeline, retained for the life of the Ticket, and never contains the model's private reasoning. Telemetry is a developer tool: spans, prompts, tokens, latency, captured in `safe` mode, and free to expire. Neither may stand in for the other, and Anvia's own documentation is explicit that its telemetry must not replace product records or audit logs.

## Evals run on demand, not in CI

Eval suites are built with `runEvalSuite` and `agentEvalTarget` from `@anvia/core/evals`, and are run by hand — before a release, and whenever a prompt, retrieval strategy, or model changes. They are deliberately not a CI gate: judge-based metrics call a real model, so gating every push would spend money on commits that never touch the AI Agent, and would make CI slow and flaky because judge scores carry variance. Evals here are an instrument for judging a change to the AI, not a check on every commit.

Metrics favour deterministic checks (`exactMatch`, `contains`) and reserve model-judged ones (`faithfulness`, `answerRelevancy`, `gEval`) for the few requirements that genuinely need them. Every suite includes negative controls — cases that must fail — so that a broken evaluator cannot quietly mark everything as passing.
