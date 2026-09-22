# Agent Model chosen per AI Agent from a code-defined Model Catalog

An Admin chooses each AI Agent's Agent Model from the Model Catalog: a short list defined in code, where every entry carries its Model Rate and has passed the Eval Suites and a `pnpm cost:measure` run. The Agent Model drives everything the AI Agent generates for that Workspace — replies, the Tool loop, Follow-Ups, Escalation Summaries, and Suggested Replies. Classification and embedding models stay platform configuration that no Admin sees. The catalog starts with `openai/gpt-5.6-luna` as its only entry and the default.

## Considered Options

- **Any OpenRouter model ID, typed freely.** Rejected: many models handle Tool calls or structured decisions badly, and a Model Rate cannot be set for a model nobody measured.
- **A catalog stored in the database.** Rejected: only SupportOps changes it, and every change already needs an eval and cost run followed by a deploy. A table would add an admin surface nobody uses.
- **Letting Admins choose the embedding model as well.** Rejected: every stored Chunk is embedded by one model, so changing it forces a full re-ingest (ADR-0010).

## Consequences

- `LLM_MODEL_MAIN` no longer exists. The main model comes from the AI Agent. `LLM_MODEL_FAST` and `EMBEDDING_MODEL` stay in the environment.
- A model removed from the catalog drops every AI Agent that used it back to the default, and their Admins are told. Changing an Agent Model applies from the next AI Turn, including in Sessions already running.
