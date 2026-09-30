-- AlterTable
ALTER TABLE "EvalRunEvidence" ALTER COLUMN "expiresAt" SET DEFAULT (now() + interval '7 days');
