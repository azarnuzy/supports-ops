# SupportOps

An AI-first, multi-tenant customer support platform. An AI Agent handles incoming customer conversations first and escalates to a Human Agent when it cannot safely resolve them. The AI reasoning layer and the message transport layer are deliberately separate concepts, so new channels can be added without touching support logic.

## Language

### Workspace and people

**Workspace**:
One organization's isolated tenant. Every piece of data in the platform belongs to exactly one Workspace, and nothing is ever visible across them. A user belongs to exactly one Workspace.
_Avoid_: Tenant, Organization, Team, Account

**Admin**:
The Workspace role that configures the platform — creates Human Agents, configures the Web Widget, manages Knowledge Sources, tunes AI settings — and can see and act on every Ticket in the Workspace.
_Avoid_: Owner, Manager, Supervisor

**Human Agent**:
The Workspace role that handles Tickets escalated away from the AI Agent. Sees the Shared Human Queue, its own assigned Tickets, and the Tickets it previously resolved — never the whole Workspace.
_Avoid_: Operator, Support Rep, Staff. Never plain "Agent" — that word is ambiguous in this product

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
The specific, recorded condition that triggered an Escalation — low knowledge confidence, an explicit request for a human, a failed Business Tool, and so on. Always one of a fixed set, never free text.
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
The context-aware message the AI Agent sends after a period of Customer silence, asking whether its answer worked. Only ever exists while the AI Agent owns the Ticket; humans never get one.
_Avoid_: Reminder, Nudge, Check-in

**Auto-Resolution**:
A Ticket ending because the Customer never replied to a Follow-Up. Counted apart from a confirmed Resolution so AI effectiveness is never overstated.
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
One fixed input paired with what a correct AI Agent response looks like, belonging to a category that names the product requirement it defends — grounding, visibility safety, escalation, classification, and so on.
_Avoid_: Test, Fixture, Example

**Eval Suite**:
A category's Eval Cases run together against the AI Agent. Always contains negative controls — cases that must fail — so a broken evaluator cannot make everything appear to pass.
_Avoid_: Test suite, Benchmark

**Judge**:
A separate model asked to score an AI Agent response against an Eval Case where no deterministic check can. Used only where a requirement genuinely needs it, because judging costs money and its scores vary between runs.
_Avoid_: Grader, Evaluator, Critic

### Dashboard and reporting

**Live** (dashboard):
Poll-refreshed data (`react-query` `refetchInterval`), not push-delivered. The platform's SSE/Redis push mechanism (used for Message and Shared Human Queue updates) is reserved for streams needing sub-second latency; dashboard aggregates tolerate tens of seconds of staleness and stay on polling.
_Avoid_: Real-time, Streaming (both imply push delivery)

**Conversation Traffic**:
Count of Tickets created per hour, shown as a 7-day hourly heatmap. Counts Ticket creation, never Message volume.
_Avoid_: Message volume, Chat volume

**Resolutions** (dashboard widget):
Count of Tickets resolved per hour, shown as a 7-day hourly heatmap. Not split by Resolution Reason.
_Avoid_: Closures

Ticket status on the dashboard is reported using the actual four `status` values (see Ticket, above) — `AI_HANDLING`, `ESCALATED`, `HUMAN_HANDLING`, `RESOLVED`. There is no "Pending" or "Unattended" status in this domain; "Unassigned" is not a separate status either — it's the Shared Human Queue (an `ESCALATED` Ticket with no assigned Human Agent).
