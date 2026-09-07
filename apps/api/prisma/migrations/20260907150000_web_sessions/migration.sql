-- CreateEnum
CREATE TYPE "WebSessionStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateTable
CREATE TABLE "CustomerIdentity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelType" "ChannelType" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "externalCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "customerIdentityId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "status" "WebSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "WebSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerIdentity_workspaceId_channelType_email_idx" ON "CustomerIdentity"("workspaceId", "channelType", "email");
CREATE UNIQUE INDEX "WebSession_accessToken_key" ON "WebSession"("accessToken");
CREATE INDEX "WebSession_workspaceId_idx" ON "WebSession"("workspaceId");
CREATE INDEX "WebSession_channelId_idx" ON "WebSession"("channelId");
CREATE INDEX "WebSession_customerIdentityId_idx" ON "WebSession"("customerIdentityId");

-- AddForeignKey
ALTER TABLE "CustomerIdentity" ADD CONSTRAINT "CustomerIdentity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WebSession" ADD CONSTRAINT "WebSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WebSession" ADD CONSTRAINT "WebSession_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WebSession" ADD CONSTRAINT "WebSession_customerIdentityId_fkey" FOREIGN KEY ("customerIdentityId") REFERENCES "CustomerIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
