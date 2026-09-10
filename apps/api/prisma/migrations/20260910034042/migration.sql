-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_memorySessionId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_ticketId_fkey";

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_memorySessionId_fkey" FOREIGN KEY ("memorySessionId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
