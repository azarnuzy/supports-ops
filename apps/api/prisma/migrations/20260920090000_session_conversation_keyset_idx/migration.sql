-- CreateIndex
CREATE INDEX IF NOT EXISTS "Session_workspaceId_createdAt_id_idx" ON "Session"("workspaceId", "createdAt", "id");
