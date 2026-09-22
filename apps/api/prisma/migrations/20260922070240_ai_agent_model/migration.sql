-- Agent Model chosen per AI Agent from a code-defined Model Catalog
-- (ADR-0022). The default backfills every existing AI Agent.
ALTER TABLE "AiAgent"
ADD COLUMN "agentModel" TEXT NOT NULL DEFAULT 'openai/gpt-5.6-luna';
