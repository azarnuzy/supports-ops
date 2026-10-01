# Observability

The AI Agent's Telemetry — spans, token counts, latency — is exported over OpenTelemetry to an OTLP endpoint (`ENABLE_TELEMETRY` and the `TELEMETRY_*` variables configure it). Only explicit AI Agent, model, retrieval, Tool, and conversation service spans are exported: automatic instrumentation is disabled, and because a library can instrument itself against the global tracer once the SDK starts (better-auth emits HTTP, handler, and database spans of its own), the exporter takes spans from two tracers only — `@repo/logger` and `@anvia/otel`. Anything else is dropped in `startTelemetry`. See [ADR-0010](../adr/0010-otlp-observability-and-manual-evals.md) for why the backend is configuration, not architecture.

Evaluation traces preserve Anvia attributes and also map model names, token usage, and input/output to Langfuse attributes. Langfuse can calculate costs when it recognizes the model and has pricing configured; SupportOps does not invent missing costs.

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

`safe` (the default for production conversations) exports the shape of a run — spans, durations, token counts, decisions — but no prompt or response bodies. Missing Input/Output fields in Langfuse are filled with JSON summaries of the span's operation, outcome, and allowlisted error metadata. Lens shows the same fallback under `supportops.span.input_summary` and `supportops.span.output_summary`. These summaries never contain message text or provider response bodies.

`TELEMETRY_CAPTURE_MODE="full"` exports those bodies, which is how a development run shows what the AI Agent was actually asked, what each Tool returned, and what it answered. A prompt or Tool result can contain Internal-Only Knowledge and Customer data; `full` sends both verbatim to the configured telemetry backend.

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

Each Web Widget message produces one `support.customer_turn` trace. Its children show classification when there is no Ticket yet, then `ai_agent.turn` with knowledge retrieval, model generations, and each Tool call when the AI Agent handles the message. A greeting or direct request for a Human Agent has no `ai_agent.turn`; the root records its reply or escalation outcome instead. All turns in a Session share the Session id. In `full` mode, the root shows the Customer message and final outcome, while child spans show the model and Tool input/output. Other AI Agent runs, including Copilot, continue to have their own traces.

Attachment jobs and WhatsApp turns carry trace context through the queue. Their
Mistral OCR/transcription and Meta send spans show failed attempts even when a
later step succeeds. Meta delivery callbacks arrive independently, so each has
its own trace under the same Session and Message IDs. External error events
contain provider, operation, status/code, and resource IDs, never raw provider
responses. Queue context carries trace IDs only, without baggage or message text.

## Workspace evaluation reports

Workspace Eval Runs always capture full Agent/model/Tool payloads, independently of
`TELEMETRY_CAPTURE_MODE`. Credential fields and Basic/Bearer credentials are redacted;
Customer and Knowledge content remains visible in the configured evaluation destinations.
The evaluation observer and reporter impose no internal byte cap. Destination limits
still apply, and rejected deliveries use the existing evidence retry mechanism.

Each executed Case has an `eval.case` root with input, expected output, actual output,
metric results, and execution errors. Child Agent/model/Tool spans retain their native
Anvia attributes. Langfuse experiment attributes group these item traces by the
SupportOps Run ID and local Dataset ID, with stable Case IDs across runs. Scores refer
to the item root, so cases without a model call also have a trace to inspect.

Inspect new Runs under Langfuse Experiments, then open an item trace to inspect its
model and Tool calls. Existing Runs are not backfilled. Evaluation and delivery remain
separate: retrying a refused export does not repeat the AI Agent or Judge calls.

Judge completions appear as `judge.<model>.call.<n>` child generations under
`eval.case`, with full input/output, usage, and failed attempts. Their duration
covers the model call; Credit checks and charging remain outside that span.
Retriever-only Cases have a `retrieval.searchKnowledge` child span containing
the query and retrieved results. Agent Tool calls (including `searchKnowledge`)
and model turns are emitted by the existing Anvia observer only when executed.

To reproduce a central-only delivery failure locally, keep a valid Workspace
destination and point the worker's central `TELEMETRY_EXPORTER_OTLP_ENDPOINT`
at an unreachable local OTLP endpoint, with telemetry enabled and exporter
`otlp`. Restart the worker and start one Eval Case. The Workspace destination
can be Delivered while SupportOps tracing is PENDING and retrying. Inspect
`EvalRunEvidence` rows for that Run with target CENTRAL: `signal`, `lastError`,
`attempts`, `deliveredAt`, and `failedAt` identify the failed delivery, without
opening its payload. Restore the central endpoint and restart the worker;
retries replay evidence without new model calls. After retries are exhausted,
use the existing retry action. This reproduces the status, not necessarily
the original error: an HTTP error for logs can instead indicate that the
central destination does not accept Anvia's OTLP log records.
