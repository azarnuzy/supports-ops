-- Memberships already contain each user's original Workspace and role.
ALTER TABLE "User" DROP CONSTRAINT "User_workspaceId_fkey";
DROP INDEX "User_workspaceId_idx";
ALTER TABLE "User" DROP COLUMN "workspaceId";

-- Every existing Workspace and User was backfilled in the Organization migration.
ALTER TABLE "User" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Workspace" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "User" DROP CONSTRAINT "User_organizationId_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Workspace" DROP CONSTRAINT "Workspace_organizationId_fkey";
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TopUpPayment" ADD COLUMN "organizationId" TEXT;
UPDATE "TopUpPayment" AS payment SET "organizationId" = workspace."organizationId"
FROM "Workspace" AS workspace WHERE payment."workspaceId" = workspace."id";
ALTER TABLE "TopUpPayment" ALTER COLUMN "organizationId" SET NOT NULL;
CREATE INDEX "TopUpPayment_organizationId_createdAt_idx" ON "TopUpPayment"("organizationId", "createdAt");
ALTER TABLE "TopUpPayment" ADD CONSTRAINT "TopUpPayment_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UnlimitedPeriod" ADD COLUMN "organizationId" TEXT;
UPDATE "UnlimitedPeriod" AS period SET "organizationId" = workspace."organizationId"
FROM "Workspace" AS workspace WHERE period."workspaceId" = workspace."id";
ALTER TABLE "UnlimitedPeriod" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "UnlimitedPeriod" DROP CONSTRAINT "UnlimitedPeriod_workspaceId_fkey";
DROP INDEX "UnlimitedPeriod_workspaceId_createdAt_idx";
ALTER TABLE "UnlimitedPeriod" DROP COLUMN "workspaceId";
CREATE INDEX "UnlimitedPeriod_organizationId_createdAt_idx" ON "UnlimitedPeriod"("organizationId", "createdAt");
ALTER TABLE "UnlimitedPeriod" ADD CONSTRAINT "UnlimitedPeriod_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
