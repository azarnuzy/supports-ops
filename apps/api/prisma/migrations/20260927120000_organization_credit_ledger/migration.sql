ALTER TABLE "CreditLedgerEntry" ADD COLUMN "organizationId" TEXT;

UPDATE "CreditLedgerEntry" AS ledger
SET "organizationId" = workspace."organizationId"
FROM "Workspace" AS workspace
WHERE ledger."workspaceId" = workspace."id";

ALTER TABLE "CreditLedgerEntry" ALTER COLUMN "organizationId" SET NOT NULL;
CREATE INDEX "CreditLedgerEntry_organizationId_createdAt_idx" ON "CreditLedgerEntry"("organizationId", "createdAt");
CREATE UNIQUE INDEX "CreditLedgerEntry_one_trial_grant_per_organization_idx"
  ON "CreditLedgerEntry"("organizationId") WHERE "type" = 'TRIAL_GRANT';
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
