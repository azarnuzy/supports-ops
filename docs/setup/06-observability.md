# Observability

The AI Agent's Telemetry — spans, token counts, latency — is exported over OpenTelemetry to an OTLP endpoint (`ENABLE_TELEMETRY` and the `TELEMETRY_*` variables configure it). Only explicit AI Agent, model, retrieval, and Tool spans are exported: automatic instrumentation is disabled, and because a library can instrument itself against the global tracer once the SDK starts (better-auth emits HTTP, handler, and database spans of its own), the exporter takes spans from two tracers only — `@repo/logger` and `@anvia/otel`. Anything else is dropped in `startTelemetry`. See [ADR-0010](../adr/0010-otlp-observability-and-manual-evals.md) for why the backend is configuration, not architecture.

Token counts are exported under Anvia's own attribute names (`anvia.usage.input_tokens`, `anvia.generation.model_id`). A backend that reads those — Anvia Lens — reports tokens per run; one that expects the OpenTelemetry GenAI convention (`gen_ai.usage.*`), as Langfuse does, will show the spans without token or cost figures.

Telemetry is a developer tool and is captured in redacted ("safe") form by default: prompt and response bodies never leave the process, so Internal-Only material that reached a prompt is not exported in raw form. It is not the audit trail — AI Activity remains the product record behind the Activity Timeline, is written to our own database, and is unaffected by any of this. Telemetry backends are free to expire data; nothing here is a substitute for Messages or AI Activity.

## Creating the account and obtaining credentials

The default backend is [Langfuse Cloud](https://langfuse.com):

1. Create an account and a new organization/project. Pick a data region — EU (`cloud.langfuse.com`) or US (`us.cloud.langfuse.com`); the region determines the OTLP endpoint below.
2. In the project, open **Settings → API Keys** and create a new key pair. You get a **Public Key** (`pk-lf-…`) and a **Secret Key** (`sk-lf-…`). The secret key is shown once — store it immediately.
3. Langfuse's OTLP endpoint authenticates with HTTP Basic using `base64(publicKey:secretKey)`. Compute it:

   ```sh
   printf '%s' "pk-lf-…:sk-lf-…" | base64
   ```

4. Set the variables in `.env.local` (development) or `.env` (root Docker Compose production):

   ```sh
   ENABLE_TELEMETRY="true"
   TELEMETRY_EXPORTER="otlp"
   TELEMETRY_EXPORTER_OTLP_ENDPOINT="https://cloud.langfuse.com/api/public/otel"   # US: https://us.cloud.langfuse.com/api/public/otel
   TELEMETRY_API_KEY="Basic <the base64 value from step 3>"
   TELEMETRY_API_KEY_HEADER="authorization"
   TELEMETRY_SERVICE_NAMESPACE="supportops"
   ```

   `TELEMETRY_API_KEY` accepts a preformatted credential: a value with an explicit scheme (`Basic …`) is sent verbatim; a bare value sent under `authorization` gets the conventional `Bearer ` prefix.

Both `apps/api` (classification, reply generation, Business Tool calls) and `apps/worker` read this configuration. Pending spans are flushed on `SIGINT`/`SIGTERM` and on normal process exit, so short-lived scripts do not lose them.

## Seeing prompts and answers (`TELEMETRY_CAPTURE_MODE`)

`safe` (the default, and the only value production may use) exports the shape of a run — spans, durations, token counts, decisions — but no prompt or response bodies. A trace then reads as "No data captured" where the content would be.

`TELEMETRY_CAPTURE_MODE="full"` exports those bodies, which is how a local run shows what the AI Agent was actually asked, what each Tool returned, and what it answered. Use it only against a telemetry backend running on your own machine: a prompt can contain Internal-Only Knowledge and Customer data, and `full` sends both verbatim.

## Sessions

One Session is one conversation — not one Ticket. A Session starts at the Customer's first message, before any Ticket exists, and `Ticket.sessionId` is unique, so the Session covers strictly more of the conversation than the Ticket does while naming the same one. Every AI Agent run (classification, reply, Copilot draft, Escalation Summary) and every `support.human_reply` span carries the Session id, so a conversation that was answered without ever opening a Ticket is grouped exactly like one that escalated to a Human Agent.

Backends disagree on the attribute name, so both are written: `anvia.trace.session_id` (Lens) and `langfuse.session.id` (Langfuse).

## Running Anvia Lens locally

Lens is an OTLP backend like any other, so pointing development at it is an environment change. With the Lens stack running (`docker compose up -d` in its checkout, UI on `http://localhost`), create an ingestion key in its Connect screen and set in `.env.local`:

```sh
ENABLE_TELEMETRY="true"
TELEMETRY_EXPORTER="otlp"
TELEMETRY_CAPTURE_MODE="full"
TELEMETRY_EXPORTER_OTLP_ENDPOINT="http://localhost/api/public/otel/v1/traces"
TELEMETRY_API_KEY="Basic <base64 of publicKey:secretKey>"
TELEMETRY_API_KEY_HEADER="authorization"
```

Production stays on Langfuse Cloud in `safe` mode; only `.env.local` points at Lens.

## Swapping the backend

Pointing the pipeline at another OTLP-compatible backend — Phoenix, SigNoz, Grafana, or self-hosted — is an environment change only: set `TELEMETRY_EXPORTER_OTLP_ENDPOINT` to that backend's OTLP endpoint and `TELEMETRY_API_KEY`/`TELEMETRY_API_KEY_HEADER` to its credential. No code changes.

For local debugging without any account, `TELEMETRY_EXPORTER="console"` prints every span to the process stdout (`ENABLE_TELEMETRY="true"` still required).

## What a trace looks like

One conversation produces one coherent trace per AI Agent run: the `ai_agent.run` span (ticket/workspace ids, and the final decision — REPLY, CLARIFY, ESCALATE, RESOLVE — plus the Escalation Reason when escalating) covers child spans for knowledge retrieval, each Business Tool call, and the model generations emitted by the agent observer (`gen_ai.*` spans). Classification and Copilot generations produce their own spans on the same pipeline.
