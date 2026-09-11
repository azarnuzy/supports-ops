CREATE TABLE "WhatsAppConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "businessAccountId" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "accessTokenLastFour" TEXT NOT NULL,
    "appSecretEncrypted" TEXT NOT NULL,
    "verifyToken" TEXT NOT NULL,
    "displayPhoneNumber" TEXT NOT NULL,
    "verifiedName" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "webhookVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppConfig_channelId_key" ON "WhatsAppConfig"("channelId");
CREATE UNIQUE INDEX "WhatsAppConfig_phoneNumberId_key" ON "WhatsAppConfig"("phoneNumberId");
CREATE UNIQUE INDEX "WhatsAppConfig_verifyToken_key" ON "WhatsAppConfig"("verifyToken");
CREATE UNIQUE INDEX "WhatsAppConfig_workspaceId_channelId_key" ON "WhatsAppConfig"("workspaceId", "channelId");
CREATE INDEX "WhatsAppConfig_workspaceId_idx" ON "WhatsAppConfig"("workspaceId");

ALTER TABLE "WhatsAppConfig" ADD CONSTRAINT "WhatsAppConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WhatsAppConfig" ADD CONSTRAINT "WhatsAppConfig_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
