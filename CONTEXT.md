# SupportOps

An AI-first, multi-tenant customer support platform. An AI Agent handles incoming customer conversations first and escalates to a Human Agent when it cannot safely resolve them. The AI reasoning layer and the message transport layer are deliberately separate concepts, so new channels can be added without touching support logic.

## Language

### Workspace and people

**Organization**:
The owner of one or more Workspaces and their shared Credits and Billing. A user belongs to one Organization but may belong to several of its Workspaces; a business's operational data stays in its own Workspace.
_Avoid_: Account, Tenant, Team

**Workspace**:
One business's isolated tenant within an Organization. Its Customer, Ticket, Knowledge, AI Agent, and Channel data belongs to that Workspace and is not visible to members of other Workspaces. A user may belong to several Workspaces with a separate role in each.
_Avoid_: Tenant, Team, Account, Organization

**Organization Admin**:
The Organization role that creates Workspaces, manages their shared Credits and Billing, and has Admin access to every Workspace in the Organization, including handling Customer Tickets. An Organization always has at least one; one person can operate it and all its Workspaces alone.
_Avoid_: Operator, Superadmin, Account Owner

**Admin**:
The Workspace role that configures the platform — invites its staff, configures the Web Widget, manages Knowledge Sources, tunes AI settings — and can see and act on every Ticket in the Workspace. It grants no Organization Billing access.
_Avoid_: Owner, Manager, Supervisor

**Human Agent**:
The Workspace role that handles Tickets escalated away from the AI Agent. Sees the Shared Human Queue, its own assigned Tickets, and the Tickets it previously resolved — never the whole Workspace.
_Avoid_: Operator, Support Rep, Staff. Never plain "Agent" — that word is ambiguous in this product

**Invitation**:
The emailed, expiring (7 days) offer to join one Workspace as an Admin or Human Agent. It is the only way staff join: accepting proves the invitee owns the address and lets them choose their own password. An email already active in the same Organization is added to the Workspace directly instead, with a notification and no Invitation; an email in another Organization is refused. An Admin invites only into the current Workspace, an Organization Admin into any Workspace of the Organization. Organization Admin is never granted through an Invitation.
_Avoid_: Invite link, Sign-up link, Admin-created account

**AI Agent**:
The automated support handler: the reasoning layer that reads a conversation, retrieves Knowledge, calls Business Tools, and returns a decision. It is a distinct entity from the Human Agent and from the Channel, and knows nothing about how messages are transported.
_Avoid_: Bot, Assistant, Copilot (Copilot is a distinct mode — see below)

**Customer**:
The person outside the Workspace asking for support. Never a platform user; has no account and never signs in.
_Avoid_: End user, Client, Requester

**Customer Identity**:
The Workspace-scoped record of who a Customer is on one Channel, keyed by the single value that identifies them there — an email address on the Web Widget, a phone number on WhatsApp. Also carries the name and the external customer ID resolved from the Business System. The same person reaching the Workspace on two Channels is two Customer Identities, and they are never merged.
_Avoid_: Contact, Profile, Lead

### Channel and session

**Channel**:
A configured route through which Customers reach the Workspace — the Web Widget and WhatsApp. Owns transport, session rules, and delivery; owns no support logic. Each Channel declares what it can carry and what it can report back — attachment limits, delivery states — rather than the platform assuming every Channel behaves like the Web Widget.
_Avoid_: Integration, Source, Platform

**Channel Adapter**:
The implementation that translates one Channel's specific behaviour into the platform's normalized message and session shape. All channel-specific rules live behind it.
_Avoid_: Connector, Driver, Provider

**Web Widget**:
The embeddable chat interface a Workspace installs on its own website with a single script tag. A Workspace has exactly one.
_Avoid_: Chat bubble, Embed, Plugin

**WhatsApp Channel**:
The Workspace's own WhatsApp Business number, reached through the Meta Cloud API. The Workspace brings its own Meta App and grants SupportOps access to it; SupportOps never owns the number. A Workspace has exactly one.
_Avoid_: WhatsApp integration, WA inbox, Meta channel

**Session**:
One Customer's continuous conversation on one Channel. Produces at most one Ticket, and carries the Agent Memory from its first turn — before any Ticket exists. How it opens and what closes it belong to the Channel: a Web Session opens after Pre-Chat and is reachable by Session Link; a WhatsApp Session opens on the Customer's first message and is required to end within a day.
_Avoid_: Conversation, Visit, Thread. Never "Web Session" as the general term — Web is one Channel, not the shape of the concept

**All Conversations**:
The Admin view of every Session in a Workspace, whether or not it has produced a Ticket. A Session without a Ticket remains part of this view rather than becoming a separate queue or navigation area.
_Avoid_: Without Ticket inbox, Ticket list

**Last Customer Message At**:
The single clock every silence rule reads: when this Session's Customer last wrote. Follow-Up, Auto-Resolution, Idle Closure, and the Customer Service Window are all measured from it, and any Customer message resets all four at once. A Workspace user replying never moves it.
_Avoid_: Last activity, Updated at, Idle since

**Customer Service Window**:
The 24 hours after a Customer's last WhatsApp message during which Meta allows free-form replies. It governs how a Message may be sent, never whether a Ticket is alive — outside it, only a Message Template may leave the platform. Owned by the Channel, invisible to the AI Agent.
_Avoid_: 24-hour window, Session window, Conversation window

**Message Template**:
The Meta-approved message SupportOps sends when the Customer Service Window has closed. It never carries an answer — it only invites the Customer back, because their reply is what reopens the window. SupportOps operates exactly one, and a Customer replying to it starts a new Ticket.
_Avoid_: Template message, HSM, Notification

**Pre-Chat**:
The name-and-email form a Customer submits before a Web Session opens. Web Widget only — WhatsApp identifies a Customer by their phone number and asks nothing. The email is taken at face value — nothing verifies it.
_Avoid_: Intake form, Onboarding, Registration

**Session Link**:
The unguessable URL emailed to a Customer after Pre-Chat, granting access to that one Web Session and nothing else. Web Widget only — a WhatsApp Customer already holds the transcript on their phone. Once the Session closes, it still opens the transcript, read-only.
_Avoid_: Magic link, Access token URL, Invite

### Ticket lifecycle

**Ticket**:
One support case. Created only when a Customer sends their first meaningful support message, so a Session abandoned after small talk leaves no Ticket behind — though its Agent Memory persists, because the AI Agent must remember what was already said. Carries a title, category, and priority that the AI Agent assigns and a human may override.
_Avoid_: Case, Issue, Request, Conversation

**Message**:
One turn in a Ticket's conversation, from a Customer, the AI Agent, or a Human Agent. Ordered, durable, and the single record of what was actually said — independent of who or what produced it.
_Avoid_: Chat, Entry, Post

**Escalation**:
The AI Agent handing a Ticket to humans because it cannot safely continue. After it, the AI Agent stops speaking to the Customer entirely, even though the Customer may keep writing.
_Avoid_: Handover, Transfer, Fallback

**Escalation Reason**:
The specific, recorded condition that triggered an Escalation — low knowledge confidence, an explicit request for a human, a failed Business Tool, Credit Exhaustion, and so on. Always one of a fixed set, never free text.
_Avoid_: Cause, Error, Trigger

**Shared Human Queue**:
The single pool of escalated Tickets waiting to be picked up, ordered oldest first. Every Human Agent sees the same queue; priority is shown but does not reorder it.
_Avoid_: Inbox, Backlog, Pool

**My Tickets**:
The active Tickets currently owned by one Human Agent after Claim. Resolved Tickets are history and never remain in My Tickets.
_Avoid_: Mine, Assigned conversations, Personal queue

**Unread Ticket**:
A Ticket with Customer Messages newer than a particular Workspace user's last-read position. Read state belongs to each user independently and is not a Ticket lifecycle status.
_Avoid_: New Ticket, Global unread

**Claim**:
A Human Agent taking an unassigned Ticket out of the Shared Human Queue and onto themselves. Exactly one Claim can succeed per Ticket; a second, concurrent attempt fails. There is no giving it back.
_Avoid_: Assign, Pick up, Grab

**Takeover**:
An Admin pulling a Ticket away from the AI Agent before any Escalation happens. Stops AI generation mid-flight and puts a human in charge.
_Avoid_: Intervene, Override, Interrupt

**Handoff**:
The moment a Ticket passes to a named human, comprising the Escalation Summary generated for that human and the message the Customer receives introducing them. Generated at Claim time, not at Escalation time, because the Customer may have said more while waiting.
_Avoid_: Transfer, Introduction, Greeting

**Escalation Summary**:
The briefing generated for a Human Agent at Claim time: what the Customer wants, why the AI Agent stopped, what it already tried, and what to do next.
_Avoid_: Handover note, Brief, Context dump

**Resolution**:
A Ticket reaching its end. Records both who ended it — the AI Agent, a Human Agent, or the platform itself when a timer expires — and the Resolution Reason, because they are counted separately. The platform is never recorded as the AI Agent, so a Ticket no human answered can never be counted as AI effectiveness.
_Avoid_: Closure, Completion, Done

**Resolution Reason**:
Why a Ticket ended: the Customer confirmed it was solved, the Customer went quiet while the AI Agent held it, a human decided it was done, a Human Agent held it but fell silent, or nobody ever claimed it out of the Shared Human Queue. Each names a materially different outcome and the distinctions are never collapsed — "abandoned in the queue" is the only number that tells an Admin the team is understaffed, so it never merges with "abandoned while being handled".
_Avoid_: Outcome, Status, Result

**Follow-Up**:
The message sent after a period of Customer silence following an AI Agent reply. Before a Ticket exists, it asks whether the Customer still needs help and spends no Credit; after a Ticket exists, it asks whether the answer worked and spends Credit. Humans never get one.
_Avoid_: Reminder, Nudge, Check-in

**Auto-Resolution**:
A Ticket ending because the Customer never replied to a Follow-Up. Counted apart from a confirmed Resolution so AI effectiveness is never overstated. The same timer closes a Session without a Ticket, without creating a Ticket or a Resolution metric.
_Avoid_: Timeout close, Auto-close, Expiry

**Idle Closure**:
A Ticket ending after its Customer has been silent past the Workspace's configured limit while humans owned it — whether a Human Agent was handling it or nobody ever claimed it. The human counterpart to Auto-Resolution, and the rule that keeps a WhatsApp Session from outliving its Customer Service Window. Sends a closing Message first, while it can still be delivered.
_Avoid_: Auto-close, Timeout, Expiry, Stale ticket

**Activity Timeline**:
The human-readable, ordered record of a Ticket's lifecycle events — created, classified, knowledge retrieved, tool called, escalated, claimed, resolved.
_Avoid_: Log, History, Audit log

**AI Activity**:
One structured, recorded step the AI Agent took: knowledge retrieved, a Business Tool called and its outcome, a decision made, a classification assigned. Never the AI's private reasoning, which is not stored.
_Avoid_: Trace, Event, Thought

**AI Turn**:
One Customer Message and everything the AI Agent does to answer it — Knowledge retrieval, Tool calls, retries, and the reply itself. The unit AI cost is measured in; a Session's AI cost is the sum of its AI Turns plus what it adds outside them, such as Attachments.
_Avoid_: Request, Call, Round, Exchange

**Agent Memory**:
The turn-by-turn record the AI Agent reasons over. Belongs to a Session, not to a Ticket, so the opening exchange that happens before anything qualifies as support is still remembered — and so the message that does qualify is classified with everything said before it. Stored as the `Conversation` model; the word "Conversation" is not domain language here.
_Avoid_: Conversation, History, Context window, Thread

### Knowledge and tools

**Knowledge Source**:
One document the Workspace has given the platform to answer from — an FAQ, a PDF, a crawled documentation URL, an internal SOP. Only a published one is ever retrievable.
_Avoid_: Article, Document, Content, Corpus

**Visibility**:
Whether a Knowledge Source may reach Customers. `Customer-Safe` content may be used in automatic replies; `Internal-Only` content may only inform a Human Agent through the AI Copilot and must never be shown to a Customer. Set per Knowledge Source, never per Chunk.
_Avoid_: Access level, Permission, Scope

**Chunk**:
A retrievable fragment of a Knowledge Source or of Ticket Knowledge. The unit the AI Agent actually searches over.
_Avoid_: Segment, Passage, Embedding

**Ticket Knowledge**:
A resolved Ticket turned into retrievable material, searchable only for the same Customer Identity on the same Channel. Contextual, never authoritative — a refund once granted to a Customer does not establish that it would be granted again.
_Avoid_: History, Past tickets, Case knowledge

**Grounding**:
The requirement that a factual claim about the Workspace's own products or policies trace back to a Customer-Safe Knowledge Source or to live Business Tool data. Conversational turns — greetings, acknowledgements, clarifying questions — need none. Where nothing authoritative exists, the AI Agent escalates rather than answering from its own model knowledge.
_Avoid_: Citation, Sourcing, RAG

**Tool**:
A named capability an AI Agent may invoke to retrieve information or act outside its own reasoning. An AI Agent may use only Tools assigned to it within the same Workspace.
_Avoid_: Function, Skill

**Built-in Tool**:
A Tool supplied and operated by SupportOps for a capability inherent to the product. A Built-in Tool exists only where SupportOps itself can provide meaningful functionality; it is not a placeholder category that every Workspace must use.
_Avoid_: Internal Tool, Native Tool, Business Tool

**HTTP Tool**:
A Workspace-configured Tool that calls an external HTTP API according to a declared input and request contract.
_Avoid_: Custom API Tool, REST Tool, Webhook

**MCP Server**:
An external server a Workspace connects to through the Model Context Protocol so its available Tools can be discovered and selectively enabled.
_Avoid_: MCP Integration, MCP Provider

**MCP Tool**:
A Tool discovered from an MCP Server and enabled by an Admin before it can be assigned to an AI Agent.
_Avoid_: Remote Tool, Server Tool

**Tool Assignment**:
The Workspace-scoped permission connecting one Tool to one AI Agent. Availability elsewhere in the Workspace never grants the AI Agent permission to use it.
_Avoid_: Tool Access, Tool Binding

**Usage Instruction**:
The Admin's free-text note on one Tool Assignment saying when that Tool should be used. It is appended to the Tool description the model reads, so it steers Tool selection without forcing it — SupportOps has no rule that compels a Tool call.
_Avoid_: Tool Policy, Routing Rule, Tool Instruction

**Business System**:
The Workspace's own product database, external to SupportOps, holding customers, subscriptions, and invoices. Its live facts reach the AI Agent through Tools, and a failed lookup never permits the AI Agent to guess.
_Avoid_: Backend, Mock API, CRM

**Attachment**:
A file carried by a Message inside a Ticket, whether sent by a Customer or a Human Agent — a document, an image, or a voice note. Its allowed direction, format, size, and count depend on the Channel. Whatever text can be extracted from it, including a voice note's transcript, becomes context for that Ticket only and never joins the Workspace's Knowledge Sources. A transcript is always Attachment content, never rewritten into the Customer's own words, so a mis-heard word can never be mistaken for something the Customer typed.
_Avoid_: Upload, File, Media

**AI Copilot**:
The AI Agent's second mode, active once a human owns a Ticket. Assists the Human Agent and may read Internal-Only knowledge, but cannot message the Customer, cannot take the Ticket back, and never surfaces internal content in what it drafts.
_Avoid_: Assistant, Helper, Suggestion engine

**Suggested Reply**:
A draft the AI Copilot produces only when a Human Agent asks for one. Never generated automatically, and never sent without a human reviewing it.
_Avoid_: Autocomplete, Canned response, Recommendation

### Observability and evaluation

**Telemetry**:
The developer-facing record of how the AI Agent ran — spans, prompts, token counts, latency — emitted to an external observability backend. Captured in redacted form, allowed to expire, and never a substitute for AI Activity or for the Message history.
_Avoid_: Logging, Monitoring, Tracing (a single trace is Telemetry, not an AI Activity)

**Eval Case**:
One predefined input paired with what correct AI Agent behaviour looks like, belonging to a category that names the product requirement it defends — grounding, visibility safety, escalation, classification, and so on. The input may include earlier Customer and AI Agent Messages as fixed history; executing the case evaluates one new AI Turn.
_Avoid_: Test, Fixture, Example

**Eval Dataset**:
A Workspace's named collection of Eval Cases and their default evaluation criteria, curated by its Admins for repeatable evaluation of its AI Agent.
_Avoid_: Test Set, Test Collection

**Eval Run**:
One execution of selected Eval Cases against a Workspace's configured AI Agent, with results correlated to its Telemetry for review in an external evaluation backend.
_Avoid_: Test Session, Simulation Session

**Eval Suite**:
A category's Eval Cases run together against the AI Agent. Always contains negative controls — cases that must fail — so a broken evaluator cannot make everything appear to pass.
_Avoid_: Test suite, Benchmark

**Judge**:
A separate model asked to score an AI Agent response against an Eval Case where no deterministic check can. Used only where a requirement genuinely needs it, because judging costs money and its scores vary between runs.
_Avoid_: Grader, Evaluator, Critic

### Models, Credits, and usage

**Agent Model**:
The language model an AI Agent replies and uses Tools with, chosen by the Admin per AI Agent from the Model Catalog. Classification and embedding models are platform choices the Admin never sees — changing the embedding model would invalidate every Chunk the Workspace owns.
_Avoid_: LLM, Engine, Brain, Main model

**Model Catalog**:
The short, curated list of models SupportOps offers as Agent Models. A model joins only after passing the Eval Suites, because not every model handles Tools and structured decisions reliably.
_Avoid_: Model list, Providers, Model marketplace

**Credit**:
The prepaid unit an Organization spends on AI. Always bought before it is spent, never billed after the fact. Shared by all AI Agents in its Workspaces. Only AI Turns and Follow-Ups after a Ticket exists spend Credits; pre-Ticket Follow-Ups and everything else the AI does — classification, Escalation Summaries, Suggested Replies, reading Attachments, ingesting Knowledge Sources — are absorbed by the platform.
_Avoid_: Token (the provider's unit, not the product's), Quota, Balance, Subscription

**Model Rate**:
How many Credits one AI Turn costs on a given Agent Model. Fixed per model, however many Tool calls the turn makes, so an Admin can predict spend by counting replies.
_Avoid_: Multiplier, Price, Cost

**Credit Ledger**:
The append-only record of every change to an Organization's Credits — Trial Grant, Top-Up, and spend. The Organization's balance is whatever its Credit Ledger adds up to; spend retains its originating Workspace even after that Workspace is deleted. Entries outlive the Tickets they were spent on, so deleting a Ticket never changes the balance.
_Avoid_: Transactions, Wallet, Billing history

**Trial Grant**:
The one-time Credits an Organization receives when it registers; creating another Workspace does not grant more.
_Avoid_: Free credits, Bonus, Starter pack

**Top-Up**:
Credits added to an Organization after it has paid for them — bought by an Organization Admin as a Top-Up Pack, or recorded by SupportOps for a payment made outside the platform.
_Avoid_: Recharge, Purchase, Deposit

**Top-Up Pack**:
One of a few fixed Credit amounts, each with a fixed Rupiah price, that an Organization Admin can buy. There is no arbitrary amount, because each payment carries a flat fee that would eat a small one. An Organization buys Packs one at a time; nothing renews on its own.
_Avoid_: Plan, Subscription, Tier, Package, Bundle

**Credit Exhaustion**:
An Organization's balance reaching zero. AI Turns already running may finish, so the balance may dip below zero; after that its AI Agents stop answering, the next Customer Message in any Workspace escalates with its own Escalation Reason, and the AI Copilot is unavailable. Counted apart from every other Escalation Reason so it never reads as the AI Agent failing.
_Avoid_: Out of credits, Suspension, Paywall

**AI Usage**:
The record of what AI Agents consumed and did — AI Turns, the Credits and Tokens they spent, and the Tool calls they made. An Admin sees their Workspace's usage; an Organization Admin sees usage across its Workspaces and can identify each Workspace's share. Never read from Telemetry, which is allowed to expire.
_Avoid_: Billing, Consumption, AI analysis, Analytics (Analytics reports Ticket outcomes)

**Token**:
The model provider's unit of text an AI Turn reads and writes, shown for insight only. An Organization is never charged by Token — a Credit is spent per AI Turn however many Tokens it used.
_Avoid_: Credit (Credits are what an Organization pays), Usage unit

### Operating the platform

**Operator**:
A member of SupportOps staff who oversees Organizations and Workspaces from outside them — watching usage, recording Top-Ups, and granting Unlimited Periods. Has their own sign-in, separate from every Workspace user, and belongs to no Workspace: an Operator is never a Workspace user, and a Workspace user can never become an Operator. Sees usage totals, never a Customer's Messages. Organizations register themselves; their Organization Admins create additional Workspaces.
_Avoid_: Superadmin, Root, Staff Admin (Admin is a Workspace role)

**Unlimited Period**:
A window, granted by an Operator, during which every AI Agent in an Organization's Workspaces keeps answering without spending its Credits — including Workspaces created while the window is active. It can end on a chosen date or remain active until an Operator ends it. AI Turns are still recorded as AI Usage, so what they would have cost stays visible, but the shared balance is left exactly as it was. An Organization has at most one active at a time.
_Avoid_: Unmetered, Free plan, Trial (the Trial Grant is something else)

### Dashboard and reporting

**Live** (dashboard):
Poll-refreshed data (`react-query` `refetchInterval`), not push-delivered. The platform's SSE/Redis push mechanism (used for Message and Shared Human Queue updates) is reserved for streams needing sub-second latency; dashboard aggregates tolerate tens of seconds of staleness and stay on polling.
_Avoid_: Real-time, Streaming (both imply push delivery)

**Conversation Traffic**:
Count of Tickets created, shown on the dashboard as a daily area chart over the selected date range, with a per-hour heatmap beneath it. Counts Ticket creation, never Message volume.
_Avoid_: Message volume, Chat volume

**Resolutions** (dashboard widget):
Count of Tickets resolved per hour, shown as an hourly heatmap under the selected date range. Not split by Resolution Reason.
_Avoid_: Closures

Ticket status on the dashboard is reported using the actual four `status` values (see Ticket, above) — `AI_HANDLING`, `ESCALATED`, `HUMAN_HANDLING`, `RESOLVED`. There is no "Pending" or "Unattended" status in this domain; "Unassigned" is not a separate status either — it's the Shared Human Queue (an `ESCALATED` Ticket with no assigned Human Agent).
