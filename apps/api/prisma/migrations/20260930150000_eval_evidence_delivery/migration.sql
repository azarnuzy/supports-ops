-- AlterTable
ALTER TABLE "EvalRunEvidence" ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT (now() + interval '7 days'),
ADD COLUMN "failedAt" TIMESTAMP(3);
