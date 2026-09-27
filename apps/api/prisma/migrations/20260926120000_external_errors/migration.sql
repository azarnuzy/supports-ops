CREATE TABLE "ExternalError" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "modelId" TEXT,
    "code" TEXT,
    "httpStatus" INTEGER,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExternalError_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExternalError_createdAt_idx" ON "ExternalError"("createdAt");
CREATE INDEX "ExternalError_workspaceId_createdAt_idx" ON "ExternalError"("workspaceId", "createdAt");
CREATE INDEX "ExternalError_provider_operation_modelId_code_idx" ON "ExternalError"("provider", "operation", "modelId", "code");
ALTER TABLE "ExternalError" ADD CONSTRAINT "ExternalError_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
