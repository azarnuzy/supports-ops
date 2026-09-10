CREATE TYPE "ToolOrigin" AS ENUM ('BUILT_IN', 'HTTP', 'MCP');
CREATE TYPE "ToolRisk" AS ENUM ('READ_ONLY', 'MUTATING');
CREATE TYPE "HttpMethod" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');
CREATE TYPE "McpToolDiscoveryStatus" AS ENUM ('CURRENT', 'CHANGED', 'UNAVAILABLE');

ALTER TABLE "AiAgent"
  ADD COLUMN "instructions" TEXT,
  ADD COLUMN "handoffMessage" TEXT,
  ADD COLUMN "resolutionMessage" TEXT;

ALTER TABLE "Ticket" ADD COLUMN "aiAgentId" TEXT;
UPDATE "Ticket" AS ticket
SET "aiAgentId" = channel."aiAgentId"
FROM "Channel" AS channel
WHERE channel."id" = ticket."channelId";
ALTER TABLE "Ticket" ALTER COLUMN "aiAgentId" SET NOT NULL;

CREATE UNIQUE INDEX "AiAgent_workspaceId_id_key" ON "AiAgent"("workspaceId", "id");
CREATE UNIQUE INDEX "Channel_workspaceId_id_key" ON "Channel"("workspaceId", "id");
CREATE INDEX "Ticket_workspaceId_aiAgentId_idx" ON "Ticket"("workspaceId", "aiAgentId");

ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_channelId_fkey";
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_workspaceId_channelId_fkey"
  FOREIGN KEY ("workspaceId", "channelId") REFERENCES "Channel"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_workspaceId_aiAgentId_fkey"
  FOREIGN KEY ("workspaceId", "aiAgentId") REFERENCES "AiAgent"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Tool" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "origin" "ToolOrigin" NOT NULL,
  "name" TEXT NOT NULL, "description" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
  "inputSchema" JSONB NOT NULL, "risk" "ToolRisk" NOT NULL DEFAULT 'READ_ONLY',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Tool_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Tool_workspaceId_id_key" ON "Tool"("workspaceId", "id");
CREATE UNIQUE INDEX "Tool_workspaceId_name_key" ON "Tool"("workspaceId", "name");
ALTER TABLE "Tool" ADD CONSTRAINT "Tool_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ToolAssignment" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "aiAgentId" TEXT NOT NULL, "toolId" TEXT NOT NULL,
  "usageInstruction" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ToolAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ToolAssignment_workspaceId_aiAgentId_toolId_key" ON "ToolAssignment"("workspaceId", "aiAgentId", "toolId");
CREATE INDEX "ToolAssignment_workspaceId_toolId_idx" ON "ToolAssignment"("workspaceId", "toolId");
ALTER TABLE "ToolAssignment" ADD CONSTRAINT "ToolAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ToolAssignment" ADD CONSTRAINT "ToolAssignment_workspaceId_aiAgentId_fkey" FOREIGN KEY ("workspaceId", "aiAgentId") REFERENCES "AiAgent"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ToolAssignment" ADD CONSTRAINT "ToolAssignment_workspaceId_toolId_fkey" FOREIGN KEY ("workspaceId", "toolId") REFERENCES "Tool"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ToolPolicy" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "aiAgentId" TEXT NOT NULL,
  "category" "TicketCategory" NOT NULL, "toolId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ToolPolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ToolPolicy_workspaceId_aiAgentId_category_key" ON "ToolPolicy"("workspaceId", "aiAgentId", "category");
CREATE INDEX "ToolPolicy_workspaceId_toolId_idx" ON "ToolPolicy"("workspaceId", "toolId");
ALTER TABLE "ToolPolicy" ADD CONSTRAINT "ToolPolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ToolPolicy" ADD CONSTRAINT "ToolPolicy_workspaceId_aiAgentId_fkey" FOREIGN KEY ("workspaceId", "aiAgentId") REFERENCES "AiAgent"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ToolPolicy" ADD CONSTRAINT "ToolPolicy_workspaceId_toolId_fkey" FOREIGN KEY ("workspaceId", "toolId") REFERENCES "Tool"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ToolPolicy" ADD CONSTRAINT "ToolPolicy_workspaceId_aiAgentId_toolId_fkey" FOREIGN KEY ("workspaceId", "aiAgentId", "toolId") REFERENCES "ToolAssignment"("workspaceId", "aiAgentId", "toolId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "HttpToolConfig" (
  "toolId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "method" "HttpMethod" NOT NULL,
  "url" TEXT NOT NULL, "bearerTokenEncrypted" TEXT, "secretHeadersEncrypted" TEXT,
  CONSTRAINT "HttpToolConfig_pkey" PRIMARY KEY ("toolId")
);
CREATE UNIQUE INDEX "HttpToolConfig_workspaceId_toolId_key" ON "HttpToolConfig"("workspaceId", "toolId");
ALTER TABLE "HttpToolConfig" ADD CONSTRAINT "HttpToolConfig_workspaceId_toolId_fkey" FOREIGN KEY ("workspaceId", "toolId") REFERENCES "Tool"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "McpServer" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "url" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true, "bearerTokenEncrypted" TEXT, "secretHeadersEncrypted" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "McpServer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "McpServer_workspaceId_id_key" ON "McpServer"("workspaceId", "id");
CREATE UNIQUE INDEX "McpServer_workspaceId_name_key" ON "McpServer"("workspaceId", "name");
ALTER TABLE "McpServer" ADD CONSTRAINT "McpServer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "McpTool" (
  "toolId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "mcpServerId" TEXT NOT NULL,
  "remoteName" TEXT NOT NULL, "discoveredSchema" JSONB NOT NULL, "discoveredDescription" TEXT NOT NULL,
  "discoveryStatus" "McpToolDiscoveryStatus" NOT NULL DEFAULT 'CURRENT', "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "McpTool_pkey" PRIMARY KEY ("toolId")
);
CREATE UNIQUE INDEX "McpTool_workspaceId_toolId_key" ON "McpTool"("workspaceId", "toolId");
CREATE UNIQUE INDEX "McpTool_workspaceId_mcpServerId_remoteName_key" ON "McpTool"("workspaceId", "mcpServerId", "remoteName");
ALTER TABLE "McpTool" ADD CONSTRAINT "McpTool_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "McpTool" ADD CONSTRAINT "McpTool_workspaceId_toolId_fkey" FOREIGN KEY ("workspaceId", "toolId") REFERENCES "Tool"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "McpTool" ADD CONSTRAINT "McpTool_workspaceId_mcpServerId_fkey" FOREIGN KEY ("workspaceId", "mcpServerId") REFERENCES "McpServer"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Tool" ("id", "workspaceId", "origin", "name", "description", "inputSchema", "risk", "updatedAt")
SELECT gen_random_uuid()::text, "id", 'BUILT_IN'::"ToolOrigin", 'searchKnowledge', 'Search published Customer-Safe Knowledge Sources.', '{"type":"object"}'::jsonb, 'READ_ONLY'::"ToolRisk", CURRENT_TIMESTAMP FROM "Workspace"
UNION ALL
SELECT gen_random_uuid()::text, "id", 'BUILT_IN'::"ToolOrigin", 'searchCustomerTicketHistory', 'Search resolved Tickets for the same Customer Identity and Channel.', '{"type":"object"}'::jsonb, 'READ_ONLY'::"ToolRisk", CURRENT_TIMESTAMP FROM "Workspace";

INSERT INTO "ToolAssignment" ("id", "workspaceId", "aiAgentId", "toolId")
SELECT gen_random_uuid()::text, tool."workspaceId", agent."id", tool."id"
FROM "Tool" AS tool
JOIN LATERAL (
  SELECT "id" FROM "AiAgent" WHERE "workspaceId" = tool."workspaceId" ORDER BY "createdAt", "id" LIMIT 1
) AS agent ON true
WHERE tool."origin" = 'BUILT_IN';
