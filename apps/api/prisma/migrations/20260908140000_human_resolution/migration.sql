-- CreateEnum
CREATE TYPE "ResolutionReason" AS ENUM ('HUMAN_RESOLVED');

-- AlterTable
ALTER TABLE "Ticket"
  ADD COLUMN "resolvedBy" TEXT,
  ADD COLUMN "resolutionReason" "ResolutionReason",
  ADD COLUMN "resolvedAt" TIMESTAMP(3);
