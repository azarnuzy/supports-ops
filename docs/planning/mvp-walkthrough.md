# MVP success-criteria walkthrough

Recorded 2026-09-08 against a local stack (API, worker, business-system, Postgres/pgvector, Redis) seeded with `pnpm seed:demo`, driven directly over HTTP (Web Widget endpoints, Better Auth sign-in, and the `tickets`/`analytics` routers) rather than through the Platform UI. Criteria are numbered as in [supportops_prd.md](../../supportops_prd.md) section 54.

## Success criteria

| # | Criterion | Result | Evidence |
| - | --- | --- | --- |
| 1 | Admin creates Workspace and Agent | PASS | `pnpm seed:demo` creates the Admin, Workspace, and Human Agent via `registerAdminWorkspace` / `createHumanAgent`. |
| 2 | Admin configures Web Widget | PASS | Seed calls `updateWebWidgetConfig`; verified `WebWidgetConfig` row with demo bot name, colors, and allowed domains. |
| 3 | Widget can be embedded on an allowed domain | PASS | `GET /widget/config` succeeds with `Origin: http://localhost:3001` (an allowed domain) and is rejected (403) for other origins by `isAllowedOrigin`. |
| 4 | Customer starts a Web Session | PASS | `POST /widget/pre-chat` returns an active session and access token. |
| 5 | Ticket is created only after first support message | PASS | No Ticket exists after Pre-Chat; one is created on the first `POST /widget/messages` call. |
| 6 | AI classifies title/category/priority | PASS | E.g. "Last invoice shown as overdue for Pro subscription" classified `BILLING` / `HIGH`; a plans question classified `GENERAL` / `NORMAL`. |
| 7 | AI answers from customer-safe knowledge | PASS | Replies were grounded in the seeded Customer-Safe Knowledge Sources (overdue-invoice, plans, password reset content reproduced correctly). |
| 8 | AI can call a mock business tool | PASS | `TOOL_CALLED` AI Activities recorded against the Business System (`getCustomerByEmail`, subscription/invoice lookups), values matched seeded Business System data (e.g. Starter/PAST_DUE for `siti@example.com`). |
| 9 | AI can use attachments as Ticket context | PASS | Uploaded `.txt` attachment reached `processingStatus: READY` with `extractedText` populated and available to the AI Agent. |
| 10 | AI can retrieve relevant previous resolved customer tickets | PASS (indexing verified) | Resolving a Ticket enqueues `ticket-knowledge-index`; confirmed `Chunk` rows with `kind: TICKET` created for the resolved Ticket. A live retrieval-in-a-new-conversation demonstration was not captured this pass. |
| 11 | AI escalates correctly when required | **BLOCKED** | An explicit "talk to a human" request escalates correctly. But see [#37](https://github.com/azarnuzy/supports-ops/issues/37): every AI reply that should stay with the AI Agent is also escalated, due to an unrelated crash after the reply is sent — so "escalates only when required" cannot be honestly demonstrated until that's fixed. |
| 12 | Shared queue receives escalated Ticket | PASS | `GET /tickets/queue` (Human Agent session) lists escalated Tickets, oldest first. |
| 13 | Agent can claim Ticket safely | PASS | `POST /tickets/:id/claim` assigns the Ticket to the Human Agent; Ticket moves to `HUMAN_HANDLING`. |
| 14 | AI generates fresh escalation summary | PASS | Claim produces a structured Escalation Summary (customer need, escalation reason, what was tried, suggested next action/reply) within a few seconds, `escalationSummaryStatus: READY`. |
| 15 | Agent can generate suggested reply on demand | PARTIAL | Endpoint works, but see [#38](https://github.com/azarnuzy/supports-ops/issues/38): for an all-English conversation, 2 of 3 suggested-reply calls came back in Spanish. |
| 16 | Agent can send response and resolve Ticket | PASS | `POST /tickets/:id/messages` then `POST /tickets/:id/resolve` delivers the reply and resolves the Ticket with a closing system message. |
| 17 | AI can resolve straightforward Ticket automatically | NOT EXERCISED | No conversation in this pass produced a model `RESOLVE` decision to observe end to end; also downstream of the reliability concern in #37. |
| 18 | Follow-up and inactivity auto-resolution work | **BLOCKED** | Root-caused to [#37](https://github.com/azarnuzy/supports-ops/issues/37): `scheduleFollowUp`'s BullMQ job id contains a colon, which the installed `bullmq` version rejects, so the Follow-Up job is never actually scheduled. |
| 19 | Activity Timeline records important events | PASS | `AiActivity` rows recorded, in order, for created/classified/knowledge-retrieved/tool-called/replied/escalated/claimed/resolved across the walked Tickets. |
| 20 | Dashboard displays required metrics | PASS | `GET /analytics/overview` (Admin session) returns total Tickets, AI-resolution/escalation rates, status and channel breakdowns, and per-agent active Ticket counts. |
| 21 | Core Agent logic remains independent from Web transport | PASS (by inspection) | `packages/ai-agent` has no dependency on `apps/api`'s widget/channel code; Channel-specific rules live behind `packages/channels`' adapter boundary, matching [supportops_prd.md](../../supportops_prd.md) section 56 and `CONTEXT.md`'s Channel Adapter definition. |

## The three primary journeys

- **AI Agent resolving a Ticket end to end** — walked partially. The AI Agent classifies, retrieves Knowledge, calls Business Tools, and drafts a correct, grounded reply every time it was exercised. It could not be observed staying with the AI Agent through to resolution, because [#37](https://github.com/azarnuzy/supports-ops/issues/37) escalates the Ticket immediately after any reply is sent.
- **AI Agent escalating to a person** — walked end to end and PASSED: explicit "I want to talk to a human" → Ticket appears in the Shared Human Queue → Human Agent claims it → fresh Escalation Summary is generated → Human Agent replies and resolves.
- **An Admin taking over** — walked end to end and PASSED: `POST /tickets/:id/takeover` on a Ticket still with the AI Agent stops AI generation, assigns the Ticket to the Admin, and sends the Customer a takeover message. One rough edge: `POST /tickets/:id/resolve` is restricted to `role: HUMAN_AGENT`, so an Admin who took over a Ticket cannot resolve it directly — they must first reassign it to a Human Agent via `PATCH /tickets/:id/assignee`. Not filed as a bug (it may be an intentional role boundary), but worth a product decision if it's not.

## Failures filed as their own tickets

- [#37](https://github.com/azarnuzy/supports-ops/issues/37) — AI Agent replies are wrongly escalated because `scheduleFollowUp`'s BullMQ job id contains a `:`, which the installed `bullmq` version rejects. Blocks criteria #11, #17, #18 and the "AI Agent resolving" journey.
- [#38](https://github.com/azarnuzy/supports-ops/issues/38) — AI Copilot suggested replies sometimes switch to Spanish for all-English conversations. Affects criterion #15.

## Demo data

`pnpm seed:demo` (idempotent) creates the demo Workspace end to end: Admin, Human Agent, configured Web Widget, and seven published Knowledge Sources split across Customer-Safe and Internal-Only visibility. Business System customers, subscriptions, and invoices (five customers spanning active, past-due, and cancelled subscriptions, and paid/overdue invoices) seed automatically and idempotently the first time the API or worker connects to that database.
