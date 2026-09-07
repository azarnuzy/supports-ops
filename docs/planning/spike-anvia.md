# Spike: Anvia v1 runtime assumptions

Findings for [issue #2](https://github.com/azarnuzy/supports-ops/issues/2). Every claim below was checked by running real code against `@anvia/*` 1.1.2, a throwaway Postgres 16 + pgvector container, and live OpenRouter calls — not by reading documentation. Scripts lived in a scratch workspace outside the repo (throwaway per the ticket) and are not committed; this document is the durable artifact.

## Summary

All seven acceptance criteria pass, but two of them pass through a fallback rather than the path ADR-0002/ADR-0004/tech-stack.md originally described:

| # | Criterion | Result |
|---|---|---|
| 1 | Discriminated structured output | **Fallback taken** — a Zod `discriminatedUnion` cannot be used as `outputSchema`; see below |
| 2 | Agent stream served through the API framework | **Pass**, with one import-path correction |
| 3 | pgvector adapter honours metadata filters per Workspace/Visibility/deletion | **Pass** for Workspace/Visibility filtering; **deletion filtering not exercised**; **fallback recommended** for how it attaches to the product's `Chunk` table |
| 4 | `PrismaMemoryStore` wrapped for a caller transaction + extra columns | **Pass**, via a documented technique — see below |
| 5 | Message written outside an agent run reads back correctly | **Pass** |
| 6 | Exact OpenRouter model identifiers for fast/main/judge | **Pass** — recorded below |
| 7 | Findings written here | **Pass** (this document) |

## 1. Structured output: reply / escalate / resolve

**Assumption did not hold as written.** Passing a `z.discriminatedUnion("decision", [...])` as `outputSchema` fails at the provider, not at Anvia:

```
BadRequestError: 400 Provider returned error
"Invalid schema for response_format 'response_schema': In context=(), 'oneOf' is not permitted."
```

Anvia converts `outputSchema` to JSON Schema with Zod v4's native `z.toJSONSchema()`. A discriminated union's root becomes `{"oneOf": [...]}`, and OpenAI's strict `response_format: json_schema` mode requires the schema root to be `"type": "object"` — a root-level `oneOf` is rejected outright. This is a provider constraint, not a bug in a specific model; it will reject the same shape for every OpenAI-compatible model routed through `@anvia/openai`.

A second attempt wrapped a flat object in `.transform()` to narrow it back into a discriminated shape inside the schema itself. That fails differently and earlier — before any network call:

```
Error: Transforms cannot be represented in JSON Schema
```

`outputSchema` must be representable as plain JSON Schema; `.transform()` has no JSON Schema equivalent, so Anvia can't accept it at all.

**Fallback taken.** `outputSchema` is a flat object with every field required and nullable where a given decision doesn't use it:

```ts
const outputSchema = z.object({
  decision: z.enum(["REPLY", "ESCALATE", "RESOLVE"]),
  content: z.string().nullable(),
  escalationReason: z.enum([...9 reasons]).nullable(),
  resolutionReason: z.enum([...4 reasons]).nullable(),
});
```

Narrowing to a discriminated `{decision: "ESCALATE", reason}` shape the rest of the app can `switch` on happens in **application code**, immediately after `agent.generate()` returns — a plain function, not a schema transform. Verified end-to-end against `openai/gpt-4o-mini`, `openai/gpt-4.1-nano`, and `anthropic/claude-sonnet-5` over OpenRouter: all three return a validated, correctly-shaped decision (`outcome.type === "response"`, `outcome.output` matches the flat schema).

**Consequence for the data model / AI Agent module.** `packages/ai-agent`'s output type should be defined as the flat wire schema plus a narrowing function, not as a Zod discriminated union passed straight to `Agent`. Any future attempt to "clean this up" into a true discriminated union at the `outputSchema` boundary will silently break at the provider, not at compile time — worth a comment at that call site when it's built.

## 2. Agent stream served through the API framework

**Passes**, with a factual correction to tech-stack.md: `agentToClientStream` lives in **`@anvia/client`**, not `@anvia/server`. `@anvia/server` only exports `createClientStreamResponse` (and the resumable/SSE primitives); `@anvia/client` is a peer dependency of `@anvia/server` that must be installed directly too, since it's what does the agent-events-to-wire-protocol translation.

Working shape:

```ts
import { agentToClientStream } from "@anvia/client";
import { createClientStreamResponse } from "@anvia/server";

app.post("/stream", (c) => {
  const events = agentToClientStream({ events: agent.stream({ prompt }) });
  return createClientStreamResponse({ events }); // a standard Response — Hono returns it as-is
});
```

Verified against a real Hono server (`@hono/node-server`) and a real OpenRouter model: the client received **9 chunks** over the wire, the first (`stream_start`) arriving immediately and subsequent `stream_event` frames carrying token-level `text_delta` events arriving progressively over ~2.2s — not buffered into one response. `createClientStreamResponse` returns a plain `Response`, which Hono passes through unmodified, so no framework-specific adapter is needed.

## 3. pgvector adapter and metadata filters

**The filter mechanism itself passes for Workspace and Visibility.** Seeded three chunks (two Workspaces, one Workspace with a Customer-Safe and an Internal-Only chunk) into `@anvia/pgvector`'s `PgVectorStore`, then searched with a filter of `and(eq(workspaceId), and(eq(visibility), eq(isPublished)))`. Result: exactly the one matching chunk, every time — no cross-Workspace or cross-visibility leakage across the trials run.

**Deletion filtering was not exercised.** No chunk carrying a soft-deleted `deletedAt` was seeded, and no trial filtered on it, so this spike does not confirm that a soft-deleted source's chunks are excluded from retrieval — only that Workspace and Visibility are. That dimension still needs a dedicated test, ideally against whichever store ends up owning `Chunk` (see the fallback below), since ADR-0003's whole premise is that deleting a source must make its chunks unretrievable immediately.

**A larger assumption in ADR-0003 / data-model.md does not hold.** `PgVectorStore.ensure()` `CREATE TABLE IF NOT EXISTS`s and owns its **own** physical table — fixed columns `(id, document_id, document jsonb, metadata jsonb, embedding vector(N))`, written and read through raw `pg` queries. It does not read or write the Prisma-managed `Chunk` table data-model.md describes, and it can't be pointed at an existing table with extra typed columns the way `PrismaMemoryStore`'s `delegates` option allows.

This matters because ADR-0003's whole argument — "publishing, hiding, or soft-deleting a source updates the source **and its chunks in one transaction**" — assumed Prisma writes to both `KnowledgeSource` and `Chunk` in the same `$transaction`. If `Chunk` is actually Anvia's own raw-SQL table, that transaction doesn't exist: a visibility change would need a **second**, non-transactional `PgVectorStore.upsert()` call after the Prisma commit, reopening exactly the drift risk ADR-0003 was written to close (a window where Internal-Only content is retrievable as Customer-Safe, or vice versa).

**Fallback recommended, not yet built:** implement the `VectorStore` interface directly against Prisma's `Chunk` table (mirrors the `MemoryStore` fallback in ADR-0004) — `upsert`/`search` as `$executeRaw`/`$queryRaw` against the same table Prisma migrates and the same transaction that updates `KnowledgeSource`. Prisma can't run vector similarity operators through its query builder either way, so raw SQL is required regardless of which table owns the data; the only question is whether it's Anvia's table or the product's. This preserves ADR-0003's transactional guarantee. `@anvia/pgvector`'s `filterToPgVectorWhere` metadata-filter-to-SQL logic (verified correct above) is small enough to reimplement against real columns rather than a JSONB blob, which also gets the composite `(workspaceId, kind, isPublished, visibility)` index data-model.md wants — Anvia's owned table has no such index today.

**Recommendation:** flag ADR-0003 for a follow-up amendment in ticket 02 (repository reshape) rather than silently building the fallback into `packages/knowledge` without updating the ADR — the current ADR text asserts a transactional guarantee `@anvia/pgvector` as shipped cannot provide.

## 4. Wrapping `PrismaMemoryStore`

**Passes, but not via subclassing.** `PrismaMemoryStore.append()` always opens its own transaction — `this.delegates.transaction(operation, options)` — and never accepts an already-open transaction from the caller. The seam is the `delegates` constructor option (not `client`): supplying a custom `PrismaMemoryDelegates` object gives full control over what "open a transaction" means.

Two problems needed solving, both solved with `AsyncLocalStorage` side channels around the call to `store.append()`:

1. **Joining a caller-supplied transaction.** The custom `delegates.transaction()` checks an `AsyncLocalStorage`-held outer transaction; if one is active (set by our own `withTicketTransaction()` wrapper), it runs the operation against that transaction's delegates instead of opening a nested one. Verified with a real rollback test: wrapping a `Ticket.messageSeq` increment and a `store.append()` call in one transaction, then throwing — both writes were undone together. Without the fallback, `store.append()` reached its own commit regardless of what else the caller was doing.
2. **Writing extra columns.** `append()`'s internal `createMany` call is built entirely from Anvia's own fields (`memorySessionId`, `runId`, `turn`, `position`, `role`, `message`) — there's no option to pass through `workspaceId`, `ticketId`, `senderType`, etc. A second `AsyncLocalStorage` value, set immediately before calling `store.append()`, holds the per-message extra-column data; the custom `delegates.messages.createMany` merges it into each row by index before delegating to the real Prisma `createMany`. Same technique for `delegates.sessions.upsert`'s `create` branch, since `Conversation.workspaceId`/`ticketId` are required columns `PrismaMemoryStore` doesn't know about either.

Neither problem is mentioned in ADR-0004, which describes the goal ("wrapping `PrismaMemoryStore` so its `append()` runs inside our own transaction and writes extra columns") without the mechanism. The mechanism is real and works, but it's two `AsyncLocalStorage` side channels plus a hand-written `PrismaMemoryDelegates` implementation — this is meaningfully more code than "extend the class." **The fallback described in ADR-0004 (implement `MemoryStore` directly) was not needed**; the wrapping approach is viable and is the one to build in `packages/channels`/the message-writing module.

**A related finding, not in the original four questions:** `@anvia/memory-prisma@1.1.2` peer-requires `@prisma/client >=7.10.0 <8.0.0`. `apps/api/package.json` currently pins `"@prisma/client": "7.9.1"` / `"prisma": "7.9.1"`. This spike used `7.10.0` (the current 7.x stable) throughout with no issues; the real repo's Prisma pin needs bumping to at least `7.10.0` before `@anvia/memory-prisma` can be installed at all.

**Position assignment.** `append()` computes `position` itself via `findFirst` ordered by `position desc`, `+1` — scoped to `memorySessionId`, which is one-to-one with `Ticket` (unique `ticketId`). This already matches what the product needs (position ordered within a Ticket's conversation) without any help from `Ticket.messageSeq`. A single trial of two concurrent standalone `append()` calls on the same conversation produced no duplicate positions and no errors — Postgres serialized them — but this was one trial, not a stress test, and default `READ COMMITTED` isolation does not guarantee that in general; the `@@unique([memorySessionId, position])` constraint is the actual safety net; a lost race would surface as a unique-constraint error to retry, not silent corruption. **Recommendation:** treat Anvia's internal position counter as authoritative and drop the idea of `Ticket.messageSeq` independently claiming positions via a conditional update — the two would compete over the same sequence with no way to keep them consistent, since `PrismaMemoryStore` doesn't expose a hook to substitute its position source. `Ticket.messageSeq`, if kept, should be a denormalized *count* for display (e.g. "42 messages"), written in the same transaction as the append for convenience, not a claimed sequence number.

## 5. A message written outside any agent run

**Passes.** Inserted a `Message` row directly with Prisma (no `store.append()` call) — the pattern the Channel layer will use for messages that arrive after Escalation, when no agent run exists to record them. Required Anvia fields were filled by hand per data-model.md's guidance: `runId` as a Channel-generated identifier (`channel:<uuid>`), `turn` as the Ticket's current turn, `position` computed the same way `append()` computes it (`findFirst` desc `+1`, inside the same transaction as a `Ticket.messageSeq` update). `store.load({ scope })` afterward returned all three messages in order, including the directly-inserted one, with no validation errors — confirming the row was valid enough for Anvia's own reader to accept it as a normal conversation turn.

## 6. Exact OpenRouter model identifiers

Fetched live from `https://openrouter.ai/api/v1/models` (430 models, no auth required for listing) and spot-verified by making a real completion call through each candidate below.

| Tier | Recommended | Verified live | Context | Price (in / out per M tokens) |
|---|---|---|---|---|
| Fast | `openai/gpt-4.1-nano` | Yes | 1,047,576 | $0.10 / $0.40 |
| Main | `openai/gpt-4o-mini` | Yes | 128,000 | $0.15 / $0.60 |
| Judge | `anthropic/claude-sonnet-5` | Yes | 1,000,000 | $2.00 / $10.00 |
| Embedding | `openai/text-embedding-3-small` | Yes | — | 1536 dimensions confirmed |

Cheaper alternatives exist in the catalog and were **not** live-verified (recorded for later comparison, not as a recommendation): `openai/gpt-5-nano` ($0.05/$0.40, fast tier), `google/gemini-2.5-flash-lite` ($0.10/$0.40, fast tier), `google/gemini-2.5-flash` ($0.30/$2.50, main tier candidate).

**Embeddings run through OpenRouter, not a separate direct-OpenAI key.** `openai/text-embedding-3-small` is not listed in OpenRouter's `/models` catalog (that endpoint appears to only list completion models), which initially looked like embeddings might need a direct OpenAI key. That turned out to be wrong: `POST https://openrouter.ai/api/v1/embeddings` with `model: "openai/text-embedding-3-small"` works and returns 1536-dimension vectors, confirmed both via a raw HTTP call and via `@anvia/openai`'s `OpenAIClient.embeddingModel()` pointed at OpenRouter's `baseUrl`. One key covers both completions and embeddings.

## Package version notes

- All `@anvia/*` packages spiked at **1.1.2** (`core`, `openai`, `server`, `client`, `memory-prisma`, `pgvector`).
- `@anvia/memory-prisma` requires `@prisma/client`/`prisma` **`>=7.10.0 <8.0.0`** — bump from the repo's current `7.9.1` pin before building the real message store.
- Installing `prisma`/`@prisma/client` unpinned currently resolves to a `8.0.0-rc` line with an entirely different CLI ("Prisma Developer Platform" — `db push` doesn't exist under that name; commands are `prisma db`, `prisma migrate`, etc. restructured). Pin exactly, don't range-install.
- Prisma 7's datasource URL is no longer set in `schema.prisma`; it's `prisma.config.ts`'s job, matching the pattern already in `apps/api/prisma.config.ts`.
- `prisma db push`/`migrate` refuses to run when it detects it's being invoked by an AI agent, and requires the operator's explicit consent via `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. Expected and correct behaviour, worth knowing about ahead of time for future agent-driven migration work on this repo.

## Recommendation for the next tickets

- Ticket 02 (repository reshape): bump `@prisma/client`/`prisma` to `7.10.0`; update ADR-0003 to describe the `Chunk`-table `VectorStore` fallback rather than `@anvia/pgvector`'s owned table, since the transactional-denormalization guarantee it's built around does not hold with the package as shipped.
- Ticket 02 also needs to amend **ADR-0004 and data-model.md's Messages section**, not just ADR-0003. Both currently document `Ticket.messageSeq` as the claimed source of truth for `position` ("a single per-Ticket sequence, claimed inside the writing transaction" / "both take position from `Ticket.messageSeq`, incremented inside the same transaction as the insert"). Finding 4 shows this doesn't hold: `PrismaMemoryStore.append()` always computes `position` itself via its own internal `findFirst`, with no hook for an externally-supplied value, so `Ticket.messageSeq` cannot be the thing position is actually claimed from. Anyone building the message-writing module from ADR-0004/data-model.md as currently worded would implement a mechanism this spike already proved doesn't work.
- `packages/ai-agent`: build the AI Agent's output type as the flat wire schema + narrowing function from finding 1, not a `z.discriminatedUnion` passed as `outputSchema`.
- The message-writing module (`packages/channels` / wherever `append()` gets wrapped): use the `delegates` + double-`AsyncLocalStorage` technique from finding 4. Drop `Ticket.messageSeq` as a claimed sequence; keep it only as a denormalized count if it's kept at all.
