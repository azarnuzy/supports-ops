ALTER TABLE "CustomerIdentity" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "CustomerIdentity" ADD COLUMN "phoneE164" TEXT;

CREATE INDEX "CustomerIdentity_workspaceId_channelType_phoneE164_idx"
ON "CustomerIdentity"("workspaceId", "channelType", "phoneE164");

ALTER TABLE "Message" ADD COLUMN "deliveryFailureReason" TEXT;
