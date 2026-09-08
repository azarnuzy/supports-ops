ALTER TABLE "Ticket" ADD COLUMN "assignedHumanAgentId" TEXT;

ALTER TABLE "Ticket"
  ADD CONSTRAINT "Ticket_assignedHumanAgentId_fkey"
  FOREIGN KEY ("assignedHumanAgentId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Ticket_workspaceId_assignedHumanAgentId_createdAt_idx"
  ON "Ticket"("workspaceId", "assignedHumanAgentId", "createdAt");
