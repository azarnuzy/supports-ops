import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { databaseConfig } from "./config";

/**
 * The worker's own Prisma client, pointed at the same database as the API.
 * There is no per-request Workspace context here (no AsyncLocalStorage, no
 * signed-in user), so every query in `knowledge-ingest.ts` scopes itself by
 * `workspaceId` explicitly rather than relying on the API's
 * workspace-isolation Prisma extension.
 */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseConfig.url }),
});
