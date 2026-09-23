CREATE TYPE "OperatorActionType" AS ENUM ('TOP_UP', 'UNLIMITED_PERIOD_GRANTED', 'UNLIMITED_PERIOD_EXTENDED', 'UNLIMITED_PERIOD_ENDED');

CREATE TABLE "OperatorAction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "operatorId" TEXT NOT NULL REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "type" "OperatorActionType" NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "OperatorAction_workspaceId_createdAt_idx" ON "OperatorAction"("workspaceId", "createdAt");
CREATE INDEX "OperatorAction_createdAt_idx" ON "OperatorAction"("createdAt");
