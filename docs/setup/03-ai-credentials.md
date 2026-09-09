# AI credentials

The model gateway is [OpenRouter](https://openrouter.ai). One API key covers completions (the AI Agent's classification call, and the rest of the AI Agent once built) and embeddings (Knowledge Source publishing, retrieval) — see [docs/planning/spike-anvia.md](../planning/spike-anvia.md), finding 6.

Create an OpenRouter account, add a payment method, then generate a key at [openrouter.ai/keys](https://openrouter.ai/keys). Set it as `OPENROUTER_API_KEY` in `.env.local` (development) or `.env` (root Docker Compose production).

`EMBEDDING_MODEL` defaults to `openai/text-embedding-3-small` (1536 dimensions) — OpenRouter's provider-prefixed form, not the bare OpenAI model id. `LLM_MODEL_FAST` defaults to `openai/gpt-4.1-nano` and is the fast model tier — classification, title, category, priority, language (see [tech-stack.md](../planning/tech-stack.md)). Both `apps/api` and `apps/worker` read `OPENROUTER_API_KEY`; the base URL (`https://openrouter.ai/api/v1`) is fixed in code, not configurable per Workspace.

Without a key, Knowledge Source publishing fails immediately (the source moves to `FAILED` with a clear reason), the retrieval test screen returns a 503, and a first Web Session message that would otherwise create a Ticket returns a 503 instead of a confusing empty result.

## The `vector` extension

Chunk embeddings are stored in Postgres via pgvector — see [ADR-0003](../adr/0003-pgvector-over-qdrant.md). Local development and production both run `pgvector/pgvector:pg16` (not the bare `postgres:16-alpine` image) so `CREATE EXTENSION vector` in the first Knowledge migration succeeds. If an existing local Postgres container predates this, recreate it: `docker compose -f docker-compose.dev.yaml down && docker compose -f docker-compose.dev.yaml up -d` (the named volume, and its data, are unaffected by an image change).
