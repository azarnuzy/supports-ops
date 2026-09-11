-- The Session becomes the home of Agent Memory and of Message ordering, and
-- stops being Web-specific. One migration, per ADR-0017, revising the
-- per-Ticket ordering consequence recorded in ADR-0004.

-- Better Auth's sign-in session moves out of the way: "Session" is the domain's
-- word for a Customer's conversation on a Channel.
ALTER TABLE "Session" RENAME TO "AuthSession";
ALTER TABLE "AuthSession" RENAME CONSTRAINT "Session_pkey" TO "AuthSession_pkey";
ALTER TABLE "AuthSession" RENAME CONSTRAINT "Session_userId_fkey" TO "AuthSession_userId_fkey";
ALTER INDEX "Session_token_key" RENAME TO "AuthSession_token_key";

-- The Web Session is just the Session.
ALTER TYPE "WebSessionStatus" RENAME TO "SessionStatus";
ALTER TABLE "WebSession" RENAME TO "Session";
ALTER TABLE "Session" RENAME CONSTRAINT "WebSession_pkey" TO "Session_pkey";
ALTER TABLE "Session" RENAME CONSTRAINT "WebSession_workspaceId_fkey" TO "Session_workspaceId_fkey";
ALTER TABLE "Session" RENAME CONSTRAINT "WebSession_channelId_fkey" TO "Session_channelId_fkey";
ALTER TABLE "Session" RENAME CONSTRAINT "WebSession_customerIdentityId_fkey" TO "Session_customerIdentityId_fkey";
ALTER INDEX "WebSession_accessToken_key" RENAME TO "Session_accessToken_key";
ALTER INDEX "WebSession_workspaceId_idx" RENAME TO "Session_workspaceId_idx";
ALTER INDEX "WebSession_channelId_idx" RENAME TO "Session_channelId_idx";
ALTER INDEX "WebSession_customerIdentityId_idx" RENAME TO "Session_customerIdentityId_idx";

-- A Channel that identifies its Customer by their own address carries no token.
ALTER TABLE "Session" ALTER COLUMN "accessToken" DROP NOT NULL;

-- One monotonic Message counter per Session, plus the Customer's own clock.
ALTER TABLE "Session"
  ADD COLUMN "messageSeq" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "customerLastMessageAt" TIMESTAMP(3);

ALTER TABLE "Ticket" RENAME COLUMN "webSessionId" TO "sessionId";
ALTER TABLE "Ticket" RENAME CONSTRAINT "Ticket_webSessionId_fkey" TO "Ticket_sessionId_fkey";
ALTER INDEX "Ticket_webSessionId_key" RENAME TO "Ticket_sessionId_key";

ALTER TABLE "Message" RENAME COLUMN "webSessionId" TO "sessionId";
ALTER TABLE "Message" RENAME CONSTRAINT "Message_webSessionId_fkey" TO "Message_sessionId_fkey";
DROP INDEX "Message_webSessionId_position_idx";

-- Agent Memory hangs off the Session: Anvia's memory scope and our foreign key
-- become the same identifier.
ALTER TABLE "Message" DROP CONSTRAINT "Message_memorySessionId_fkey";
DROP INDEX "Message_memorySessionId_position_key";
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_ticketId_fkey";
DROP INDEX "Conversation_ticketId_key";

UPDATE "Conversation" c
SET "sessionId" = t."sessionId", "scopeKey" = 'session:' || t."sessionId"
FROM "Ticket" t
WHERE c."ticketId" = t."id";

ALTER TABLE "Conversation" DROP COLUMN "ticketId";

-- Every Session that never produced a Ticket gets the memory it should have had
-- from the moment it opened.
INSERT INTO "Conversation" ("id", "scopeKey", "sessionId", "userId", "metadata", "createdAt", "updatedAt", "workspaceId")
SELECT gen_random_uuid()::text, 'session:' || s."id", s."id", s."customerIdentityId", '{}'::jsonb, s."createdAt", now(), s."workspaceId"
FROM "Session" s
WHERE NOT EXISTS (SELECT 1 FROM "Conversation" c WHERE c."sessionId" = s."id");

CREATE UNIQUE INDEX "Conversation_sessionId_key" ON "Conversation"("sessionId");
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Positions are renumbered from 1 per Session, in the order the Messages were
-- written: the negative positions that carried pre-Ticket turns are gone, and
-- so is the gap where a Ticket used to begin.
WITH ordered AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "sessionId" ORDER BY "position", "createdAt", "id"
  ) AS "position"
  FROM "Message"
)
UPDATE "Message" m SET "position" = o."position" FROM ordered o WHERE m."id" = o."id";

UPDATE "Message" m SET "memorySessionId" = c."id" FROM "Conversation" c WHERE c."sessionId" = m."sessionId";
ALTER TABLE "Message" ALTER COLUMN "memorySessionId" SET NOT NULL;

UPDATE "Session" s
SET "messageSeq" = COALESCE((SELECT MAX(m."position") FROM "Message" m WHERE m."sessionId" = s."id"), 0),
    "customerLastMessageAt" = (
      SELECT MAX(m."createdAt") FROM "Message" m
      WHERE m."sessionId" = s."id" AND m."senderType" = 'CUSTOMER'
    );

ALTER TABLE "Message" ADD CONSTRAINT "Message_memorySessionId_fkey" FOREIGN KEY ("memorySessionId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Message_sessionId_position_key" ON "Message"("sessionId", "position");
CREATE INDEX "Message_memorySessionId_position_idx" ON "Message"("memorySessionId", "position");

ALTER TABLE "Ticket" DROP COLUMN "messageSeq";

-- A Customer Identity is keyed by the one value its Channel can always produce.
ALTER TABLE "CustomerIdentity" ADD COLUMN "canonicalId" TEXT;
UPDATE "CustomerIdentity" SET "canonicalId" = lower("email");

-- Duplicates predate the constraint: the oldest row per key survives and
-- everything that referenced the others is repointed at it.
CREATE TEMP TABLE "_merged_identity" AS
WITH survivor AS (
  SELECT DISTINCT ON ("workspaceId", "channelType", "canonicalId") "id", "workspaceId", "channelType", "canonicalId"
  FROM "CustomerIdentity"
  ORDER BY "workspaceId", "channelType", "canonicalId", "createdAt", "id"
)
SELECT c."id" AS "duplicateId", s."id" AS "survivorId"
FROM "CustomerIdentity" c
JOIN survivor s
  ON s."workspaceId" = c."workspaceId"
 AND s."channelType" = c."channelType"
 AND s."canonicalId" = c."canonicalId"
WHERE c."id" <> s."id";

UPDATE "Session" x SET "customerIdentityId" = m."survivorId" FROM "_merged_identity" m WHERE x."customerIdentityId" = m."duplicateId";
UPDATE "Ticket" x SET "customerIdentityId" = m."survivorId" FROM "_merged_identity" m WHERE x."customerIdentityId" = m."duplicateId";
DELETE FROM "CustomerIdentity" c USING "_merged_identity" m WHERE c."id" = m."duplicateId";
DROP TABLE "_merged_identity";

ALTER TABLE "CustomerIdentity" ALTER COLUMN "canonicalId" SET NOT NULL;
CREATE UNIQUE INDEX "CustomerIdentity_workspaceId_channelType_canonicalId_key" ON "CustomerIdentity"("workspaceId", "channelType", "canonicalId");
