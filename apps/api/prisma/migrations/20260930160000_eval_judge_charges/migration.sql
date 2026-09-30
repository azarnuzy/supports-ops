-- CreateEnum
CREATE TYPE "CreditChargeKind" AS ENUM ('AI_TURN', 'JUDGE');

-- AlterEnum
ALTER TYPE "EvalRunCaseStatus" ADD VALUE 'UNGRADED';
ALTER TYPE "EvalRunCaseStatus" ADD VALUE 'INVALID';

-- AlterTable
ALTER TABLE "CreditLedgerEntry" ADD COLUMN     "chargeKind" "CreditChargeKind",
ADD COLUMN     "judgeModel" TEXT,
ADD COLUMN     "evalCaseKey" TEXT;

-- AlterTable
ALTER TABLE "EvalRun" ADD COLUMN     "estimatedJudgeCredits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "estimatedJudgeCreditsMin" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "EvalRunCase" ADD COLUMN     "evaluatorHealth" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "judgeCalls" INTEGER NOT NULL DEFAULT 0;
