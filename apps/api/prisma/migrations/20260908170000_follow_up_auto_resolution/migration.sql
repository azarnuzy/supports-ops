CREATE TYPE "ResolutionReason_new" AS ENUM ('HUMAN_RESOLVED', 'CUSTOMER_CONFIRMED', 'CUSTOMER_INACTIVE');
ALTER TABLE "Ticket" ALTER COLUMN "resolutionReason" TYPE "ResolutionReason_new" USING "resolutionReason"::text::"ResolutionReason_new";
DROP TYPE "ResolutionReason";
ALTER TYPE "ResolutionReason_new" RENAME TO "ResolutionReason";

CREATE TABLE "AiSettings" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "followUpAfterSeconds" INTEGER NOT NULL DEFAULT 900,
  "autoResolveAfterSeconds" INTEGER NOT NULL DEFAULT 3600,
  "autoResolveEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiSettings_workspaceId_key" ON "AiSettings"("workspaceId");
ALTER TABLE "AiSettings" ADD CONSTRAINT "AiSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
