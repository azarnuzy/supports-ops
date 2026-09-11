# WhatsApp reasoning runs in the worker, and the AI Agent call site leaves the widget module

The WhatsApp webhook does one thing: verify, persist the inbound Message, schedule a job, return 200. All reasoning and all outbound delivery happen in `apps/worker`. The AI Agent entry point moves out of `apps/api/src/modules/widget/services.ts` into `packages/ai-agent` so both the API (Web Widget) and the worker (WhatsApp) call the same code.

On the Web Widget the AI Agent runs inside the request because a browser is holding an SSE connection and waiting for tokens. WhatsApp has no waiting client. Meta expects a prompt 200 and redelivers if it does not get one, and inbound messages are debounced for a few seconds before a turn begins — so generation cannot happen inside the webhook request even in principle.

Running it in the API after responding, as detached async work, was rejected: it puts a multi-second model call plus outbound delivery in a process that is killed on every deploy, with no retry and no record that the work was lost. The worker and BullMQ exist for precisely this, and the retry semantics are already in use for follow-up and attachment processing.

## Consequences

**The AI Agent call site was never really widget code.** It reached its current location because the Web Widget was the only Channel. Extracting it is a refactor forced by WhatsApp but owed regardless, and it is what makes "the flow behind a new Channel is the same flow" true in code rather than only in the diagram.

**Rapid consecutive messages are one turn, not several.** People split a sentence across several WhatsApp bubbles. Each inbound message reschedules a single delayed job keyed by Session, so the turn begins once the Customer stops typing. Replying per-bubble would answer an incomplete sentence — and on WhatsApp every reply is a push notification on someone's phone.

**Permanent delivery failures do not retry and do not escalate.** A revoked token or a closed Customer Service Window will never succeed on attempt five, so it fails immediately and records why. It does not raise an Escalation, because a human already owns the Ticket in the case that matters and escalating an already-human Ticket means nothing in this domain. What it must do is be visible: a Human Agent who believes they answered a Customer who received nothing is the worst outcome available here. Transient failures — 429, 5xx, network — retry with exponential backoff.
