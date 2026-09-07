# Data Model

The Prisma schema, organised as one file per domain under `prisma/schema/`. Multi-file layout is used because the schema runs to twenty-odd models and because `@anvia/memory-prisma` generates its own file into that layout by default.

Names follow [`CONTEXT.md`](../../CONTEXT.md). Two consequences worth stating up front: the AI handler is `AiAgent` and a person is a `User` with role `HUMAN_AGENT` — there is no model called `Agent`; and `Ticket.assigneeId` always points at a person, never at an `AiAgent`.

## File layout

```
prisma/
├── schema/
│   ├── schema.prisma        generator, datasource, extensions
│   ├── auth.prisma          Better Auth models, extended
│   ├── workspace.prisma     Workspace, AiAgent, AiSettings
│   ├── channel.prisma       Channel, WebWidgetConfig, WebSession, CustomerIdentity
│   ├── ticket.prisma        Ticket, AiActivity
│   ├── message.prisma       Conversation, Message, ConversationError, Attachment
│   ├── knowledge.prisma     KnowledgeSource, Chunk
│   └── enums.prisma         every enum
└── migrations/
```

`prisma.config.ts` points `schema` at the folder rather than a single file.

## Conventions

- Primary keys are cuid strings.
- Every Workspace-scoped model carries `workspaceId` and is indexed on it first. The Prisma client extension filters on it; the index is what makes that cheap.
- Soft delete is `deletedAt` plus `deletedBy`. Soft-deleted rows stay physically present, are hidden from the interface, and are excluded from every retrieval path.
- Timestamps are `createdAt` / `updatedAt` unless a model has no meaningful update.
- Enums live in one file so that adding a value is one place to look.

## Workspace and people

**Workspace** — `id`, `name`, `slug` (unique), `closingMessage`, `createdAt`, `updatedAt`, `deletedAt`.
One per organisation. Everything else hangs off it.

**User** — the Better Auth model, extended with `workspaceId`, `role`, and `deletedAt`.
Better Auth already provides `id`, `name`, `email` (unique), `emailVerified`, `image`, and timestamps, plus `Session`, `Account`, and `Verification`. A user belongs to exactly one Workspace; multi-workspace membership is out of scope. Registration creates a Workspace and an `ADMIN` in one transaction. `HUMAN_AGENT` accounts are created by an Admin with a temporary password — there is no invitation flow.

**`role` becomes a typed enum, and Better Auth's admin plugin comes out.** The boilerplate carries that plugin's convention: `role` as a nullable string holding comma-separated lowercase values, checked by splitting on commas. This product has exactly two roles and needs neither multiple roles per user nor the plugin's impersonation and ban machinery, and a lowercase free-text `"admin"` sitting beside a glossary that says `HUMAN_AGENT` is an invitation to drift. Role checking is a few lines written here instead. The existing helper that splits the string is replaced, and the `banned`, `banReason`, and `banExpires` columns the plugin added are dropped.

**AiAgent** — `id`, `workspaceId`, `name`, `status`, `createdAt`, `updatedAt`.
Present because the PRD models the AI handler as a first-class entity that Channels bind to, which is what makes one AI Agent serving both Web and WhatsApp expressible later. In the MVP each Workspace has exactly one.

**AiSettings** — `id`, `workspaceId` (unique), `followUpAfterSeconds`, `autoResolveAfterSeconds`, `autoResolveEnabled`, `updatedAt`.
One row per Workspace, created with the Workspace. Defaults: Follow-Up after 15 minutes, Auto-Resolution 60 minutes after that, enabled. Only ever consulted while the AI Agent owns a Ticket — a human-handled Ticket never arms either timer.

## Channel and session

**Channel** — `id`, `workspaceId`, `aiAgentId`, `type`, `name`, `status`, `createdAt`, `deletedAt`.
The binding between an AI Agent and a transport. Unique on `(workspaceId, type)` in the MVP, because one Web Widget per Workspace is the documented limit.

Channel-to-AI-Agent is modelled as a direct reference rather than a join table. The PRD sketches a join, but with one AI Agent per Workspace and one Channel per type it would be a table that never holds an interesting row. Promoting it later is a migration, not a redesign.

**WebWidgetConfig** — `id`, `workspaceId`, `channelId` (unique), `widgetKey` (unique), `botName`, `welcomeMessage`, `primaryColor`, `allowedDomains` (string array), `createdAt`, `updatedAt`.
Typed rather than a JSON blob on `Channel`, because every field is read by the widget on load and `allowedDomains` is security-relevant — it decides whether a Web Session may be created at all. `widgetKey` is what the embed script carries publicly; it identifies, it does not authorise.

**CustomerIdentity** — `id`, `workspaceId`, `channelType`, `name`, `email`, `externalCustomerId`, `createdAt`, `deletedAt`.
Indexed on `(workspaceId, channelType, email)`. `externalCustomerId` is filled from the Business System when the email resolves; null means Customer-specific Business Tools are unavailable and the AI Agent must escalate rather than guess. Deliberately **not** unique on email: the same email may hold several concurrent Web Sessions, and nothing merges them.

**WebSession** — `id`, `workspaceId`, `channelId`, `customerIdentityId`, `accessToken` (unique), `status`, `createdAt`, `closedAt`.
`accessToken` is high-entropy random, never derived from the id. A Session stays active until its Ticket resolves; closing the browser does nothing. Once closed it cannot reopen, and the Session Link renders a read-only transcript.

## Ticket

**Ticket** — the centre of the model.

| Field | Notes |
|---|---|
| `id`, `workspaceId` | |
| `webSessionId` | unique — a Web Session yields at most one Ticket |
| `channelId`, `aiAgentId`, `customerIdentityId` | |
| `assigneeId` | a `User`; null while the AI Agent owns it |
| `title` | AI-generated once, human-overridable, never regenerated |
| `status`, `category`, `priority` | |
| `escalationReason`, `escalatedAt` | |
| `claimedAt` | |
| `resolvedBy`, `resolutionReason`, `resolvedAt` | |
| `messageSeq` | integer high-water mark; see Message ordering |
| `clarificationCount` | enforces the two-turn clarification cap |
| `firstMessageId` | the message that caused the Ticket to exist |
| `aiFailureCount` | enforces "AI failed twice → escalate" |
| `createdAt`, `updatedAt`, `deletedAt`, `deletedBy` | |

Indexes: `(workspaceId, status, createdAt)` for the Shared Human Queue, which is ordered oldest-waiting-first; `(workspaceId, assigneeId, status)` for a Human Agent's own list; `(workspaceId, customerIdentityId)` for Ticket Knowledge retrieval.

**Claiming is a conditional update**, not a read-then-write:

```
UPDATE tickets
   SET assignee_id = :userId, status = 'HUMAN_HANDLING', claimed_at = now()
 WHERE id = :ticketId AND assignee_id IS NULL AND status = 'ESCALATED'
```

Zero rows affected means someone else won. This is the only thing standing between two Human Agents answering the same Customer; realtime delivery is not, and must never be relied on for it.

**AiActivity** — `id`, `workspaceId`, `ticketId`, `eventType`, `metadata` (JSON), `createdAt`.
Append-only, ordered by `createdAt`, rendered as the Activity Timeline. `metadata` holds retrieved source ids, tool names and outcomes, decisions, classifications. It never holds the model's reasoning. This is a product record and is not interchangeable with telemetry.

## Messages — extending Anvia's memory

This is the one place where a library's schema and the product's schema become the same tables. See [ADR-0004](../adr/0004-message-store-extends-anvia-memory.md).

`@anvia/memory-prisma` expects three model delegates and specific field names on them. It accepts a `delegates` option to point at differently-named models, and tolerates extra columns. So the models are named for the domain, and carry both sets of fields.

**Conversation** (Anvia's session model)

| Required by Anvia | Added here |
|---|---|
| `id`, `scopeKey` (unique), `sessionId`, `userId`, `metadata` (JSON), `createdAt`, `updatedAt` | `workspaceId`, `ticketId` (unique) |

`scopeKey` is derived deterministically from the Ticket, and derived the same way for reads, writes, deletion, and inspection.

**Message** (Anvia's message model)

| Required by Anvia | Added here |
|---|---|
| `id`, `memorySessionId`, `runId`, `turn`, `position`, `role`, `message` (JSON), `createdAt` | `workspaceId`, `ticketId`, `senderType`, `senderUserId`, `content`, `externalMessageId`, `deliveryStatus`, `deliveryAttempts`, `deletedAt`, `deletedBy` |

Constraints: `@@unique([memorySessionId, position])` — Anvia's own; `@@unique([workspaceId, externalMessageId])` — the idempotency guarantee, enforced by the database rather than by an application check. Indexes on `(ticketId, position)` for rendering and `(runId)` for tracing.

`content` is the plain text the interface renders; `message` is the runtime's structured form. Both are written, because the interface must render messages the runtime never produced — a Human Agent's reply, a handoff, a closing message.

**Message ordering is the subtle part.** Two writers append to this table: the agent runtime through the wrapped store, and the Channel layer directly. Both take `position` from `Ticket.messageSeq`, incremented inside the same transaction as the insert. Anvia's uniqueness constraint then catches any mistake rather than letting the conversation silently interleave.

Messages written outside an agent run still need Anvia's required fields. `runId` carries a Channel-generated identifier and `turn` the Ticket's current turn, so the row remains valid for the store to read back. **Confirming that the wrapped store round-trips these rows is part of the first spike**; if it cannot, the fallback is Anvia's documented memory interface implemented directly against this same table, which changes no columns.

**ConversationError** — Anvia's error model, extended with `workspaceId` and `ticketId`. Operational diagnostics, kept apart from conversation content.

**Attachment** — `id`, `workspaceId`, `ticketId`, `messageId`, `fileName`, `mimeType`, `sizeBytes`, `storageKey`, `processingStatus`, `extractedText`, `failureReason`, `createdAt`, `deletedAt`, `deletedBy`.
Uploads go **through the API**, not by presigned upload straight to object storage: size and MIME validation are requirements, and validating after a file has already landed is not validation. With a small MVP size limit the request body is not a concern. `storageKey` is the object storage key, not a URL; URLs are presigned per request so that access follows the Ticket's permissions rather than being permanent. Extracted content becomes Ticket-scoped context and never joins the Workspace's Knowledge Sources. Processing failure never breaks the Ticket.

## Knowledge

**KnowledgeSource** — `id`, `workspaceId`, `parentId`, `sourceType`, `title`, `content`, `sourceUrl`, `visibility`, `status`, `failureReason`, `createdAt`, `updatedAt`, `publishedAt`, `deletedAt`, `deletedBy`.
`parentId` self-references: a crawl produces one Knowledge Source per page under a parent, so pages can be published, hidden, or deleted individually. Only `PUBLISHED` sources are retrievable. Visibility is set per source; there is no chunk-level visibility.

**`content` was added during ticket 13** (not in the original list above): the raw text a Manual FAQ Knowledge Source is chunked from. Without it, editing a draft or re-publishing an already-published source would have nothing to re-chunk from — chunks alone are lossy (a `maxChars` change, say, can't be replayed against them). PDF and URL sources (ticket 15) are expected to leave it null and re-derive text from `sourceUrl`/object storage on each (re-)publish instead.

**Chunk** — the retrievable unit, covering both Knowledge Sources and Ticket Knowledge.

| Field | Notes |
|---|---|
| `id`, `workspaceId` | |
| `kind` | `KNOWLEDGE` or `TICKET` |
| `knowledgeSourceId` | set when `kind = KNOWLEDGE` |
| `ticketId`, `customerIdentityId`, `channelType` | set when `kind = TICKET`; the retrieval scope the PRD requires |
| `content` | |
| `embedding` | pgvector, 1536 dimensions |
| `position` | order within the source |
| `visibility` | **denormalized** |
| `isPublished` | **denormalized** |
| `deletedAt` | **denormalized** |
| `createdAt` | |

**Why the denormalization.** The vector adapter filters on chunk metadata; it does not join back to `KnowledgeSource`. So Workspace, Visibility, published state, and deletion state must be present on the chunk itself for a filter to constrain them. Keeping chunks in the same database is precisely what makes this safe: publishing, hiding, or soft-deleting a source updates the source **and its chunks in one transaction**. If that ever becomes a follow-up job, [ADR-0003](../adr/0003-pgvector-over-qdrant.md)'s entire argument collapses and Internal-Only material can be retrieved for a Customer.

Chunk ids are deterministic from source id and position, so re-ingesting the same source is idempotent rather than duplicating.

An HNSW index sits on `embedding`; a composite index on `(workspaceId, kind, isPublished, visibility)` serves the filter.

## Enums

| Enum | Values |
|---|---|
| `Role` | `ADMIN`, `HUMAN_AGENT` — replaces Better Auth's comma-separated string |
| `ChannelType` | `WEB`, `WHATSAPP` |
| `ChannelStatus` | `ACTIVE`, `INACTIVE` |
| `WebSessionStatus` | `ACTIVE`, `CLOSED` |
| `TicketStatus` | `AI_HANDLING`, `ESCALATED`, `HUMAN_HANDLING`, `RESOLVED` |
| `TicketCategory` | `ACCOUNT`, `BILLING`, `SUBSCRIPTION`, `TECHNICAL`, `GENERAL` |
| `TicketPriority` | `LOW`, `NORMAL`, `HIGH` |
| `EscalationReason` | `LOW_KNOWLEDGE_CONFIDENCE`, `NO_RELEVANT_KNOWLEDGE`, `CUSTOMER_REQUESTED_HUMAN`, `AI_FAILED_ATTEMPTS`, `INTERNAL_ACTION_REQUIRED`, `BUSINESS_TOOL_FAILURE`, `CONFLICTING_KNOWLEDGE`, `AI_GENERATION_FAILED`, `AI_TIMEOUT` |
| `ResolvedBy` | `AI_AGENT`, `HUMAN_AGENT` |
| `ResolutionReason` | `CUSTOMER_CONFIRMED`, `CUSTOMER_INACTIVE`, `CHANNEL_SESSION_EXPIRED`, `HUMAN_RESOLVED` |
| `MessageSenderType` | `CUSTOMER`, `AI_AGENT`, `HUMAN_AGENT`, `SYSTEM` |
| `DeliveryStatus` | `PENDING`, `SENT`, `FAILED` |
| `AttachmentStatus` | `UPLOADED`, `PROCESSING`, `READY`, `FAILED` |
| `KnowledgeSourceType` | `MANUAL_FAQ`, `PDF`, `URL`, `HELP_CENTER`, `INTERNAL_SOP` |
| `KnowledgeVisibility` | `CUSTOMER_SAFE`, `INTERNAL_ONLY` |
| `KnowledgeStatus` | `DRAFT`, `PROCESSING`, `READY`, `PUBLISHED`, `FAILED` |
| `ChunkKind` | `KNOWLEDGE`, `TICKET` |
| `AiActivityType` | `TICKET_CREATED`, `CLASSIFIED`, `KNOWLEDGE_RETRIEVED`, `TOOL_CALLED`, `TOOL_FAILED`, `AI_REPLIED`, `CLARIFICATION_ASKED`, `ESCALATED`, `FOLLOW_UP_SENT`, `RESOLVED`, `CLAIMED`, `TAKEN_OVER`, `HANDOFF_SENT`, `SUMMARY_GENERATED` |

`ResolvedBy` uses `AI_AGENT` / `HUMAN_AGENT` rather than the PRD's bare `AI` / `HUMAN`, so the glossary's rule holds in the database as well as in the code.

## The Business System

A separate service with its own schema, reachable only over HTTP — never a foreign key from anything above. Three models: **Customer** (`id`, `name`, `email`), **Subscription** (`id`, `customerId`, `plan`, `status`, `renewalDate`), **Invoice** (`id`, `customerId`, `amount`, `status`, `dueDate`).

It exists to demonstrate Business Tools honestly. Because the PRD requires that a tool failure escalates rather than being replaced by generic knowledge, the failure has to be demonstrable — which means the system has to be genuinely separate and genuinely stoppable.

## Migration order

The `vector` extension must be enabled before the migration that creates `Chunk`. Beyond that, the schema is created in dependency order — Workspace and auth, then Channel and session, then Ticket, then Conversation and Message, then Knowledge — and later work reads the schema rather than changing it. Where a column genuinely turns out to be needed, that is its own change, not a silent addition inside a feature.
