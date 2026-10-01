ALTER TABLE "EvalRunCase" ADD COLUMN "result" JSONB NOT NULL DEFAULT '{}';
CREATE INDEX "Message_workspaceId_createdAt_id_idx" ON "Message" ("workspaceId", "createdAt", "id");
