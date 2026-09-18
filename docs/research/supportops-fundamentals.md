# Peta Materi Fundamental SupportOps

Status: daftar materi untuk sesi belajar terpisah, bukan tutorial lengkap. Disusun dari implementasi aktual repo pada 2026-09-14 dan sumber primer resmi.

## Gambaran sistem yang benar

SupportOps adalah **modular monolith TypeScript** dalam pnpm workspace. Deployable utamanya adalah API Hono, worker BullMQ, dashboard React, Web Widget vanilla TypeScript, dan demo Business System. Batas domain utamanya adalah **Channel → Ticket layer → AI Agent**; Postgres menjadi source of truth, Redis dipakai untuk queue dan live fan-out, sedangkan object storage menyimpan Attachment.

Jalur bukti utama: [`README.md`](../../README.md), [`package.json`](../../package.json), [`docs/planning/architecture.md`](../planning/architecture.md), dan [`docs/adr/0001-monorepo-app-and-package-topology.md`](../adr/0001-monorepo-app-and-package-topology.md).

## Cara memakai peta ini

Setiap sesi adalah panduan membaca kode SupportOps, bukan kursus teori generik. Mulai dari satu alur produk nyata, lalu telusuri implementasi aktual dari entry point ke module boundary, persistence atau side effect, dan output. Jelaskan fungsi, type, schema, model, constraint, test, dan ADR yang benar-benar terlibat dengan path serta nomor baris terkini.

Best practice eksternal dipakai sebagai alat pembanding. Setiap sesi harus membedakan apa yang sudah diterapkan, trade-off yang sengaja dipilih, dan rekomendasi luar yang belum ada di repo. Karena kode dapat berubah, path di bawah adalah titik awal; sesi tetap harus membaca ulang commit saat itu.

## Urutan belajar dan calon judul sesi

### Fase 1 — bahasa, runtime, dan bentuk aplikasi

#### 1. Bahasa domain SupportOps dan Domain-Driven Design strategis

- **Pelajari:** bagaimana istilah bisnis menjadi nama model, status, use case, dan batas modul; bedakan domain language dari nama teknis.
- **Istilah best practice:** *Ubiquitous Language*, domain/subdomain, *Bounded Context*, *Context Map*, entity, value object, aggregate, invariant, anti-corruption layer.
- **Jejak di repo:** [`CONTEXT.md`](../../CONTEXT.md), [`docs/agents/domain.md`](../agents/domain.md), [`apps/api/prisma/schema`](../../apps/api/prisma/schema), [`docs/adr`](../adr).
- **Sumber primer:** [Microsoft — domain analysis dan Ubiquitous Language](https://learn.microsoft.com/en-us/azure/architecture/microservices/model/domain-analysis), [Microsoft — tactical DDD](https://learn.microsoft.com/en-us/azure/architecture/microservices/model/tactical-domain-driven-design), [Anti-Corruption Layer pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer).

#### 2. JavaScript, TypeScript strict, ESM, dan validasi runtime

- **Pelajari:** runtime JavaScript versus type system TypeScript, narrowing, discriminated union, generics, structural typing, module ESM, serta alasan data eksternal tetap harus divalidasi saat runtime.
- **Istilah best practice:** static type checking, type erasure, type narrowing, discriminated union, structural typing, trust boundary, parse-don't-assume, schema validation.
- **Jejak di repo:** [`tsconfig.base.json`](../../tsconfig.base.json), [`packages/shared`](../../packages/shared), [`apps/api/src/modules/widget/schema.ts`](../../apps/api/src/modules/widget/schema.ts), [`packages/ai-agent/src/turn.ts`](../../packages/ai-agent/src/turn.ts).
- **Sumber primer:** [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro), [TypeScript type compatibility](https://www.typescriptlang.org/docs/handbook/type-compatibility), [Zod basics](https://zod.dev/basics), [Node.js packages dan `exports`](https://nodejs.org/api/packages.html).

#### 3. Monorepo, modular monolith, dan batas Channel/Ticket/AI

- **Pelajari:** perbedaan deployable app dan reusable package, dependency direction, public package API, serta mengapa transport Channel tidak boleh menentukan keputusan Ticket/AI Agent.
- **Istilah best practice:** workspace, modular monolith, module boundary, cohesion, coupling, information hiding, Dependency Inversion, port, adapter, hexagonal architecture, anti-corruption layer.
- **Jejak di repo:** [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml), [`apps`](../../apps), [`packages`](../../packages), [`packages/channels/src/index.ts`](../../packages/channels/src/index.ts), [`packages/ai-agent`](../../packages/ai-agent), [`docs/planning/architecture.md`](../planning/architecture.md), [`docs/adr/0001-monorepo-app-and-package-topology.md`](../adr/0001-monorepo-app-and-package-topology.md).
- **Sumber primer:** [pnpm workspaces](https://pnpm.io/workspaces), [Node.js package `exports`](https://nodejs.org/api/packages.html#package-entry-points), [Microsoft — dependency inversion dan ports-and-adapters](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures), [Microsoft — Anti-Corruption Layer](https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer).

### Fase 2 — API, data, dan correctness

#### 4. HTTP API dengan Hono, middleware, typed RPC, dan schema contract

- **Pelajari:** Web `Request`/`Response`, routing, middleware order, status code, CORS, request validation, error mapping, dan kontrak type-safe antara API dengan frontend.
- **Istilah best practice:** web standards, middleware pipeline, API contract, boundary validation, end-to-end type inference, status semantics, content negotiation.
- **Jejak di repo:** [`apps/api/src/app.ts`](../../apps/api/src/app.ts), [`apps/api/src/modules`](../../apps/api/src/modules), [`packages/api-client/src/index.ts`](../../packages/api-client/src/index.ts).
- **Sumber primer:** [Hono Web Standards](https://hono.dev/docs/concepts/web-standard), [Hono RPC](https://hono.dev/docs/guides/rpc), [HTTP Semantics — RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html), [Zod basics](https://zod.dev/basics).

#### 5. Authentication, authorization, dan dua macam principal

- **Pelajari:** perbedaan authentication dan authorization; Workspace User memakai session cookie, sedangkan Customer memakai Web Session token; permission Ticket tetap diperiksa berdasarkan role dan relationship.
- **Istilah best practice:** principal, session management, RBAC, relationship-based access, least privilege, deny by default, complete mediation, BOLA/IDOR, CSRF, CORS-is-not-auth.
- **Jejak di repo:** [`apps/api/src/modules/auth`](../../apps/api/src/modules/auth), [`apps/api/src/modules/tickets/services.ts`](../../apps/api/src/modules/tickets/services.ts), [`apps/api/src/modules/widget/router.ts`](../../apps/api/src/modules/widget/router.ts), [`docs/adr/0011-widget-requests-authenticate-by-session-token.md`](../adr/0011-widget-requests-authenticate-by-session-token.md).
- **Sumber primer:** [Better Auth session management](https://www.better-auth.com/docs/concepts/session-management), [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [OWASP API Security Top 10](https://owasp.org/API-Security/editions/2023/en/0x00-header/).

#### 6. Multi-tenancy dan isolasi Workspace yang fail-closed

- **Pelajari:** propagasi Workspace context dari request ke data layer, scope semua query, cross-Workspace negative tests, dan batas pendekatan Prisma extension dibanding PostgreSQL Row-Level Security.
- **Istilah best practice:** tenant context propagation, fail closed, cross-tenant data leakage, defense in depth, tenant-scoped keys, row-level security, `USING`/`WITH CHECK`, noisy neighbor.
- **Jejak di repo:** [`apps/api/src/utils/workspace-context.ts`](../../apps/api/src/utils/workspace-context.ts), [`apps/api/src/utils/workspace-isolation.ts`](../../apps/api/src/utils/workspace-isolation.ts), [`apps/api/src/utils/workspace-isolation.test.ts`](../../apps/api/src/utils/workspace-isolation.test.ts), [`docs/adr/0008-workspace-isolation-via-prisma-extension.md`](../adr/0008-workspace-isolation-via-prisma-extension.md).
- **Sumber primer:** [OWASP Multi-Tenant Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html), [Prisma query extensions](https://www.prisma.io/docs/orm/prisma-client/client-extensions/query), [PostgreSQL Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [Node.js AsyncLocalStorage](https://nodejs.org/api/async_context.html#class-asynclocalstorage).

#### 7. Relational modeling, Prisma schema, migration, constraint, dan index

- **Pelajari:** primary/foreign key, cardinality, normalized versus deliberately denormalized data, enum, soft delete, unique constraint, composite index, migration, serta cara query menentukan desain index.
- **Istilah best practice:** referential integrity, database invariant, normalization, denormalization, selectivity, composite index, covering access path, schema migration, soft delete.
- **Jejak di repo:** [`apps/api/prisma/schema`](../../apps/api/prisma/schema), [`apps/api/prisma/migrations`](../../apps/api/prisma/migrations), [`docs/planning/data-model.md`](../planning/data-model.md), [`apps/api/src/utils/prisma.ts`](../../apps/api/src/utils/prisma.ts).
- **Sumber primer:** [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html), [PostgreSQL index types](https://www.postgresql.org/docs/current/indexes-types.html), [Prisma schema](https://www.prisma.io/docs/orm/prisma-schema/overview), [Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate).

#### 8. Transaction, concurrency control, state machine, dan idempotency

- **Pelajari:** membuat Claim/Takeover/Resolution aman terhadap race, mengurutkan Message dengan counter dalam transaction, dan memakai constraint database sebagai penjaga invariant terakhir.
- **Istilah best practice:** ACID, MVCC, isolation level, atomic state transition, compare-and-swap / conditional update, optimistic concurrency control, lost update, row lock, deadlock, idempotency key, monotonic sequence.
- **Jejak di repo:** [`apps/api/src/modules/tickets/services.ts`](../../apps/api/src/modules/tickets/services.ts), [`apps/api/src/modules/ai-agent/turn.ts`](../../apps/api/src/modules/ai-agent/turn.ts), [`apps/api/src/utils/session-messages.ts`](../../apps/api/src/utils/session-messages.ts), [`apps/api/prisma/schema/message.prisma`](../../apps/api/prisma/schema/message.prisma).
- **Sumber primer:** [Prisma transactions dan optimistic concurrency control](https://www.prisma.io/docs/orm/prisma-client/queries/transactions), [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html), [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html).

### Fase 3 — frontend, widget, async, dan realtime

#### 9. React UI, routing, dan server-state management

- **Pelajari:** component decomposition, one-way data flow, state minimal/derived, lifecycle Effect, type-safe file routing, query keys, caching, invalidation, polling, optimistic update, serta perbedaan UI state dan server state.
- **Istilah best practice:** props vs state, derived state, pure render, Effect cleanup, query key, stale/fresh data, cache invalidation, background refetch, route context.
- **Jejak di repo:** [`apps/platform/src/main.tsx`](../../apps/platform/src/main.tsx), [`apps/platform/src/routes`](../../apps/platform/src/routes), [`apps/platform/src/features`](../../apps/platform/src/features), [`apps/platform/src/lib/query-client.ts`](../../apps/platform/src/lib/query-client.ts), [`packages/ui`](../../packages/ui).
- **Sumber primer:** [React — Thinking in React](https://react.dev/learn/thinking-in-react), [React — Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects), [TanStack Query important defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults), [TanStack Router type safety](https://tanstack.com/router/latest/docs/guide/type-safety).

#### 10. Embeddable Web Widget: Custom Elements, Shadow DOM, dan browser security

- **Pelajari:** widget vanilla TypeScript yang hidup di website pihak lain, style encapsulation, browser storage, safe Markdown rendering, link safety, accessibility dasar, CORS dinamis, rate limit, dan upload validation.
- **Istilah best practice:** Web Components, autonomous custom element, Shadow DOM, style encapsulation, XSS sanitization, output encoding, origin allowlist, rate limiting, defense in depth.
- **Jejak di repo:** [`apps/widget/src/widget.ts`](../../apps/widget/src/widget.ts), [`apps/widget/src/loader.ts`](../../apps/widget/src/loader.ts), [`apps/api/src/modules/widget`](../../apps/api/src/modules/widget), [`docs/adr/0006-shadow-dom-widget-isolation.md`](../adr/0006-shadow-dom-widget-isolation.md).
- **Sumber primer:** [MDN Web Components](https://developer.mozilla.org/en-US/docs/Web/API/Web_components), [MDN Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM), [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html), [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

#### 11. Background jobs, delayed timer, retry, dan idempotent consumer

- **Pelajari:** pemisahan producer/worker, delayed job untuk Follow-Up dan closure, deterministic job ID, cancellation/superseding timer, bounded retry, backoff, serta mengapa worker harus aman dijalankan ulang.
- **Istilah best practice:** producer/consumer, idempotent job, at-least-once mindset, deterministic job ID, deduplication, exponential backoff, jitter, poison job, graceful shutdown.
- **Jejak di repo:** [`apps/worker/src`](../../apps/worker/src), [`apps/api/src/modules/follow-up/queue.ts`](../../apps/api/src/modules/follow-up/queue.ts), [`apps/api/src/modules/knowledge/queue.ts`](../../apps/api/src/modules/knowledge/queue.ts), [`apps/api/src/modules/tickets/queue.ts`](../../apps/api/src/modules/tickets/queue.ts).
- **Sumber primer:** [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs), [BullMQ retry/backoff](https://docs.bullmq.io/guide/retrying-failing-jobs), [BullMQ job IDs](https://docs.bullmq.io/guide/jobs/job-ids), [BullMQ delayed jobs](https://docs.bullmq.io/guide/jobs/delayed).

#### 12. Realtime dengan SSE, Redis Pub/Sub, dan durable replay

- **Pelajari:** server-to-client stream satu arah, event ID dan reconnect, perbedaan provisional delta dengan persisted Message, live fan-out antarinstance, serta replay dari database setelah disconnect.
- **Istilah best practice:** Server-Sent Events, `EventSource`, `text/event-stream`, `Last-Event-ID`, event replay/catch-up, at-most-once delivery, fan-out, durable source of truth, sequence number, eventual consistency.
- **Jejak di repo:** [`apps/api/src/modules/widget/realtime.ts`](../../apps/api/src/modules/widget/realtime.ts), [`apps/api/src/modules/widget/router.ts`](../../apps/api/src/modules/widget/router.ts), [`apps/api/src/modules/tickets/router.ts`](../../apps/api/src/modules/tickets/router.ts), [`packages/api-client/src/index.ts`](../../packages/api-client/src/index.ts), [`docs/adr/0005-sse-for-realtime-single-widget-channel.md`](../adr/0005-sse-for-realtime-single-widget-channel.md).
- **Sumber primer:** [WHATWG Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html), [Redis Pub/Sub delivery semantics](https://redis.io/docs/latest/develop/pubsub/), [Redis Streams sebagai durable log](https://redis.io/docs/latest/develop/data-types/streams/).

### Fase 4 — AI, retrieval, tools, dan safety

#### 13. AI Agent loop, structured decisions, grounding, dan safe escalation

- **Pelajari:** input context, instructions, model call, tool loop, output schema `REPLY | ESCALATE | RESOLVE`, server-side validation, grounding terhadap source/tool, dan abstention/escalation ketika bukti tidak cukup.
- **Istilah best practice:** structured output, schema-constrained generation, grounding, hallucination, abstention, human-in-the-loop, fail-safe default, least agency, prompt injection boundary.
- **Jejak di repo:** [`packages/ai-agent/src/turn.ts`](../../packages/ai-agent/src/turn.ts), [`packages/ai-agent/src/reply.ts`](../../packages/ai-agent/src/reply.ts), [`apps/api/src/modules/ai-agent/turn.ts`](../../apps/api/src/modules/ai-agent/turn.ts), [`docs/adr/0002-anvia-v1-as-agent-runtime.md`](../adr/0002-anvia-v1-as-agent-runtime.md).
- **Sumber primer:** [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [OpenAI Function Calling](https://developers.openai.com/api/docs/guides/function-calling), [OpenAI safety best practices](https://developers.openai.com/api/docs/guides/safety-best-practices), [NIST Generative AI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence).

#### 14. RAG: ingestion, chunking, embedding, vector search, dan retrieval permission

- **Pelajari:** pipeline ingest → normalize → chunk → embed → index → retrieve; cosine similarity; exact versus approximate nearest neighbour; metadata filtering Workspace/Visibility/deletion; dan konsistensi perubahan source dengan Chunk.
- **Istilah best practice:** RAG, semantic search, chunking strategy, embedding, cosine distance/similarity, top-k, metadata filtering, ANN, HNSW, recall–latency trade-off, hybrid retrieval, retrieval authorization.
- **Jejak di repo:** [`packages/knowledge/src`](../../packages/knowledge/src), [`apps/worker/src/knowledge-ingest.ts`](../../apps/worker/src/knowledge-ingest.ts), [`apps/worker/src/ticket-knowledge-index.ts`](../../apps/worker/src/ticket-knowledge-index.ts), [`apps/api/prisma/schema/knowledge.prisma`](../../apps/api/prisma/schema/knowledge.prisma), [`docs/adr/0003-pgvector-over-qdrant.md`](../adr/0003-pgvector-over-qdrant.md).
- **Sumber primer:** [OpenAI Retrieval guide](https://developers.openai.com/api/docs/guides/retrieval), [OpenAI embeddings](https://developers.openai.com/api/docs/guides/embeddings), [pgvector indexing dan filtering](https://github.com/pgvector/pgvector).

#### 15. HTTP Tools, MCP, JSON Schema, least privilege, dan SSRF defense

- **Pelajari:** discovery versus enablement, Tool Assignment, read-only versus mutating side effects, JSON Schema validation, credential encryption/redaction, outbound URL restrictions, timeout/result limits, dan capability negotiation MCP.
- **Istilah best practice:** tool calling, capability negotiation, least privilege, allowlisting, explicit consent, confused deputy, token passthrough, SSRF, DNS rebinding, egress control, bounded response.
- **Jejak di repo:** [`packages/tools`](../../packages/tools), [`apps/api/src/modules/tools`](../../apps/api/src/modules/tools), [`apps/api/src/modules/mcp`](../../apps/api/src/modules/mcp), [`apps/business-system`](../../apps/business-system), [`docs/adr/0015-assigned-tools-through-one-ai-agent-runtime.md`](../adr/0015-assigned-tools-through-one-ai-agent-runtime.md).
- **Sumber primer:** [MCP architecture](https://modelcontextprotocol.io/specification/latest/architecture), [MCP tools](https://modelcontextprotocol.io/specification/latest/server/tools), [MCP authorization](https://modelcontextprotocol.io/specification/latest/basic/authorization), [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), [JSON Schema specification](https://json-schema.org/specification).

### Fase 5 — quality dan operasi

#### 16. Testing pada seam yang tepat dan AI evals

- **Pelajari:** unit test untuk logic, database-backed integration test untuk invariant dan race, API contract test, browser E2E untuk user-visible behavior, serta eval khusus perilaku AI terhadap Workspace eval yang live (`EVAL_WORKSPACE_ID`).
- **Istilah best practice:** test seam, test isolation, contract test, integration test, end-to-end test, regression test, deterministic grader, model-as-judge, rubric, representative dataset, positive/negative control, held-out case.
- **Jejak di repo:** [`packages/test-db`](../../packages/test-db), [`apps/api/src/modules/registration/services.db.test.ts`](../../apps/api/src/modules/registration/services.db.test.ts), [`apps/platform/playwright.config.ts`](../../apps/platform/playwright.config.ts), [`apps/api/src/evals`](../../apps/api/src/evals), [`docs/testing/e2e-runbook.md`](../testing/e2e-runbook.md).
- **Sumber primer:** [Vitest testing in practice](https://vitest.dev/guide/learn/testing-in-practice), [Playwright best practices](https://playwright.dev/docs/best-practices), [OpenAI evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices), [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework).

#### 17. Observability, audit trail, privacy, dan operasi produksi

- **Pelajari:** bedakan durable AI Activity dari ephemeral developer telemetry; structured logging; trace/span/context propagation; redaction; OTLP; container deployment; reverse proxy/TLS; graceful shutdown; migration saat startup; dan CI/CD artifact promotion.
- **Istilah best practice:** logs/metrics/traces, span, trace context, semantic conventions, OTLP, data minimization, correlation ID, audit record, SLI/SLO, immutable artifact, reverse proxy, TLS termination, graceful shutdown.
- **Jejak di repo:** [`packages/logger`](../../packages/logger), [`docs/adr/0010-otlp-observability-and-manual-evals.md`](../adr/0010-otlp-observability-and-manual-evals.md), [`Dockerfile`](../../Dockerfile), [`deploy`](../../deploy), [`.github/workflows/ci-cd.yml`](../../.github/workflows/ci-cd.yml).
- **Sumber primer:** [OpenTelemetry observability primer](https://opentelemetry.io/docs/concepts/observability-primer/), [OpenTelemetry signals](https://opentelemetry.io/docs/concepts/signals/), [OTLP specification](https://opentelemetry.io/docs/specs/otlp/), [Docker Compose production guidance](https://docs.docker.com/compose/how-tos/production/), [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https).

## Yang sengaja tidak menjadi fundamental inti

- **Next.js**: tidak digunakan; frontend aktual adalah React + Vite + TanStack Router/Query.
- **Microservices, Kubernetes, Kafka, WebSocket, Qdrant**: bukan arsitektur proyek saat ini. Pelajari hanya sebagai perbandingan setelah memahami trade-off yang dicatat di ADR.
- **Detail tiap library UI**: mulai dari alur data dan accessibility; katalog komponen bisa dipelajari saat mengerjakan layar terkait.

## Urutan ringkas

`Domain → TypeScript → module boundaries → HTTP/API → auth & tenancy → relational data → concurrency → React/widget → jobs → SSE → AI Agent → RAG → Tools/MCP → tests/evals → observability/deployment`
