-- CreateEnum
CREATE TYPE "CreditLedgerEntryType" AS ENUM ('TRIAL_GRANT', 'TOP_UP', 'SPEND');

-- CreateTable
CREATE TABLE "CreditLedgerEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "CreditLedgerEntryType" NOT NULL,
    "credits" INTEGER NOT NULL,
    "note" TEXT,
    "aiAgentId" TEXT,
    "agentModel" TEXT,
    "modelRate" INTEGER,
    "providerCostUsd" DOUBLE PRECISION,
    "sessionId" TEXT,
    "ticketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_workspaceId_createdAt_idx" ON "CreditLedgerEntry"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every existing Workspace gets the same 500-Credit Trial Grant new
-- Workspaces receive at registration, so this deploy never causes instant
-- Credit Exhaustion.
INSERT INTO "CreditLedgerEntry" ("id", "workspaceId", "type", "credits", "note")
SELECT gen_random_uuid()::text, "id", 'TRIAL_GRANT'::"CreditLedgerEntryType", 500, 'Trial Grant (backfill)'
FROM "Workspace";
