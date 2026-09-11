# The Message store extends Anvia's Prisma memory rather than sitting beside it

Messages live in one table, built by extending `@anvia/memory-prisma`'s models with the columns this product needs — Workspace, Ticket, sender type, delivery state, an idempotency key, and a soft-delete marker — and by wrapping `PrismaMemoryStore` so its `append()` runs inside our own transaction.

The obvious alternative is to let Anvia keep its own session tables and maintain a separate application `Message` table beside them. We rejected it because the conversation would then be stored twice and could diverge, and because the divergence would land exactly where it hurts: after Escalation the AI Agent stops running entirely while the Customer keeps writing, so the majority of a Ticket's messages arrive with no agent run to record them.

Extending the store keeps one ordering, makes idempotency a real unique constraint rather than an application check, and makes soft-delete immediately effective for retrieval. The cost is a dependency on `PrismaMemoryStore` being cleanly subclassable. If it is not, the fallback is Anvia's documented `MemoryStore` interface — `load`, `append`, `clear` — implemented directly over the same table, which reaches the same end state.

## Consequences

Message ordering positions are assigned from a single sequence, claimed inside the writing transaction, because both the agent runtime and the Channel layer insert into the same table. That sequence was originally per-Ticket; [ADR-0017](0017-agent-memory-belongs-to-the-session.md) moves it to the Session, which is what makes the turns before a Ticket part of the same ordering.
