CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Workspace" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "User" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "User" ADD COLUMN "isOrganizationAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Keep each existing Workspace and its data in place; its ID seeds a distinct Organization.
INSERT INTO "Organization" ("id", "name", "createdAt", "updatedAt")
SELECT "id", "name", "createdAt", CURRENT_TIMESTAMP FROM "Workspace";

UPDATE "Workspace" SET "organizationId" = "id";
UPDATE "User" SET "organizationId" = "workspaceId", "isOrganizationAdmin" = ("role" = 'ADMIN');

CREATE INDEX "Workspace_organizationId_idx" ON "Workspace"("organizationId");
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
