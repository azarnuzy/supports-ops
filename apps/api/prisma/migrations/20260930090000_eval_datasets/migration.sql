CREATE TABLE "EvalDataset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "criteria" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvalDataset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvalCase" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "caseKey" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL,
    "history" JSONB NOT NULL DEFAULT '[]',
    "clarificationCount" INTEGER NOT NULL DEFAULT 0,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "expected" TEXT NOT NULL DEFAULT '',
    "metric" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvalCase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EvalDataset_workspaceId_createdAt_idx" ON "EvalDataset"("workspaceId", "createdAt");

CREATE UNIQUE INDEX "EvalDataset_workspaceId_id_key" ON "EvalDataset"("workspaceId", "id");

CREATE INDEX "EvalCase_workspaceId_datasetId_idx" ON "EvalCase"("workspaceId", "datasetId");

CREATE UNIQUE INDEX "EvalCase_workspaceId_id_key" ON "EvalCase"("workspaceId", "id");

CREATE UNIQUE INDEX "EvalCase_datasetId_caseKey_key" ON "EvalCase"("datasetId", "caseKey");

ALTER TABLE "EvalDataset" ADD CONSTRAINT "EvalDataset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EvalCase" ADD CONSTRAINT "EvalCase_workspaceId_datasetId_fkey" FOREIGN KEY ("workspaceId", "datasetId") REFERENCES "EvalDataset"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
