-- CreateEnum
CREATE TYPE "EscalationSummaryStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "Ticket"
  ADD COLUMN "escalationSummary" TEXT,
  ADD COLUMN "escalationSummaryStatus" "EscalationSummaryStatus" NOT NULL DEFAULT 'PENDING';
