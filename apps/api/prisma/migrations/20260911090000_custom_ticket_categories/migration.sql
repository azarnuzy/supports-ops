-- Ticket categories become per-Workspace rows instead of a fixed enum.
-- Order matters: a table named "TicketCategory" also creates a composite type of that name, so the
-- enum has to be off the columns and dropped before the table can take its name.
ALTER TABLE "Ticket" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "Ticket" ALTER COLUMN "category" TYPE TEXT USING "category"::text;
ALTER TABLE "Ticket" ALTER COLUMN "category" SET DEFAULT 'GENERAL';

ALTER TABLE "ToolPolicy" ALTER COLUMN "category" TYPE TEXT USING "category"::text;

DROP TYPE "TicketCategory";

CREATE TABLE "TicketCategory" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isFallback" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TicketCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TicketCategory_workspaceId_id_key" ON "TicketCategory"("workspaceId", "id");
CREATE UNIQUE INDEX "TicketCategory_workspaceId_key_key" ON "TicketCategory"("workspaceId", "key");

ALTER TABLE "TicketCategory" ADD CONSTRAINT "TicketCategory_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every existing Workspace keeps the five categories it already had, with GENERAL as the fallback.
INSERT INTO "TicketCategory" ("id", "workspaceId", "key", "label", "description", "isFallback", "sortOrder", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    w."id",
    seed."key",
    seed."label",
    seed."description",
    seed."isFallback",
    seed."sortOrder",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Workspace" w
CROSS JOIN (
    VALUES
        ('ACCOUNT', 'Account', 'Sign-in problems, profile changes, access, and account security.', false, 0),
        ('BILLING', 'Billing', 'Invoices, payments, refunds, and anything about money already charged.', false, 1),
        ('SUBSCRIPTION', 'Subscription', 'Plans, upgrades, downgrades, renewals, and cancellations.', false, 2),
        ('TECHNICAL', 'Technical', 'Bugs, errors, outages, and the product not behaving as expected.', false, 3),
        ('GENERAL', 'General', 'Anything that does not clearly belong to another category.', true, 4)
) AS seed("key", "label", "description", "isFallback", "sortOrder");
