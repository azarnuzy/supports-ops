/*
  Warnings:

  - Added the required column `webSessionId` to the `Message` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_memorySessionId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_ticketId_fkey";

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "webSessionId" TEXT,
ALTER COLUMN "memorySessionId" DROP NOT NULL,
ALTER COLUMN "ticketId" DROP NOT NULL;

-- Backfill: every existing Message belongs to its Ticket's Web Session
UPDATE "Message" m
SET "webSessionId" = t."webSessionId"
FROM "Ticket" t
WHERE m."ticketId" = t."id";

ALTER TABLE "Message" ALTER COLUMN "webSessionId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Message_webSessionId_position_idx" ON "Message"("webSessionId", "position");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_memorySessionId_fkey" FOREIGN KEY ("memorySessionId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_webSessionId_fkey" FOREIGN KEY ("webSessionId") REFERENCES "WebSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
