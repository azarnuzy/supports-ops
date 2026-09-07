CREATE TYPE "TicketStatus" AS ENUM ('AI_HANDLING', 'ESCALATED', 'HUMAN_HANDLING', 'RESOLVED');
CREATE TYPE "TicketCategory" AS ENUM ('ACCOUNT', 'BILLING', 'SUBSCRIPTION', 'TECHNICAL', 'GENERAL');
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');
CREATE TYPE "MessageSenderType" AS ENUM ('CUSTOMER', 'AI_AGENT', 'HUMAN_AGENT', 'SYSTEM');
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "Ticket" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "channelId" TEXT NOT NULL, "webSessionId" TEXT NOT NULL, "customerIdentityId" TEXT NOT NULL, "title" TEXT NOT NULL,
  "category" "TicketCategory" NOT NULL DEFAULT 'GENERAL', "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL', "status" "TicketStatus" NOT NULL DEFAULT 'AI_HANDLING', "messageSeq" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Conversation" (
  "id" TEXT NOT NULL, "scopeKey" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "userId" TEXT NOT NULL, "metadata" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "workspaceId" TEXT NOT NULL, "ticketId" TEXT NOT NULL, CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Message" (
  "id" TEXT NOT NULL, "memorySessionId" TEXT NOT NULL, "runId" TEXT NOT NULL, "turn" INTEGER NOT NULL, "position" INTEGER NOT NULL, "role" TEXT NOT NULL, "message" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "workspaceId" TEXT NOT NULL, "ticketId" TEXT NOT NULL, "senderType" "MessageSenderType" NOT NULL,
  "senderUserId" TEXT, "content" TEXT NOT NULL, "externalMessageId" TEXT NOT NULL, "deliveryStatus" "MessageDeliveryStatus" NOT NULL DEFAULT 'SENT',
  "deliveryAttempts" INTEGER NOT NULL DEFAULT 0, "deletedAt" TIMESTAMP(3), "deletedBy" TEXT, CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Ticket_webSessionId_key" ON "Ticket"("webSessionId");
CREATE INDEX "Ticket_workspaceId_status_createdAt_idx" ON "Ticket"("workspaceId", "status", "createdAt");
CREATE INDEX "Ticket_workspaceId_customerIdentityId_idx" ON "Ticket"("workspaceId", "customerIdentityId");
CREATE UNIQUE INDEX "Conversation_scopeKey_key" ON "Conversation"("scopeKey");
CREATE UNIQUE INDEX "Conversation_ticketId_key" ON "Conversation"("ticketId");
CREATE UNIQUE INDEX "Message_memorySessionId_position_key" ON "Message"("memorySessionId", "position");
CREATE UNIQUE INDEX "Message_workspaceId_externalMessageId_key" ON "Message"("workspaceId", "externalMessageId");
CREATE INDEX "Message_ticketId_position_idx" ON "Message"("ticketId", "position");
CREATE INDEX "Message_runId_idx" ON "Message"("runId");
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_webSessionId_fkey" FOREIGN KEY ("webSessionId") REFERENCES "WebSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_customerIdentityId_fkey" FOREIGN KEY ("customerIdentityId") REFERENCES "CustomerIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_memorySessionId_fkey" FOREIGN KEY ("memorySessionId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
