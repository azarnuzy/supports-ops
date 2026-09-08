-- CreateEnum
CREATE TYPE "AiActivityType" AS ENUM ('TICKET_CREATED', 'CLASSIFIED', 'KNOWLEDGE_RETRIEVED', 'TOOL_CALLED', 'TOOL_FAILED', 'AI_REPLIED', 'CLARIFICATION_ASKED', 'ESCALATED', 'FOLLOW_UP_SENT', 'RESOLVED', 'CLAIMED', 'TAKEN_OVER', 'HANDOFF_SENT', 'SUMMARY_GENERATED');

-- CreateTable
CREATE TABLE "AiActivity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "eventType" "AiActivityType" NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiActivity_ticketId_createdAt_idx" ON "AiActivity"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiActivity" ADD CONSTRAINT "AiActivity_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
