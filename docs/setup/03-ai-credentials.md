# AI credentials

The model gateway is [OpenRouter](https://openrouter.ai). One API key covers completions (classification, replies, Suggested Reply, Escalation Summary) and embeddings (Knowledge Source publishing, retrieval) — see [docs/planning/spike-anvia.md](../planning/spike-anvia.md), finding 6.

Create an OpenRouter account, add a payment method, then generate a key at [openrouter.ai/keys](https://openrouter.ai/keys). Set it as `OPENROUTER_API_KEY` in `.env.local` (development) or `.env` (root Docker Compose production).

`EMBEDDING_MODEL` defaults to `openai/text-embedding-3-small` (1536 dimensions) — OpenRouter's provider-prefixed form, not the bare OpenAI model id. `LLM_MODEL_FAST` defaults to `openai/gpt-4.1-nano` and is the fast model tier — classification, title, category, priority, language (see [tech-stack.md](../planning/tech-stack.md)). `LLM_MODEL_MAIN` defaults to `openai/gpt-4o-mini` and is the reply tier; `LLM_MAIN_REASONING_EFFORT` and `LLM_MAIN_MAX_OUTPUT_TOKENS` tune it and may be left empty to use provider defaults (an empty string means unset, not zero).

Completions can move off OpenRouter: `COMPLETION_GATEWAY_BASE_URL` (default `https://openrouter.ai/api/v1`) points them at any OpenAI-compatible gateway, and `COMPLETION_GATEWAY_API_KEY` is the key for it. Leave both empty and completions fall back to `OPENROUTER_API_KEY` on OpenRouter. Embeddings stay on OpenRouter by design: the vector store holds Chunks embedded by `EMBEDDING_MODEL`, so changing that provider would invalidate every stored Chunk and force a full re-ingest. Both `apps/api` and `apps/worker` read these.

Running the eval suite additionally needs `EVAL_WORKSPACE_ID` (the live Workspace Cases run against) and, optionally, `EVAL_JUDGE_MODEL` — see [docs/testing/ai-agent-eval-cases.md](../testing/ai-agent-eval-cases.md).

Without a key, Knowledge Source publishing fails immediately (the source moves to `FAILED` with a clear reason), the retrieval test screen returns a 503, and a first Web Session message that would otherwise create a Ticket returns a 503 instead of a confusing empty result.

## The `vector` extension

Chunk embeddings are stored in Postgres via pgvector — see [ADR-0003](../adr/0003-pgvector-over-qdrant.md). Local development and production both run `pgvector/pgvector:pg16` (not the bare `postgres:16-alpine` image) so `CREATE EXTENSION vector` in the first Knowledge migration succeeds. If an existing local Postgres container predates this, recreate it: `docker compose -f docker-compose.dev.yaml down && docker compose -f docker-compose.dev.yaml up -d` (the named volume, and its data, are unaffected by an image change).
