# Agent Memory belongs to the Session, not the Ticket

The `Conversation` model — the AI Agent's memory store — hangs off a `Session` and is created when the Session opens. A Ticket, when one is eventually created, points at the Session that already holds the memory. Message ordering positions come from a counter on the `Session`.

Until now `Conversation.ticketId` was required and unique, which made agent memory literally impossible before a Ticket existed. Because a Ticket is deliberately created late — only once a Customer says something that qualifies as support — every Session began with an exchange the AI Agent could not see. `persistSessionExchange` stored those turns in the message table with `ticketId: null`, `memorySessionId: null`, and *negative* positions so they would sort ahead of the Ticket's own sequence. They were visible to a Human Agent reading the transcript and invisible to the AI Agent that produced half of them.

The damage was not limited to memory. Classification ran on the incoming message alone, so "hello" → "Hi, how can I help?" → "yes, about the invoice" was classified as if the third message were the first thing ever said, and the Ticket it created was titled accordingly.

The alternative was to keep memory on the Ticket and backfill `memorySessionId` when the Ticket is created. It was rejected because it repairs memory only after the fact and leaves classification — the step that decides whether a Ticket is created at all, and what it is called — still running blind. Injecting the earlier turns into the prompt without persisting them was rejected for the reason ADR-0004 gives: it stores the same conversation twice, in two places that can disagree.

A Session is the thing a Customer experiences as "this conversation". A Ticket is a support case that may or may not come out of it. Memory follows the conversation.

## Consequences

**The message sequence moves from Ticket to Session, and the negative-position hack is deleted.** This revises the consequence recorded in ADR-0004, which assigned positions from a per-Ticket sequence. That sequence was the sole reason pre-Ticket turns needed negative positions; with one monotonic counter per Session the whole special case disappears and the transcript is naturally ordered. This is a net deletion of code.

**A Session with no Ticket still costs a row and still has to be cleaned up.** Abandoned Sessions now accumulate memory rows rather than nothing. This is the price of the fix and it is paid knowingly: the platform is closing Sessions on a timer anyway, so the reaping mechanism already exists.

**Retrieval by Ticket must not be the only read path.** Anything that loads "the conversation so far" reads it by Session. Reading by Ticket silently drops the opening exchange again, which is the exact bug this ADR exists to remove.
