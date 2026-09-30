
-- CreateEnum
CREATE TYPE "EvalRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'FINISHED', 'ERROR');

-- CreateEnum
CREATE TYPE "EvalRunCaseStatus" AS ENUM ('PENDING', 'RUNNING', 'EVALUATED', 'EXECUTION_ERROR', 'UNEXECUTED');

-- CreateEnum
CREATE TYPE "EvalDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'ERROR', 'NOT_CONFIGURED');

-- CreateEnum
CREATE TYPE "EvalEvidenceTarget" AS ENUM ('CENTRAL', 'WORKSPACE');

-- AlterTable
ALTER TABLE "CreditLedgerEntry" ADD COLUMN     "evalRunId" TEXT;

-- CreateTable
CREATE TABLE "EvalRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "datasetName" TEXT NOT NULL,
    "criteria" TEXT NOT NULL DEFAULT '',
    "status" "EvalRunStatus" NOT NULL DEFAULT 'QUEUED',
    "aiAgentId" TEXT NOT NULL,
    "agentModel" TEXT NOT NULL,
    "instructionsSha256" TEXT NOT NULL,
    "embeddingModel" TEXT NOT NULL,
    "estimatedCredits" INTEGER NOT NULL,
    "creditExhausted" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "destinationBackend" "EvalBackend" NOT NULL,
    "destinationEndpoint" TEXT NOT NULL,
    "destinationDashboardUrl" TEXT NOT NULL,
    "destinationCredentialsEncrypted" TEXT NOT NULL,
    "centralDelivery" "EvalDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "workspaceDelivery" "EvalDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvalRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalRunCase" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceCaseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "caseKey" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL,
    "history" JSONB NOT NULL DEFAULT '[]',
    "clarificationCount" INTEGER NOT NULL DEFAULT 0,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "expected" TEXT NOT NULL DEFAULT '',
    "metric" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "status" "EvalRunCaseStatus" NOT NULL DEFAULT 'PENDING',
    "passed" BOOLEAN,
    "traceId" TEXT,
    "error" TEXT,
    "limitations" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "EvalRunCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalRunEvidence" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "target" "EvalEvidenceTarget" NOT NULL,
    "signal" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvalRunEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvalRun_workspaceId_createdAt_idx" ON "EvalRun"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EvalRun_workspaceId_id_key" ON "EvalRun"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "EvalRunCase_workspaceId_runId_idx" ON "EvalRunCase"("workspaceId", "runId");

-- CreateIndex
CREATE UNIQUE INDEX "EvalRunCase_runId_position_key" ON "EvalRunCase"("runId", "position");

-- CreateIndex
CREATE INDEX "EvalRunEvidence_workspaceId_runId_idx" ON "EvalRunEvidence"("workspaceId", "runId");

-- CreateIndex
CREATE UNIQUE INDEX "EvalRunEvidence_runId_target_eventId_key" ON "EvalRunEvidence"("runId", "target", "eventId");

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_evalRunId_idx" ON "CreditLedgerEntry"("evalRunId");

-- AddForeignKey
ALTER TABLE "EvalRun" ADD CONSTRAINT "EvalRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalRunCase" ADD CONSTRAINT "EvalRunCase_runId_fkey" FOREIGN KEY ("runId") REFERENCES "EvalRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalRunEvidence" ADD CONSTRAINT "EvalRunEvidence_runId_fkey" FOREIGN KEY ("runId") REFERENCES "EvalRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One active Run per Workspace, enforced by the database so concurrent starts cannot both win.
CREATE UNIQUE INDEX "EvalRun_one_active_per_workspace" ON "EvalRun"("workspaceId") WHERE "status" IN ('QUEUED', 'RUNNING');
