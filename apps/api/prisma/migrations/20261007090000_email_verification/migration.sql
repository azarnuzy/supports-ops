ALTER TABLE "User" ADD COLUMN "verificationEmailSentAt" TIMESTAMP(3);

-- Everyone who registered before email verification existed counts as verified.
UPDATE "User" SET "emailVerified" = true;
