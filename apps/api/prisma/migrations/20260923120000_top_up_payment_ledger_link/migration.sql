ALTER TABLE "TopUpPayment" ADD COLUMN "ledgerEntryId" TEXT;

UPDATE "TopUpPayment" AS payment
SET "ledgerEntryId" = ledger."id"
FROM "CreditLedgerEntry" AS ledger
WHERE payment."status" = 'PAID'
  AND ledger."workspaceId" = payment."workspaceId"
  AND ledger."type" = 'TOP_UP'
  AND ledger."note" = 'Top-Up Pack ' || payment."packId" || ' (Mayar ' || payment."mayarPaymentId" || ')';

CREATE UNIQUE INDEX "TopUpPayment_ledgerEntryId_key" ON "TopUpPayment"("ledgerEntryId");
ALTER TABLE "TopUpPayment" ADD CONSTRAINT "TopUpPayment_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "CreditLedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
