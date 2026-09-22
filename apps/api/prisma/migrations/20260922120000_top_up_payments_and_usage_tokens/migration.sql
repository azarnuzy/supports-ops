-- CreateEnum
CREATE TYPE "TopUpPaymentStatus" AS ENUM ('PENDING', 'PAID');

-- AlterTable
ALTER TABLE "CreditLedgerEntry" ADD COLUMN     "cachedInputTokens" INTEGER,
ADD COLUMN     "channel" "ChannelType",
ADD COLUMN     "inputTokens" INTEGER,
ADD COLUMN     "outputTokens" INTEGER;

-- CreateTable
CREATE TABLE "TopUpPayment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "amountIdr" INTEGER NOT NULL,
    "status" "TopUpPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "mayarPaymentId" TEXT NOT NULL,
    "checkoutUrl" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopUpPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TopUpPayment_mayarPaymentId_key" ON "TopUpPayment"("mayarPaymentId");

-- CreateIndex
CREATE INDEX "TopUpPayment_workspaceId_createdAt_idx" ON "TopUpPayment"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "TopUpPayment" ADD CONSTRAINT "TopUpPayment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill: past spend gets its Channel from the Session it was spent in, where
-- that Session still exists. Tokens were never recorded before this, so they stay null.
UPDATE "CreditLedgerEntry" AS entry
SET "channel" = channel."type"
FROM "Session" AS session
JOIN "Channel" AS channel ON channel."id" = session."channelId"
WHERE entry."sessionId" = session."id" AND entry."channel" IS NULL;
