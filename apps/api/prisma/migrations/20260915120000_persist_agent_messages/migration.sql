-- Preserve the model-facing Session history, including tool calls and Tool
-- Results, separately from the Customer-visible Message transcript.
ALTER TABLE "Conversation"
ADD COLUMN "agentMessages" JSONB NOT NULL DEFAULT '[]';
