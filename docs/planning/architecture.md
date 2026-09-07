# Architecture

How SupportOps is put together, and — more importantly — where the boundaries are. The PRD's hardest constraint is that the AI reasoning layer must not become a Web chat application, so most of what follows is about keeping three things apart: the **Channel**, the **Ticket layer**, and the **AI Agent**.

Vocabulary throughout is the glossary in [`CONTEXT.md`](../../CONTEXT.md). *Agent* never appears alone.

## The three layers

```
        Customer
           │
┌──────────▼───────────────────────────────────────────┐
│  CHANNEL              transport, session, delivery   │
│  packages/channels                                   │
│  · validates the Web Session and allowed domain      │
│  · normalises inbound into a Message shape           │
│  · enforces the idempotency key                      │
│  · delivers outbound and tracks delivery state       │
└──────────┬───────────────────────────────────────────┘
           │  normalized inbound Message
┌──────────▼───────────────────────────────────────────┐
│  TICKET LAYER         the product's own truth        │
│  apps/api/src/modules                                │
│  · Workspace, Ticket, Message, Customer Identity     │
│  · status transitions, queue, Claim, assignment      │
│  · AI Activity, Activity Timeline                    │
│  · decides *whether* the AI Agent runs at all        │
└──────────┬───────────────────────────────────────────┘
           │  AgentInput
┌──────────▼───────────────────────────────────────────┐
│  AI AGENT             reasoning only                 │
│  packages/ai-agent                                   │
│  · retrieval via packages/knowledge                  │
│  · Business Tools via packages/tools                 │
│  · classification, grounding, escalation judgement   │
└──────────┬───────────────────────────────────────────┘
           │  AgentResult: REPLY | ESCALATE | RESOLVE
           ▼
     back to the Ticket layer, which persists the
     outcome and asks the Channel to deliver it
```

Three rules make this real rather than decorative:

1. **The AI Agent never touches transport.** It does not know what a Web Session is, what a shadow root is, or that server-sent events exist. It receives a normalized input and returns a decision.
2. **The Channel never makes support decisions.** It does not decide to escalate, does not classify, does not resolve. It moves messages and enforces its own session rules.
3. **The Ticket layer decides whether the AI Agent runs at all.** After Escalation or Takeover, it simply stops invoking it. The AI Agent is not asked to stay quiet — it is not called.

Rule 3 is why the widget cannot be built around the agent stream: for a large part of a Ticket's life there is no agent run to stream from.

## What adding WhatsApp must cost

A new Channel Adapter, a session implementation, webhook parsing, and provider delivery. It must not touch escalation rules, classification, priority, retrieval, the Shared Human Queue, the AI Copilot, or Ticket Knowledge. If a change to any of those turns out to be needed, a boundary has leaked.

## Contracts

### Channel Adapter

Each Channel Adapter owns exactly what is specific to its transport. The Web adapter owns the secure session token, allowed-domain validation, and the outbound stream; a future WhatsApp adapter would own phone identity, the provider's session window, webhook parsing, and template constraints.

The contract, in shape rather than in final code:

- `sendMessage(input)` → a delivery result the Ticket layer records as pending, sent, or failed
- `validateSession(reference)` → whether this Channel still considers the session usable

Everything channel-specific lives behind these. Nothing above the adapter branches on Channel type except where the product genuinely differs.

### AI Agent

The AI Agent receives Workspace, Ticket, Customer Identity, the current message with its Attachments, and the Channel type — the last only as context for tone and length, never as a switch for logic.

It returns exactly one of three decisions:

- **REPLY** with content to send
- **ESCALATE** with one of the fixed Escalation Reasons
- **RESOLVE** with a Resolution Reason

This is expressed as the runtime's structured output, validated against a schema before the Ticket layer branches on it. The value of that is precise: the application never parses prose to work out what the AI Agent meant.

The AI Copilot is the same construction in a second mode. The difference is not a prompt tweak — it is a different retrieval permission set (Internal-Only becomes readable) and a different output contract (a draft returned to a Human Agent, never a message sent to a Customer).

## Request and event flows

### Journey A — the AI Agent resolves it

```
Customer submits pre-chat
  → Channel creates a Web Session with an unguessable token
  → Session Link email queued (never blocks)
  → Customer starts typing immediately

Customer sends first meaningful message
  → Channel normalises it, enforces idempotency, persists a Message
  → Ticket layer creates the Ticket
  → AI Agent classifies: title, category, priority        [AI Activity]
  → AI Agent retrieves Customer-Safe knowledge            [AI Activity]
  → AI Agent returns REPLY
  → tokens stream out through Redis to the widget's one channel
  → Follow-Up timer armed

Customer confirms it worked
  → AI Agent returns RESOLVE / customer confirmed
  → closing message sent, Web Session closed, Session Link becomes read-only
  → Ticket queued for indexing as Ticket Knowledge
```

### Journey B — Escalation

```
AI Agent hits an escalation condition
  → returns ESCALATE with a reason                        [AI Activity]
  → Ticket becomes escalated; acknowledgement sent to Customer
  → the Ticket layer stops invoking the AI Agent entirely
  → Ticket appears in the Shared Human Queue (SSE to every dashboard)

Customer keeps writing
  → messages append to the same Ticket
  → nothing generates a reply

Human Agent claims
  → conditional update: assignee set only if still unassigned
  → losers of the race get a clean failure
  → Escalation Summary generated *now*, so it includes the waiting messages
  → handoff message sent; Ticket becomes human-handling
  → AI Agent becomes AI Copilot

Human Agent resolves
  → closing message, Web Session closed, Ticket queued for indexing
```

### Journey C — Takeover

```
Admin watching a live AI-handled Ticket clicks Take over
  → in-flight generation aborted
  → Ticket assigned to the Admin, status human-handling
  → Customer told a person has taken over
  → AI Agent becomes AI Copilot and cannot reclaim the Ticket
```

## Realtime

One mechanism, two audiences, no WebSocket.

```
                    ┌──────────────┐
   agent fragments ▶│              │
   human replies ──▶│ Redis pub/sub│──┬──▶ SSE ──▶ widget (one channel)
   status changes ─▶│              │  └──▶ SSE ──▶ dashboards (filtered)
                    └──────────────┘
```

- The **widget** holds exactly one inbound connection carrying everything, so it renders one ordered conversation whether the AI Agent, nobody, or a Human Agent is on the other end. Ordering comes from the server. Input is disabled by a status event, not by the lifetime of a connection.
- The **dashboard** holds one connection per signed-in user, filtered server-side to what that user may see — an Admin sees the Workspace, a Human Agent sees the queue plus their own Tickets.
- Redis pub/sub is what keeps this correct with more than one API instance.

### Event kinds

A streaming fragment is **not** a Message. An AI Agent reply has no row, and therefore no position, until it is complete.

| Event | Carries | Widget does |
|---|---|---|
| `message.delta` | provisional id, text fragment — **no position** | appends into a temporary bubble |
| `message.created` | the persisted row, with its real position | replaces the temporary bubble |
| `message.updated` | position, new delivery state | re-renders that row |
| `ticket.status` | new status | enables or disables input |
| `queue.changed` | ticket summary | dashboards only |

Assigning a position to a fragment would collide with the uniqueness constraint on the message table. This is the distinction to get right first; almost everything else in the widget follows from it.

### Reconnection and replay

SSE reconnects on its own. **Replay does not come for free and has to be built.** Redis pub/sub does not buffer: a client that drops receives nothing published while it was away, and on a mobile network dropping is routine.

```
client reconnects, sending Last-Event-ID: <last position seen>
  → server reads Messages for this Ticket with position > that value
  → server emits them as message.created, in order
  → server then subscribes to the live channel
```

The database is the replay source, not the event stream. A client that has never connected sends no header and receives the conversation from the beginning by the same path — which is also how the read-only transcript on a closed Session Link is rendered.

### Correctness never depends on delivery

Claiming is safe because of a conditional database update; the event only announces the result. Anything that must hold whether or not a client was connected is enforced in the database.

See [ADR-0005](../adr/0005-sse-for-realtime-single-widget-channel.md).

## Background work

Everything that must not block a request runs in `apps/worker`.

| Queue | Triggered by | Does |
|---|---|---|
| `session-email` | Web Session created | Sends the Session Link |
| `knowledge-ingest` | Knowledge Source created | Fetch or crawl → OCR → chunk → embed → index |
| `attachment-process` | Attachment uploaded | OCR → extract → chunk as Ticket context |
| `ticket-follow-up` | AI Agent replied | Delayed job: generate a contextual Follow-Up |
| `ticket-auto-resolve` | Follow-Up sent | Delayed job: resolve as customer-inactive |
| `ticket-index` | Ticket resolved | Index as Ticket Knowledge |
| `message-delivery` | Outbound send failed | Bounded retry |

**Timer discipline.** At most one Follow-Up timer per Ticket. A Customer reply removes the pending delayed job by its deterministic key; a new AI Agent answer schedules a fresh one. Auto-Resolution is a second delayed job armed only when the Follow-Up is actually sent. Human-handled Tickets never arm either.

## Knowledge and retrieval

```
source → fetch/crawl → OCR/extract → normalize → chunk → embed → index
```

Retrieval filters are built from authenticated server state — never from Customer or model input — and always constrain Workspace, Visibility, and deletion state.

| Retriever | May see |
|---|---|
| Customer-facing AI Agent | Published Customer-Safe Knowledge Sources; Ticket Knowledge for this Customer Identity on this Channel; Business Tool data |
| AI Copilot | The above, plus Internal-Only Knowledge Sources |

Because the vector adapter filters on chunk metadata rather than joining to the source table, Workspace, Visibility, and deletion state are **denormalized onto every chunk**. Keeping chunks in the same database is what makes that safe: a Visibility change or a soft delete updates the source and its chunks in one transaction, so the two cannot drift. That is the whole argument of [ADR-0003](../adr/0003-pgvector-over-qdrant.md), and it depends on the denormalized columns being written in the same transaction as the source change — never in a follow-up job.

## Business Tools

Fixed in code, read-only, not configurable per Workspace: look up a customer by email, get subscription status, get invoice status.

The Business System is a **separate service with its own schema**, reachable only over HTTP. This is deliberate: the PRD requires that a tool failure escalates rather than being papered over with generic knowledge, and that behaviour can only be demonstrated honestly if the system is genuinely separate and can be switched off.

Identity resolution: the Customer's email is looked up at session start; a returned external customer id is attached to the Customer Identity. Where none is found, retrieval still works but Customer-specific tools are unavailable.

## Multi-tenancy

Enforced in the data layer from authenticated request context, not by each call site. The extension is only as trustworthy as the context feeding it, which is why the isolation tests deliberately attempt cross-Workspace reads. See [ADR-0008](../adr/0008-workspace-isolation-via-prisma-extension.md).

## Two records, never confused

| | AI Activity | Telemetry |
|---|---|---|
| Audience | Admins, in the Activity Timeline | Developers |
| Contents | Knowledge retrieved and its source ids, Business Tool called and outcome, decision, escalation reason, classification | Spans, prompts, tokens, latency |
| Reasoning | Never stored | Redacted capture mode |
| Lifetime | Life of the Ticket | Free to expire |
| Store | Our database | External OTLP endpoint |

Neither substitutes for the other. See [ADR-0010](../adr/0010-otlp-observability-and-manual-evals.md).

## The widget's request boundary

Widget requests are unlike every other request the API serves, and the boilerplate's defaults are wrong for them in two ways at once. See [ADR-0011](../adr/0011-widget-requests-authenticate-by-session-token.md).

**There is no user.** A Customer has no account and never signs in. Authentication is the Web Session's unguessable access token, and the Workspace is derived from that Session rather than from a signed-in user. The boilerplate mounts its session-loading middleware on every route; widget routes must instead form their own segment with their own middleware.

**The origin is somebody else's domain.** The API's CORS policy is a static allow-list of the product's own origins, but the widget runs on customer websites by definition. Widget routes resolve the allowed origin per request against the Workspace's configured allowed domains — which is the same mechanism that enforces the PRD's allowed-domain rule, not a second implementation of it.

**The isolation extension therefore takes context from either source** — an authenticated user, or a resolved Web Session — and refuses to run a Workspace-scoped query when it has neither. Missing context is a bug, and failing closed is the only safe response.

**Rate limiting** lives on this boundary too: a fixed window in Redis, keyed by Web Session and by address, alongside a maximum message length, a maximum attachment size, and MIME validation. Attachments are uploaded **through the API** rather than straight to object storage, precisely so that size and type are checked before anything is stored.

## Creating a Ticket from the first meaningful message

A Web Session exists as soon as the pre-chat form is submitted, but a Ticket is created only on the first message that is actually a support request — which is what stops abandoned sessions and bare greetings from filling the Inbox.

Whether a message qualifies is decided by the AI Agent, not by a heuristic. The first message of a Session goes to the fast model with a structured output that answers, in one call, whether this is a support request, and if so what its title, category, and priority are. A greeting is answered warmly and no Ticket is created; a support request creates the Ticket already classified.

A rule based on message length and a list of greetings was rejected: the product answers in whatever language the Customer writes in, and a keyword list would have to be maintained per language to stay correct.

## Analytics definitions

Every Ticket begins under the AI Agent, so "all Tickets" and "AI-handled Tickets" are the same set. Both headline rates therefore share a denominator, which is what makes them comparable at a glance.

| Figure | Definition |
|---|---|
| AI Resolution Rate | Tickets resolved by the AI Agent ÷ all Tickets in the period, split into customer-confirmed and customer-inactive and **never** shown as a single number |
| Human Escalation Rate | Tickets that were ever escalated ÷ all Tickets in the period |
| Open vs Resolved | Current count by status |
| Tickets by Channel | Count by Channel type |
| Agent Workload | Count of human-handling Tickets per assignee |

Keeping confirmed and inactive resolutions apart is the point of the first figure, not a refinement of it: collapsing them would let a Customer walking away read as a success.

## Demo and evaluation fixtures

Two kinds of seeded data exist, and they are deliberately separate.

**Demo data** is a seed script that produces a complete Workspace — an Admin, a Human Agent, a configured Web Widget, a handful of published Knowledge Sources across both visibilities, and Business System customers with subscriptions and invoices. Every criterion in the PRD's success list is a scenario someone has to actually perform, and none of them can be performed against an empty database.

**Eval fixtures** are a small fixed corpus held with the eval suite itself, loaded into an in-memory vector store rather than read from the database. This is what the AI Agent factory's retriever parameter is for. An eval that retrieved from a live Workspace would produce different scores every time an Admin edited a document, which would make a faithfulness score meaningless as a measure of a prompt change.

## Widget delivery

The embed is one script tag carrying a widget key. That script is a small loader, not the widget: it reads its own key, fetches the Workspace's widget configuration, creates the custom element, attaches the shadow root, and mounts the application inside it.

Splitting loader from application matters for caching. The loader is tiny and cached briefly, so a configuration change reaches customer sites quickly; the application bundle is content-hashed and cached for a long time. The widget key identifies a Workspace — it does not authorise anything, which is why the allowed-domain check exists.

## Deployment topology

```
                    internet
                       │
              ┌────────▼────────┐
              │  Caddy (shared) │  only service publishing 80/443
              └───┬────┬────┬───┘
        proxy net │    │    │
        ┌─────────▼─┐ ┌▼────────┐ ┌▼────────┐
        │ platform  │ │ widget  │ │   api   │
        └───────────┘ └─────────┘ └────┬────┘
                                       │ private net
                          ┌────────────┼────────────┐
                    ┌─────▼─────┐ ┌────▼────┐ ┌─────▼─────┐
                    │ postgres  │ │  redis  │ │  worker   │
                    │ +pgvector │ │         │ │           │
                    └───────────┘ └─────────┘ └───────────┘
```

Postgres and Redis never join the proxy network. Images are built in CI and pulled by tag; nothing is built on the server. See [ADR-0007](../adr/0007-vps-containers-over-cloudflare.md).
