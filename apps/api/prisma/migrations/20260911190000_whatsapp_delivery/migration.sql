ALTER TYPE "MessageDeliveryStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "MessageDeliveryStatus" ADD VALUE 'READ';

ALTER TABLE "WhatsAppConfig" ADD COLUMN "accessTokenFailedAt" TIMESTAMP(3);
