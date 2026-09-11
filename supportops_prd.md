# Product Requirements Document (PRD)
# SupportOps — AI-First Omnichannel Support Platform

**Document Status:** MVP PRD  
**Primary MVP Channel:** Web Embedded Widget  
**Future Channel:** WhatsApp  
**Out of Scope for MVP:** Email support channel  
**Target Delivery Window:** 2 weeks  
**Product Type:** Multi-tenant SaaS  
**Primary Users:** SaaS support teams at small-to-medium companies

---

## 1. Product Summary

SupportOps is an AI-first customer support platform for small-to-medium SaaS companies.

The platform is designed to centralize customer support conversations from multiple channels into one support workspace while allowing an AI agent to resolve straightforward issues automatically and escalate more complex cases to human agents.

The MVP focuses on the **Web Embedded Widget** as the first live customer support channel. The architecture must be designed so that additional channels such as WhatsApp can be connected later without rewriting the AI support logic.

The AI Agent and Channel layer must remain separate.

The long-term product direction is:

- AI Agent = reasoning, RAG, tool calling, escalation, resolution, classification.
- Channel = transport, session lifecycle, inbound/outbound message delivery.
- Core Support Platform = tickets, messages, users, workspaces, knowledge, analytics, audit trail.

---

## 2. Problem Statement

Small-to-medium SaaS companies often receive customer questions across multiple support channels such as website chat, WhatsApp, and email.

Today, support teams frequently need to open different applications for each channel, which creates several problems:

- slow response times,
- fragmented conversation context,
- duplicate support work,
- scattered company knowledge,
- inconsistent support quality,
- repetitive manual responses,
- difficult escalation from automated support to humans.

SupportOps aims to reduce those problems by introducing an AI-first support flow with human escalation when the AI cannot safely resolve the issue.

---

## 3. Target Users

### 3.1 Organization Type

Small-to-medium SaaS companies.

### 3.2 Internal Users

#### Admin

Responsible for platform configuration and support operations.

Capabilities:

- create and manage workspace,
- create Agent accounts,
- configure Web Widget,
- manage knowledge base,
- configure AI support settings,
- view all tickets,
- view AI-handled tickets live,
- manually take over AI tickets,
- reassign human-handled tickets,
- view dashboard analytics.

#### Agent

Responsible for handling tickets escalated from AI.

Capabilities:

- view shared human queue,
- claim tickets using `Assign to me`,
- handle multiple active tickets,
- view own assigned tickets,
- view resolved tickets previously handled by themselves,
- respond to customers,
- generate AI suggested replies on demand,
- resolve human-handled tickets.

---

## 4. Product Principles

### 4.1 AI First, Human on Escalation

AI is the first support handler.

Human support is involved only when:

- AI cannot safely answer,
- customer explicitly asks for a human,
- required information cannot be retrieved,
- customer requires an internal/manual action,
- the AI repeatedly fails to help,
- the AI workflow itself fails.

### 4.2 Channel-Agnostic AI

The AI Agent must not be implemented as a Web-specific AI.

The core AI Agent should receive normalized conversation input and return normalized decisions.

Example outputs:

- `REPLY`
- `ESCALATE`
- `RESOLVE`

The Channel layer is responsible for delivering that result to the customer.

### 4.3 Minimal MVP Complexity

The product should solve the core workflow without introducing production-level complexity that is not needed for the final assignment.

---

## 5. MVP Scope

### 5.1 Included

- multi-tenant workspace architecture,
- Admin and Agent roles,
- Web Embedded Widget,
- Web chat sessions,
- secure session access link,
- AI-first support,
- AI response streaming,
- RAG company knowledge,
- customer-scoped previous-ticket retrieval,
- attachment processing,
- read-only business tools,
- human escalation,
- shared human queue,
- manual human takeover,
- AI copilot for human Agent,
- ticket activity timeline,
- dashboard analytics,
- configurable AI follow-up timing,
- contextual AI follow-up,
- auto-resolution for AI tickets,
- basic widget customization,
- basic rate limiting.

### 5.2 Future Channel

WhatsApp must be supported by the architecture but is not required to be fully implemented before the Web flow is complete.

### 5.3 Out of Scope

The following are intentionally excluded from MVP:

- Email as a support channel,
- multiple WhatsApp numbers per workspace,
- multiple Web Widgets per workspace,
- Supervisor role,
- SLA engine,
- auto-routing based on category or priority,
- Agent availability status,
- Agent return-to-queue,
- internal notes,
- ticket reopen,
- automatic ticket merge,
- automatic ticket split,
- cross-channel identity resolution,
- OTP or magic-link identity verification,
- multi-workspace membership per user,
- SSO,
- configurable system prompt,
- configurable AI provider/model,
- write-capable business tools,
- knowledge versioning,
- scheduled knowledge recrawling,
- Trash/Restore UI,
- advanced CAPTCHA/anti-bot protection,
- full-text conversation search,
- customer ticket history portal,
- advanced analytics,
- fallback AI provider,
- multiple AI models,
- human ticket auto-follow-up,
- human ticket auto-resolution.

---

## 6. Multi-Tenant Workspace Model

SupportOps is a multi-tenant SaaS platform.

Each organization has one Workspace.

All core data must be scoped by `workspaceId`.

Workspace-scoped entities include:

- Users,
- AI Agents,
- Channels,
- Tickets,
- Messages,
- Customer Identities,
- Knowledge Sources,
- Attachments,
- AI Settings,
- Analytics,
- Audit Events.

A user from Workspace A must never access data from Workspace B.

---

## 7. Authentication and User Management

### 7.1 Admin Registration

Public registration creates:

1. Admin account,
2. Workspace.

The Admin is automatically attached to the created workspace.

### 7.2 Agent Account Creation

Agent accounts are created manually by Admin.

Admin provides:

- name,
- email,
- temporary password.

Agent then logs in using the created credentials.

No email invitation flow is required in MVP.

### 7.3 Roles

Supported roles:

- `ADMIN`
- `AGENT`

---

## 8. High-Level Architecture

The system must separate AI logic from Channel transport.

```text
Customer
   ↓
Channel
   ↓
Channel Adapter
   ↓
Normalized Inbound Message
   ↓
Ticket / Message Layer
   ↓
AI Agent
   ├── RAG
   ├── Customer Ticket Knowledge
   ├── Business Tools
   ├── Classification
   ├── Escalation
   └── Resolution
   ↓
Agent Decision
   ├── REPLY
   ├── ESCALATE
   └── RESOLVE
   ↓
Channel Adapter
   ↓
Customer
```

### 8.1 AI Agent

Responsibilities:

- analyze customer messages,
- determine if clarification is required,
- retrieve customer-safe knowledge,
- retrieve customer-scoped historical tickets when needed,
- invoke read-only business tools,
- generate responses,
- classify tickets,
- assign priority,
- detect resolution,
- detect escalation conditions,
- generate suggested replies for human Agents.

The AI Agent must not directly know how WebSocket, WhatsApp API, or Email transport works.

### 8.2 Channel Layer

Responsibilities:

- receive inbound messages,
- validate channel session,
- normalize messages,
- deliver outbound messages,
- manage channel-specific session rules,
- handle message delivery status,
- handle idempotency.

### 8.3 Channel Binding

AI Agent and Channel are separate entities.

A Channel may be connected to an AI Agent.

For MVP:

```text
Customer Support AI Agent
        │
        └── Web Channel
```

Future:

```text
Customer Support AI Agent
        ├── Web Channel
        └── WhatsApp Channel
```

---

## 9. Monorepo Direction

Recommended high-level structure:

```text
apps/
├── web
├── api
└── widget

packages/
├── ai-agent
├── channels
├── knowledge
├── tools
├── database
├── shared
└── ui
```

### 9.1 apps/web

Admin and Agent dashboard.

### 9.2 apps/api

Application backend and support domain modules.

Example modules:

- auth,
- workspace,
- users,
- tickets,
- messages,
- customers,
- attachments,
- knowledge,
- channels,
- analytics.

### 9.3 apps/widget

Customer-facing embedded support widget.

### 9.4 packages/ai-agent

Reusable AI Agent logic.

### 9.5 packages/channels

Channel adapter contracts and implementations.

Initially:

- Web Channel Adapter.

Future:

- WhatsApp Channel Adapter,
- Email Channel Adapter.

### 9.6 packages/knowledge

Knowledge ingestion and retrieval logic.

### 9.7 packages/tools

Fixed read-only business tools.

### 9.8 packages/database

Database schema/client.

### 9.9 packages/shared

Shared schemas, constants, and types.

---

## 10. Web Embedded Widget

### 10.1 Installation

Admin can configure a Web Widget and receive an embed script.

Example concept:

```html
<script
  src="https://supportops.example/widget.js"
  data-widget-key="widget_xxx">
</script>
```

### 10.2 Allowed Domains

Admin defines allowed domains.

Widget session creation must be rejected if the widget is used on an unapproved domain.

### 10.3 Widget Customization

Admin may configure:

- bot name,
- welcome message,
- primary color,
- allowed domains,
- closing message.

No advanced widget builder is required.

---

## 11. Web Pre-Chat Flow

Customer enters:

- name,
- email.

For MVP, the system assumes the entered email belongs to the customer.

No OTP or identity verification is required.

The email is used as the customer identity for Web customer context.

---

## 12. Web Session Model

### 12.1 Session Creation

After pre-chat submission:

1. create Web Session,
2. generate secure random access token,
3. allow customer to immediately enter chat,
4. send secure session access link to the provided email asynchronously.

The email delivery must not block chat creation.

### 12.2 Session Link

The session link:

- uses a secure random token,
- must not expose predictable session IDs,
- grants access only to that specific session,
- may be used while the session remains active.

### 12.3 Session Lifecycle

A Web Session remains active until the related Ticket is resolved.

Closing the browser does not close the session.

If the session is already resolved/closed:

- the old session cannot be reopened,
- the secure link displays the old transcript in read-only mode,
- customer receives a `Start New Conversation` action.

### 12.4 Session and Ticket Relationship

One Web Session may produce at most one Ticket.

```text
WebSession
   └── Ticket (0..1)
```

The Web Session is created after the pre-chat form.

The Ticket is created only after the customer sends the first meaningful support message.

This avoids empty tickets.

### 12.5 Multiple Sessions

The same email may have multiple active Web Sessions.

Each session is independent.

No automatic merging is performed.

---

## 13. Ticket Model

### 13.1 Ticket Creation

Ticket is created after the first meaningful customer message.

At that point AI generates:

- title,
- category,
- priority.

### 13.2 Ticket Status

MVP ticket statuses:

- `AI_HANDLING`
- `ESCALATED`
- `HUMAN_HANDLING`
- `RESOLVED`

Internal automation states such as waiting for customer do not need to be top-level ticket statuses.

### 13.3 Ticket Title

AI generates a concise ticket title after the first meaningful message.

Human may override the title.

AI does not continuously regenerate it.

### 13.4 Category

Fixed categories:

- `ACCOUNT`
- `BILLING`
- `SUBSCRIPTION`
- `TECHNICAL`
- `GENERAL`

AI chooses one.

Human may override.

### 13.5 Priority

Fixed priorities:

- `LOW`
- `NORMAL`
- `HIGH`

Definitions:

#### LOW

General informational issue that does not block product usage.

#### NORMAL

Customer is experiencing a problem but can still use at least part of the product.

#### HIGH

Customer cannot use an important product function or is affected by a serious billing/payment issue.

AI assigns initial priority.

Human may override.

Priority does not control shared queue ordering in MVP.

---

## 14. AI-First Ticket Workflow

Default flow:

```text
Ticket Created
      ↓
AI_HANDLING
      ↓
AI processes customer request
      ↓
┌────────────────────────────┐
│ AI_CAN_HANDLE              │
│ ESCALATE_TO_HUMAN          │
└────────────────────────────┘
```

If AI can handle:

```text
AI response
   ↓
Wait for customer
   ↓
Customer confirms solved
   ↓
RESOLVED
```

If AI cannot handle:

```text
AI decision
   ↓
ESCALATED
   ↓
Shared Human Queue
   ↓
Agent Assign to me
   ↓
HUMAN_HANDLING
   ↓
Agent Resolve
   ↓
RESOLVED
```

---

## 15. AI Escalation Rules

AI must escalate when any of the following occurs:

1. RAG confidence or retrieval quality is too low.
2. No relevant authoritative knowledge exists.
3. Customer explicitly asks to speak with a human.
4. Customer says AI has failed to help two times in the same ticket.
5. Case requires an internal/manual action.
6. Customer-specific live data is required but the business tool fails.
7. Two authoritative customer-safe knowledge sources conflict.
8. AI generation fails after one automatic retry.
9. AI process times out and still fails after one retry.

Suggested escalation reason values:

- `LOW_KNOWLEDGE_CONFIDENCE`
- `NO_RELEVANT_KNOWLEDGE`
- `CUSTOMER_REQUESTED_HUMAN`
- `AI_FAILED_ATTEMPTS`
- `INTERNAL_ACTION_REQUIRED`
- `BUSINESS_TOOL_FAILURE`
- `CONFLICTING_KNOWLEDGE`
- `AI_GENERATION_FAILED`
- `AI_TIMEOUT`

---

## 16. Customer Request for Human

There is no dedicated `Talk to human` button.

This is intentional so the behavior remains portable across channels.

AI detects natural-language requests such as:

- "I want to talk to a person."
- "Hubungkan saya ke customer service."
- "Saya mau bicara dengan human."

The request triggers immediate escalation.

AI must not attempt to persuade the customer to continue with AI.

---

## 17. AI Clarification

AI may ask clarification questions when the customer request is ambiguous.

Maximum clarification attempts:

- 2.

If the problem remains ambiguous after two clarification turns:

- escalate to human.

---

## 18. AI Responses and Grounding

### 18.1 Conversational Responses

Responses such as:

- greetings,
- acknowledgements,
- clarifications,
- closing statements,

do not require a knowledge citation.

### 18.2 Factual Support Responses

Factual/product support responses must be grounded in:

- published `customer-safe` company knowledge,
- or structured business tool data.

AI must not use its general model knowledge as the authoritative source for company-specific facts.

If no authoritative source exists:

- escalate.

---

## 19. Knowledge Source Hierarchy

Source-of-truth priority:

1. Structured business tools
2. Customer-safe company knowledge
3. Previous customer ticket knowledge

Previous ticket knowledge is contextual and is not authoritative for company policy.

Example:

A previous ticket may show that a customer once received a special refund.

The AI must not infer that the same refund policy applies today unless an authoritative company source confirms it.

---

## 20. Company Knowledge Base

Supported source types:

- manual FAQ,
- PDF,
- DOCX,
- URL documentation,
- help center articles,
- internal SOP.

### 20.1 Knowledge Visibility

Each knowledge source has one visibility:

#### `CUSTOMER_SAFE`

May be used by AI for customer-facing automatic responses.

#### `INTERNAL_ONLY`

May only be used by AI Copilot during Human Handling.

Internal-only content must never be exposed directly to customers.

### 20.2 Visibility Scope

Visibility is defined at document/source level.

No chunk-level visibility is required for MVP.

### 20.3 Knowledge Lifecycle

Statuses:

- `DRAFT`
- `PROCESSING`
- `READY`
- `PUBLISHED`
- `FAILED`

Only `PUBLISHED` sources are used for retrieval.

No versioning is required.

### 20.4 URL Ingestion

A web search/crawling tool may be used for documentation ingestion.

The system does not need to implement its own crawler.

Imported content must enter the same knowledge workflow before becoming published.

### 20.5 AI Knowledge Safety

Customer-facing AI retrieval:

- `CUSTOMER_SAFE` only.

Human AI Copilot:

- `CUSTOMER_SAFE`
- `INTERNAL_ONLY`
- customer ticket knowledge
- business tool data.

---

## 21. Previous Ticket Knowledge

Resolved tickets are treated as customer-scoped searchable knowledge.

They are not automatically inserted into every AI prompt.

AI retrieves them only when needed.

Retrieval scope:

- same Workspace,
- same customer identity,
- same channel,
- resolved tickets only.

### 21.1 Indexing

After Ticket becomes `RESOLVED`:

1. index conversation,
2. index relevant ticket metadata,
3. index processed attachment content,
4. store in customer-scoped retrieval index.

This may run as an asynchronous/background job.

If indexing fails:

- Ticket remains resolved,
- failure is logged,
- indexing may be retried.

### 21.2 Authority

Previous Ticket knowledge:

- is contextual,
- is not authoritative company policy,
- cannot be used alone to justify company rules or pricing.

---

## 22. Attachments

Supported MVP formats:

- PDF
- DOCX
- TXT
- JPG
- PNG

The original file is stored.

Attachment content becomes ticket-scoped AI context.

Attachments are not automatically added to global company knowledge.

### 22.1 Processing Lifecycle

Suggested attachment processing states:

- `UPLOADED`
- `PROCESSING`
- `READY`
- `FAILED`

### 22.2 Long Documents

Long files should be:

- extracted,
- chunked,
- retrieved selectively.

The whole document should not always be injected into the AI prompt.

### 22.3 Processing Failure

Attachment processing failure must not break the Ticket.

AI may:

- ask the customer for more text information,
- or escalate when the attachment is required to solve the case.

### 22.4 Resolved Ticket Attachments

After a Ticket is resolved, processed attachment content may become part of the customer-scoped ticket knowledge.

---

## 23. Business Tools

MVP tools are fixed in code.

Admin cannot configure tools per workspace.

Tools are read-only.

Initial tools:

- `getCustomerByEmail(email)`
- `getSubscriptionStatus(customerId)`
- `getInvoiceStatus(customerId, invoiceId?)`

### 23.1 Mock Business System

The MVP uses a mock internal SaaS database.

Suggested entities:

- customers,
- subscriptions,
- invoices.

### 23.2 Customer Identity Resolution

For Web:

1. customer submits email,
2. SupportOps calls `getCustomerByEmail(email)`,
3. returned external customer ID is attached to the support customer identity.

Example:

```text
SupportOps identity
email: budi@example.com

        ↓

Mock business system
customerId: cus_102
```

If no external customer is found:

- AI may still use RAG,
- AI may not call customer-specific business tools requiring `customerId`.

### 23.3 Tool Failure

If the question depends on customer-specific live data and the tool the AI Agent called fails:

- AI must escalate.

AI must not replace live data with generic RAG assumptions.

### 23.4 Write Actions

Not supported in MVP.

Examples that require human escalation:

- issue refund,
- change subscription,
- modify billing,
- manual account reset.

---

## 24. AI Resolution

AI may resolve a Ticket when the customer gives a clear resolution signal.

Examples:

- "Sudah berhasil."
- "Masalahnya sudah selesai."
- "Sekarang saya sudah bisa login."

Messages such as:

- "Oke."
- "Thanks."
- "Makasih."

alone are not enough.

When resolution intent is unclear, AI may ask:

> "Apakah masalahnya sudah berhasil terselesaikan?"

### 24.1 Resolution Metadata

Suggested fields:

```text
resolvedBy:
- AI
- HUMAN

resolutionReason:
- CUSTOMER_CONFIRMED
- CUSTOMER_INACTIVE
- CHANNEL_SESSION_EXPIRED
- HUMAN_RESOLVED
```

For Web MVP, `CHANNEL_SESSION_EXPIRED` is mostly future-facing for WhatsApp support.

---

## 25. AI Follow-Up and Auto-Resolution

Applicable only while AI owns the Ticket.

Admin configures:

- `follow_up_after`
- `auto_resolve_after`
- enable/disable auto-resolve.

### 25.1 Follow-Up Flow

```text
AI sends solution
      ↓
wait follow_up_after
      ↓
contextual AI follow-up
      ↓
wait auto_resolve_after
      ↓
no customer response
      ↓
RESOLVED
reason: CUSTOMER_INACTIVE
```

### 25.2 Timer Rules

Only one follow-up timer may be active per Ticket.

If customer replies:

- cancel old timer,
- continue AI processing,
- after new AI answer, begin a new timer.

### 25.3 Follow-Up Message

Follow-up is AI-generated and context-aware.

Example:

> "Apakah langkah reset password yang saya kirim tadi sudah berhasil?"

The follow-up should not introduce unrelated new information.

---

## 26. Human Escalation

When AI escalates:

1. Ticket status becomes `ESCALATED`.
2. AI stops sending messages.
3. customer receives an acknowledgement.
4. Ticket enters Shared Human Queue.
5. customer may continue sending additional messages.
6. AI does not respond again.

Example acknowledgement:

> "Saya perlu meneruskan masalah ini ke tim support kami agar dapat ditangani lebih lanjut."

---

## 27. Shared Human Queue

All escalated tickets enter a shared queue.

Queue ordering:

- oldest waiting ticket first.

Priority is displayed but does not control ordering.

### 27.1 Ticket Claim

Agent clicks:

`Assign to me`

Rules:

- a Ticket may have only one active assignee,
- first successful claim wins,
- concurrent second claim fails,
- Ticket disappears from unassigned queue,
- Admin may reassign if necessary.

Agent cannot return a Ticket to queue in MVP.

### 27.2 Multiple Active Tickets

One Agent may handle multiple active tickets at the same time.

---

## 28. Human Handoff

When Agent claims a Ticket:

1. assign the Ticket to Agent,
2. generate a fresh escalation summary,
3. send a handoff message to customer,
4. status becomes `HUMAN_HANDLING`.

The summary is generated at claim time, not escalation time, because the customer may have added messages while waiting.

Example customer message:

> "Halo, saya Sarah dari tim support. Saya akan melanjutkan membantu Anda."

---

## 29. Escalation Summary

Generated when Agent claims a Ticket.

Suggested content:

- issue summary,
- reason for escalation,
- actions already attempted by AI,
- relevant knowledge used,
- previous customer ticket context when relevant,
- suggested next action,
- suggested reply.

---

## 30. AI Copilot During Human Handling

Once status becomes `HUMAN_HANDLING`:

- AI cannot directly message customer,
- AI cannot take ownership back,
- AI only acts as copilot.

Copilot may use:

- customer-safe knowledge,
- internal-only knowledge,
- business tools,
- customer ticket knowledge,
- current conversation.

### 30.1 Suggested Reply

Agent may click:

`Generate suggested reply`

The draft is generated on demand.

It is not auto-generated for every customer message.

Human must:

- review,
- edit if needed,
- click Send.

### 30.2 Internal Knowledge Safety

Internal-only information may assist copilot reasoning.

Suggested replies must still be customer-safe.

Internal policies must not be exposed directly.

---

## 31. Manual Human Takeover

Admin may manually take over an AI-handled Ticket before AI escalation.

Flow:

```text
AI_HANDLING
   ↓
Admin Take over
   ↓
HUMAN_HANDLING
```

Effects:

- stop active AI generation,
- assign Ticket to takeover user,
- AI becomes copilot only,
- customer is informed that a human now handles the conversation.

---

## 32. Human Resolution

Human-handled tickets do not use:

- auto follow-up,
- auto resolution,
- automated inactivity close.

Human controls Ticket completion.

When Agent clicks `Resolve`:

1. send configurable closing message,
2. Ticket status becomes `RESOLVED`,
3. `resolvedBy = HUMAN`,
4. `resolutionReason = HUMAN_RESOLVED`,
5. Web Session becomes closed,
6. secure session link becomes read-only,
7. Ticket may be indexed into customer-scoped previous-ticket knowledge.

---

## 33. Closing Message

Workspace contains a configurable closing message.

Default example:

> "Percakapan ini telah kami tandai selesai. Jika Anda membutuhkan bantuan lagi, silakan mulai percakapan baru."

---

## 34. AI Disclosure

Customer should be told at the beginning that the first support handler is AI.

Example:

> "Halo, saya AI Support Assistant. Saya akan mencoba membantu terlebih dahulu. Jika diperlukan, saya akan meneruskan percakapan Anda ke tim support."

---

## 35. Language Handling

AI automatically detects the customer's language.

Rules:

- Indonesian customer → Indonesian response,
- English customer → English response,
- mixed language → use dominant customer language.

Suggested replies for human Agent should use the same customer language.

No manual language setting is required.

---

## 36. Streaming AI Response

Web Widget should stream AI responses.

Flow:

```text
Customer sends message
      ↓
Input disabled
      ↓
AI streams response
      ↓
Final response completed
      ↓
Input enabled
```

### 36.1 Customer Input During Streaming

Customer input is disabled while AI is generating.

This avoids concurrent messages and multi-generation complexity.

### 36.2 Streaming Failure

If generation fails:

1. retry automatically once,
2. if it fails again:
   - `ESCALATE_TO_HUMAN`
   - reason: `AI_GENERATION_FAILED`.

The same retry policy applies to AI timeout.

---

## 37. Message Batching and Idempotency

### 37.1 Inbound Idempotency

Every inbound message must have an idempotency key.

Examples:

- `external_message_id`
- `client_message_id`

Duplicate webhook or client delivery must not create duplicate messages or AI responses.

### 37.2 Web Message Simplicity

Because customer input is disabled during AI generation, the Web MVP does not need complex concurrent batching during a single AI turn.

The architecture should still allow future channel adapters to implement short debounce/batching.

---

## 38. Outbound Delivery State

Suggested message states:

- `PENDING`
- `SENT`
- `FAILED`

If outbound delivery fails:

- retry a limited number of times,
- retain failure state if all retries fail,
- AI workflow must not assume the customer received the response.

For Web MVP, delivery handling may be simpler than WhatsApp but the message model should remain reusable.

---

## 39. Customer Behavior While Waiting for Human

After escalation:

- customer may continue sending messages,
- messages are appended to the same Ticket,
- AI remains silent,
- Ticket stays in Shared Human Queue until claimed.

No SLA automation is required.

---

## 40. Ticket Permissions

### Admin

Can view:

- all workspace tickets,
- AI-handled live tickets,
- escalated tickets,
- human-handled tickets,
- resolved tickets.

### Agent

Can view:

- Shared Human Queue,
- own assigned tickets,
- resolved tickets previously handled by themselves.

---

## 41. Inbox Filters

Required filters:

- status,
- category,
- priority,
- assignee.

Search:

- customer name,
- customer email.

Full-text conversation search is not required.

---

## 42. Ticket Detail Screen

Ticket detail should contain two primary views.

### 42.1 Conversation

Displays:

- customer messages,
- AI messages,
- human Agent messages,
- attachment previews/links,
- AI streaming state when applicable.

### 42.2 Activity Timeline

Displays structured lifecycle events.

Example:

```text
10:01 Session created
10:02 Ticket created
10:02 Priority set to NORMAL
10:02 Category set to ACCOUNT
10:03 Retrieved Password Reset FAQ
10:04 AI responded
10:10 Customer replied
10:11 Tool getSubscriptionStatus SUCCESS
10:12 AI escalated: INTERNAL_ACTION_REQUIRED
10:20 Claimed by Agent Sarah
10:21 Human handoff message sent
10:30 Resolved by Human
```

---

## 43. AI Audit Trail

The system stores structured AI activity.

Do not store private chain-of-thought.

Suggested events:

- knowledge retrieved,
- source IDs used,
- business tool called,
- business tool success/failure,
- AI decision,
- escalation reason,
- category classification,
- priority classification,
- resolution actor,
- resolution reason.

---

## 44. Soft Delete

Core data uses soft delete.

Examples:

- Ticket,
- Message,
- Attachment,
- Knowledge Source,
- User where applicable.

Suggested fields:

```text
deletedAt
deletedBy
```

MVP does not require Trash/Restore UI.

Soft-deleted data:

- is hidden from normal UI,
- is excluded from AI retrieval,
- is excluded from previous-ticket retrieval,
- remains stored physically.

Soft-deleting a Ticket or Attachment must make its indexed vector/chunk data immediately ineligible for AI retrieval.

---

## 45. Retention

Ticket and Attachment data is retained while the Workspace remains active unless soft-deleted by Admin.

No configurable retention policy is required.

---

## 46. Basic Abuse Protection

Web Widget should implement basic protections:

- session/IP rate limiting,
- maximum message length,
- maximum attachment size,
- supported attachment MIME validation.

Not required:

- CAPTCHA,
- advanced bot detection,
- advanced anti-abuse engine.

---

## 47. Dashboard Metrics

MVP dashboard metrics:

### 47.1 AI Resolution Rate

Tickets successfully resolved by AI.

Should distinguish:

- customer-confirmed resolution,
- inactivity auto-resolution.

### 47.2 Human Escalation Rate

Percentage of AI-handled Tickets that are escalated to human.

### 47.3 Open vs Resolved Tickets

Current Ticket status distribution.

### 47.4 Tickets by Channel

Initially Web.

Architecture should support future WhatsApp and Email breakdown.

### 47.5 Agent Workload

Number of active human-handled Tickets assigned to each Agent.

---

## 48. Resolution Analytics Integrity

AI auto-resolve by inactivity must not be treated exactly the same as a confirmed successful AI resolution.

Dashboard should preserve resolution reason.

Example:

```text
AI Resolved
├── Customer Confirmed
└── Customer Inactive
```

This avoids artificially inflating AI effectiveness.

---

## 49. Mock SaaS Business Data

Recommended mock business schema:

### Customer

- id,
- name,
- email.

### Subscription

- id,
- customerId,
- plan,
- status,
- renewalDate.

### Invoice

- id,
- customerId,
- amount,
- status,
- dueDate.

This data exists only to demonstrate AI tool calling and customer-specific support.

---

## 50. Core Suggested Entities

This is a conceptual model, not a final database schema.

### Workspace

- id
- name

### User

- id
- workspaceId
- name
- email
- role
- deletedAt

### AIAgent

- id
- workspaceId
- name
- status

### Channel

- id
- workspaceId
- type
- name
- status
- configuration

### AgentChannel

- id
- agentId
- channelId

### CustomerIdentity

- id
- workspaceId
- channelType
- name
- email
- externalCustomerId
- deletedAt

### WebSession

- id
- workspaceId
- customerIdentityId
- accessToken
- status
- createdAt
- closedAt

### Ticket

- id
- workspaceId
- sessionId
- agentId
- channelId
- customerIdentityId
- assigneeId
- title
- status
- category
- priority
- resolvedBy
- resolutionReason
- deletedAt
- createdAt
- resolvedAt

### Message

- id
- workspaceId
- ticketId
- senderType
- content
- externalMessageId
- deliveryStatus
- createdAt
- deletedAt

### Attachment

- id
- workspaceId
- ticketId
- messageId
- fileName
- mimeType
- storageUrl
- processingStatus
- extractedText
- deletedAt

### KnowledgeSource

- id
- workspaceId
- sourceType
- title
- visibility
- status
- deletedAt

### AIActivity

- id
- workspaceId
- ticketId
- eventType
- metadata
- createdAt

---

## 51. Channel Adapter Contract

Conceptual example:

```ts
interface ChannelAdapter {
  sendMessage(input: SendMessageInput): Promise<SendResult>

  validateSession?(
    sessionId: string
  ): Promise<ChannelSessionState>
}
```

Channel-specific behavior must live behind the adapter.

### Web

Owns:

- secure session token,
- widget state,
- streaming transport,
- domain validation.

### Future WhatsApp

Owns:

- phone identity,
- WhatsApp conversation/session window,
- webhook parsing,
- provider message IDs,
- outbound provider API,
- template/session constraints.

AI Agent does not implement these rules directly.

---

## 52. AI Agent Contract

Conceptual example:

```ts
interface AgentInput {
  workspaceId: string
  ticketId: string
  customerIdentityId: string
  message: {
    text?: string
    attachments?: Attachment[]
  }
  context: {
    channelType: "WEB" | "WHATSAPP" | "EMAIL"
  }
}
```

Possible result:

```ts
type AgentResult =
  | {
      type: "REPLY"
      content: string
    }
  | {
      type: "ESCALATE"
      reason: EscalationReason
    }
  | {
      type: "RESOLVE"
      reason: ResolutionReason
    }
```

---

## 53. MVP Primary User Journey

### Journey A — AI Resolves Issue

1. Customer opens embedded widget.
2. Customer enters name + email.
3. Web Session created.
4. secure session link emailed in background.
5. Customer sends first meaningful message.
6. Ticket created.
7. AI generates title, category, priority.
8. AI retrieves customer-safe knowledge.
9. AI answers using streaming.
10. Customer confirms issue is solved.
11. Ticket resolved by AI.
12. closing message sent.
13. Session closed.
14. Ticket indexed as customer-scoped historical knowledge.

### Journey B — AI Escalates

1. Customer starts Web Session.
2. Ticket created.
3. AI tries to solve issue.
4. Escalation rule triggers.
5. acknowledgement sent.
6. Ticket enters Shared Human Queue.
7. Customer may add more messages.
8. Agent clicks `Assign to me`.
9. fresh escalation summary generated.
10. customer receives Agent handoff message.
11. Agent handles Ticket.
12. Agent optionally generates AI suggested reply.
13. Agent sends response.
14. Agent resolves Ticket.
15. closing message sent.
16. Session closed.
17. Ticket indexed into customer-scoped knowledge.

### Journey C — Manual Admin Takeover

1. Admin watches AI-handled Ticket.
2. Admin clicks `Take over`.
3. active AI generation stops.
4. Ticket enters `HUMAN_HANDLING`.
5. customer is informed of human takeover.
6. AI becomes copilot.
7. Admin resolves Ticket manually.

---

## 54. Success Criteria

The MVP is successful when the demo can show all of the following:

1. Admin creates Workspace and Agent.
2. Admin configures Web Widget.
3. Widget can be embedded on an allowed domain.
4. Customer starts a Web Session.
5. Ticket is created only after first support message.
6. AI classifies title/category/priority.
7. AI answers from customer-safe knowledge.
8. AI can call a mock business tool.
9. AI can use attachments as Ticket context.
10. AI can retrieve relevant previous resolved customer tickets.
11. AI escalates correctly when required.
12. Shared queue receives escalated Ticket.
13. Agent can claim Ticket safely.
14. AI generates fresh escalation summary.
15. Agent can generate suggested reply on demand.
16. Agent can send response and resolve Ticket.
17. AI can resolve straightforward Ticket automatically.
18. Follow-up and inactivity auto-resolution work.
19. Activity Timeline records important events.
20. Dashboard displays required metrics.
21. Core Agent logic remains independent from Web transport.

---

## 55. MVP Non-Functional Requirements

### Security

- strict workspace isolation,
- unguessable Web session tokens,
- allowed domain validation,
- no internal-only retrieval for customer AI,
- no secrets/system prompt leakage,
- customer messages and attachments treated as untrusted input.

### Reliability

- inbound message idempotency,
- limited retry for outbound messages,
- one automatic retry for AI generation,
- failure escalation instead of hallucination.

### Maintainability

- AI Agent separated from Channel layer,
- reusable normalized Ticket/Message model,
- channel-specific session logic behind adapters.

### Performance

- AI streaming for Web,
- async email delivery,
- background indexing for resolved tickets,
- selective retrieval instead of full history injection.

---

## 56. Explicit Architectural Constraint

The MVP must not become a Web-specific AI chat application.

The codebase must reflect the following separation:

```text
AI Agent
   ≠
Web Channel
```

The Web Channel is only the first adapter.

Future WhatsApp integration should primarily require:

- new WhatsApp adapter,
- WhatsApp session implementation,
- WhatsApp webhook/provider integration.

It should not require rewriting:

- AI reasoning,
- RAG,
- escalation rules,
- ticket classification,
- priority logic,
- human queue,
- human copilot,
- customer ticket retrieval.

---

## 57. Final MVP Boundary

The MVP is not intended to solve every production customer support edge case.

The assignment should prioritize:

1. clear AI-first support flow,
2. clean human escalation,
3. good Web embedded experience,
4. strong RAG/tool integration,
5. modular Agent/Channel architecture,
6. understandable observability,
7. realistic two-week implementation scope.

Anything not necessary to demonstrate those goals should remain out of scope.
