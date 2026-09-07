# Tech Stack

Every technology choice for SupportOps, with the reasoning kept short — where a choice was hard to reverse or surprising, the reasoning lives in an ADR and this file points at it.

## Repository

| | |
|---|---|
| Package manager | pnpm workspaces |
| Language | TypeScript |
| Formatter / linter | Biome |
| Test runner | Vitest |
| Slug | `supports-ops` (repo `azarnuzy/supports-ops`) |
| Branching | `main` only; CI must pass before images publish |

Applications live in `apps/*`, shared code in `packages/*`. Packages are source-only: they export `.ts`/`.tsx` directly and have no build step.

```
apps/
├── api        Hono API, Prisma, Better Auth, agent HTTP surface
├── worker     BullMQ consumers: timers, ingestion, indexing, email
├── platform   Admin + Human Agent dashboard
└── widget     Embeddable Web Widget bundle and transcript page
packages/
├── ai-agent   Agent construction, tools wiring, output schema, prompts
├── channels   ChannelAdapter contract + Web implementation
├── knowledge  Ingest, chunk, embed, retrieve
├── tools      Read-only Business Tools
├── shared     Enums and schemas used by more than one app
├── ui         shadcn component library, design tokens
├── api-client Typed Hono RPC client
├── logger     Pino + OpenTelemetry
└── storage    S3-compatible object storage
```

`apps/admin` from the boilerplate is deleted; `packages/worker` becomes `apps/worker`. There is no `packages/database`. See [ADR-0001](../adr/0001-monorepo-app-and-package-topology.md).

## Backend

| Concern | Choice | Notes |
|---|---|---|
| HTTP | Hono on Node | Framework-agnostic Web `Request`/`Response`, which the agent streaming helper needs |
| ORM | Prisma 7 | Multi-file schema under `prisma/schema/`, one file per domain |
| Database | PostgreSQL 16 + `vector` extension | Extension must be enabled before the first chunk migration |
| Auth | Better Auth | Email/password, session cookies. The **admin plugin is removed**: role becomes a typed enum |
| Queue | BullMQ on Redis | Also carries realtime fan-out via pub/sub |
| Validation | Zod | Same schemas shared with the frontend through `packages/shared` |
| Logging | Pino | Already in `packages/logger` |
| Tracing | OpenTelemetry → OTLP | Backend is configuration; see [ADR-0010](../adr/0010-otlp-observability-and-manual-evals.md) |

Module layout inside the API is `src/modules/<domain>/{router,services,schema,types}.ts`, kebab-case, matching the boilerplate rather than the layered camel-case convention used in earlier projects.

## AI

| Concern | Package | Notes |
|---|---|---|
| Runtime | `@anvia/core` | v1 surface: `new Agent({...})`, `createTool({...})`, `outputSchema`. **Not** `AgentBuilder` — see [ADR-0002](../adr/0002-anvia-v1-as-agent-runtime.md) |
| Provider | `@anvia/openai` via OpenRouter | Two tiers, both environment-configurable |
| Streaming | `@anvia/server` | `createClientStreamResponse` + `agentToClientStream` |
| Memory | `@anvia/memory-prisma` | Wrapped, not used bare — see [ADR-0004](../adr/0004-message-store-extends-anvia-memory.md) |
| Vector store | `@anvia/pgvector` | Behind a swap seam in `packages/knowledge` — see [ADR-0003](../adr/0003-pgvector-over-qdrant.md) |
| Evals | `@anvia/core/evals` | `runEvalSuite`, `agentEvalTarget`, `exactMatch`, `contains`, `faithfulness`, `answerRelevancy`, `gEval` |
| Telemetry | `@anvia/otel` | Full agent/tool/model spans to any OTLP endpoint |
| Local debugging | `@anvia/studio` | devDependency only; never in a production image |

**Not used:** `@anvia/lens` (self-hosting needs seven services including ClickHouse), `@anvia/langfuse` (documented emphasis is evals and scores, not full agent tracing), `@anvia/react` / `@anvia/react-ui` (the widget owns its own transport — see [ADR-0005](../adr/0005-sse-for-realtime-single-widget-channel.md)).

### Models

| Role | Environment variable | Used for |
|---|---|---|
| Fast | `LLM_MODEL_FAST` | Classification, title, category, priority, language detection |
| Main | `LLM_MODEL_MAIN` | Customer-facing replies, escalation decisions, Escalation Summary, Suggested Reply |
| Judge | `LLM_MODEL_JUDGE` | Eval suites only |
| Embedding | `EMBEDDING_MODEL` | `text-embedding-3-small` (1536 dimensions) through a hosted API |

Exact model identifiers are resolved against OpenRouter during the spike rather than guessed here. Embeddings run through a hosted API rather than `@anvia/transformers`, because a local model would compete for memory with Postgres during bulk ingestion.

## Content processing

| Input | Tool | Notes |
|---|---|---|
| PDF, JPEG, PNG | Mistral OCR (`@anvia/mistral`) | Markdown output; the only path that can read a Customer's screenshot |
| Documentation URLs | Tavily (`@tavily/core`) | Same-domain crawl, depth 1, hard cap ~25 pages, not Admin-configurable |
| Manual FAQ, plain text | — | Straight into chunking |

DOCX is not supported; see [ADR-0009](../adr/0009-english-only-ui-no-docx.md). Web search is an ingestion-time capability only and is never a runtime tool for the AI Agent.

## Frontend

| Concern | Choice |
|---|---|
| Build | Vite |
| Framework | React 19 |
| Routing | TanStack Router (file routes) |
| Server state | TanStack Query |
| Styling | Tailwind 4 |
| Components | shadcn/ui on Base UI + Radix, in `packages/ui` |
| Icons | Lucide |
| Forms | React Hook Form + Zod resolvers |
| Toasts | Sonner |
| Charts | Recharts |

Internationalisation is removed; the dashboard is English only. `routeTree.gen.ts` is generated and git-ignored. See [ADR-0009](../adr/0009-english-only-ui-no-docx.md).

## Web Widget

Custom element with an open shadow root attached directly to `<body>`, Tailwind (preflight included) injected as adopted stylesheets inside the boundary, `:host { all: initial }` at the edge. System font stack, because `@font-face` inside a shadow root does not work in Chrome or Safari and injecting into the host document would be the leakage this avoids. Floating launcher, not an inline container. Its own two-language string table selected from the browser locale. See [ADR-0006](../adr/0006-shadow-dom-widget-isolation.md).

## Infrastructure

| Concern | Choice | Notes |
|---|---|---|
| Deployment | Docker images → GHCR → VPS | Tagged by commit SHA; nothing built on the server |
| Orchestration | Docker Compose | `/srv/apps/supports-ops` |
| Proxy | Shared Caddy on an external `proxy` network | Only Caddy publishes ports |
| Object storage | Cloudflare R2 | S3 API, no egress charge |
| Email | Resend (production), Mailpit (development) | Session Link delivery, sent asynchronously |
| CI | GitHub Actions | Biome, typecheck, test, build, then publish + deploy |

### Hostnames

| Host | Serves |
|---|---|
| `support.azarnuzy.com` | Dashboard |
| `api.support.azarnuzy.com` | API |
| `widget.support.azarnuzy.com` | Widget bundle and transcript page |

Proxy aliases: `supports-ops-api`, `supports-ops-platform`, `supports-ops-widget`. Postgres and Redis never join the proxy network. See [ADR-0007](../adr/0007-vps-containers-over-cloudflare.md).

### Memory budget

Roughly 1.4 GB of a 4 GB machine: Caddy ~30 MB, Postgres ~400 MB, Redis ~100 MB, API ~400 MB, worker ~400 MB, static assets served by Caddy directly. Headroom exists because images are built in CI, embeddings are hosted, attachments live in R2, and there is no separate vector database.

## Verification

Manual, with two automated exceptions at the API application seam — Workspace isolation and Message idempotency — plus on-demand eval suites at the AI Agent factory seam. Evals are never a CI gate. See the [spec](https://github.com/azarnuzy/supports-ops/issues/1) and [ADR-0010](../adr/0010-otlp-observability-and-manual-evals.md).
