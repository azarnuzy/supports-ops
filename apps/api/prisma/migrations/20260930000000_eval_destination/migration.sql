CREATE TYPE "EvalBackend" AS ENUM ('LENS', 'LANGFUSE');

CREATE TABLE "EvalDestination" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "backend" "EvalBackend" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "dashboardUrl" TEXT NOT NULL,
    "credentialsEncrypted" TEXT NOT NULL,
    "publicKeyLastFour" TEXT NOT NULL,
    "secretKeyLastFour" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvalDestination_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EvalDestination_workspaceId_key" ON "EvalDestination"("workspaceId");

ALTER TABLE "EvalDestination" ADD CONSTRAINT "EvalDestination_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
