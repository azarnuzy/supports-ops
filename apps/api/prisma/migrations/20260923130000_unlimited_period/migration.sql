-- CreateTable
CREATE TABLE "UnlimitedPeriod" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endAt" TIMESTAMP(3) NOT NULL,
    "endedEarlyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnlimitedPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnlimitedPeriod_workspaceId_createdAt_idx" ON "UnlimitedPeriod"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "UnlimitedPeriod" ADD CONSTRAINT "UnlimitedPeriod_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnlimitedPeriod" ADD CONSTRAINT "UnlimitedPeriod_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
