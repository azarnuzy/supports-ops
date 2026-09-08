# Observability

The AI Agent's Telemetry — spans, token counts, latency — is exported over OpenTelemetry to an OTLP endpoint, on the same pipeline as the application traces the platform already emits (`ENABLE_TELEMETRY` and the `TELEMETRY_*` variables configure both). See [ADR-0010](../adr/0010-otlp-observability-and-manual-evals.md) for why the backend is configuration, not architecture.

Telemetry is a developer tool and is captured in redacted ("safe") form: prompt and response bodies never leave the process, so Internal-Only material that reached a prompt is not exported in raw form. It is not the audit trail — AI Activity remains the product record behind the Activity Timeline, is written to our own database, and is unaffected by any of this. Telemetry backends are free to expire data; nothing here is a substitute for Messages or AI Activity.

## Creating the account and obtaining credentials

The default backend is [Langfuse Cloud](https://langfuse.com):

1. Create an account and a new organization/project. Pick a data region — EU (`cloud.langfuse.com`) or US (`us.cloud.langfuse.com`); the region determines the OTLP endpoint below.
2. In the project, open **Settings → API Keys** and create a new key pair. You get a **Public Key** (`pk-lf-…`) and a **Secret Key** (`sk-lf-…`). The secret key is shown once — store it immediately.
3. Langfuse's OTLP endpoint authenticates with HTTP Basic using `base64(publicKey:secretKey)`. Compute it:

   ```sh
   printf '%s' "pk-lf-…:sk-lf-…" | base64
   ```

4. Set the variables in `.env` (development) or `env.production`:

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

## Swapping the backend

Pointing the pipeline at another OTLP-compatible backend — Phoenix, SigNoz, Grafana, or self-hosted — is an environment change only: set `TELEMETRY_EXPORTER_OTLP_ENDPOINT` to that backend's OTLP endpoint and `TELEMETRY_API_KEY`/`TELEMETRY_API_KEY_HEADER` to its credential. No code changes.

For local debugging without any account, `TELEMETRY_EXPORTER="console"` prints every span to the process stdout (`ENABLE_TELEMETRY="true"` still required).

## What a trace looks like

One conversation produces one coherent trace per AI Agent run: the `ai_agent.run` span (ticket/workspace ids, and the final decision — REPLY, CLARIFY, ESCALATE, RESOLVE — plus the Escalation Reason when escalating) covers child spans for knowledge retrieval, each Business Tool call, and the model generations emitted by the agent observer (`gen_ai.*` spans). Classification and Copilot generations produce their own spans on the same pipeline.
