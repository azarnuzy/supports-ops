# Anvia v1 as the AI Agent runtime

We build the AI Agent on the Anvia SDK rather than the Vercel AI SDK or a hand-rolled loop, and we target its **v1** API surface: `new Agent({ id, model, instructions, maxTurns, outputSchema })` with `generate()` / `stream()`, and `createTool({ name, description, inputSchema, execute })`.

This is worth recording because reference code in the developer's own course material uses `new AgentBuilder(id, model).instructions().memory().tools()`, and the Anvia documentation states plainly that "AgentBuilder, prompt().send(), and other builder-era APIs are not part of the v1 public surface." Anyone reading the course code first will expect the builder and should not reintroduce it.

Anvia was chosen over the alternatives because its `outputSchema` maps directly onto the decision the platform actually needs from the AI Agent — reply, escalate, or resolve, validated by Zod before any application branching — and because the surrounding packages (`@anvia/server` for streaming, `@anvia/pgvector` for retrieval, `@anvia/memory-prisma` for conversation memory, `@anvia/lens` for tracing) cover the whole surface without assembling four unrelated libraries.
