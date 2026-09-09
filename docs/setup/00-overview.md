# Setup overview

Follow these guides in order to take a new environment from nothing to a demoable Workspace.

1. **[VPS and DNS](01-vps-and-dns.md)** — provision the server, DNS records, and deploy workflow. Skip this one for local-only development; start at step 2.
2. **[Email](02-email.md)** — Session Link delivery, either Resend (production) or Mailpit (local).
3. **[AI credentials](03-ai-credentials.md)** — the OpenRouter key that powers classification, embeddings, and the AI Agent, plus the pgvector extension it depends on.
4. **[Content services](04-content-services.md)** — Mistral (PDF OCR) and Tavily (documentation crawling) keys used by Knowledge ingestion.
5. **[Object storage](05-object-storage.md)** — the S3-compatible bucket for attachments and PDF Knowledge Sources, and the internal worker token.
6. **[Observability](06-observability.md)** — optional OTLP telemetry export for the AI Agent and application traces.

Once every credential above is in `.env.local` (development) or `.env` (root Docker Compose production):

```sh
pnpm install
cp .env.example .env.local   # fill in the values from steps 1-6
docker compose -f docker-compose.dev.yaml up -d
pnpm db:generate
pnpm db:migrate
pnpm --filter @repo/api dev
pnpm --filter @repo/business-system dev
pnpm --filter @repo/platform dev
pnpm --filter @repo/worker dev
```

Then seed a complete demo Workspace in one command:

```sh
pnpm seed:demo
```

`pnpm seed:demo` creates an Admin, a Human Agent, a configured Web Widget, and published Knowledge Sources across both visibilities (Customer-Safe and Internal-Only). It prints the Admin and Human Agent credentials on completion. It is idempotent — re-running it leaves existing data untouched and only fills in what is missing. Business System customers, subscriptions, and invoices are seeded automatically the first time the API or worker connects to that database (`apps/business-system/src/database.ts`), also idempotently.

See the root [README](../../README.md) for day-to-day development commands, and [supportops_prd.md](../../supportops_prd.md) section 54 for the full list of MVP success criteria to walk through once a Workspace is seeded.

For the complete local Customer-to-Human-Agent walkthrough, Widget host, Langfuse inspection, and AI eval matrix, use the [end-to-end runbook](../testing/e2e-runbook.md).
