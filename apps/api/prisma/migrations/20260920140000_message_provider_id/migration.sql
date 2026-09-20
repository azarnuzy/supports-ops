-- AlterTable
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Message_workspaceId_providerMessageId_idx" ON "Message"("workspaceId", "providerMessageId");

-- Outbound WhatsApp Messages used to have Meta's id written over their
-- idempotency key. Move it across so their delivery callbacks keep resolving;
-- the overwritten idempotency key itself is gone and cannot be recovered.
UPDATE "Message"
SET "providerMessageId" = "externalMessageId"
WHERE "providerMessageId" IS NULL
  AND "externalMessageId" LIKE 'wamid.%'
  AND "senderType" <> 'CUSTOMER';
