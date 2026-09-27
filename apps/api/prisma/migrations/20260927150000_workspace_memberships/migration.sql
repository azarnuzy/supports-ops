CREATE TABLE "WorkspaceMembership" (
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceMembership_pkey" PRIMARY KEY ("userId", "workspaceId")
);

CREATE INDEX "WorkspaceMembership_workspaceId_role_idx" ON "WorkspaceMembership"("workspaceId", "role");
ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "WorkspaceMembership" ("userId", "workspaceId", "role") SELECT "id", "workspaceId", "role" FROM "User" WHERE "deletedAt" IS NULL;
