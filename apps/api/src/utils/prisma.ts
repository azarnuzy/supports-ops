import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { appConfig, databaseConfig } from "../config";
import { workspaceIsolation } from "./workspace-isolation";

const globalForPrisma = globalThis as unknown as {
  unscopedPrisma?: PrismaClient;
};

export const unscopedPrisma =
  globalForPrisma.unscopedPrisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseConfig.url }),
  });

if (!appConfig.isProduction) {
  globalForPrisma.unscopedPrisma = unscopedPrisma;
}

export const prisma = unscopedPrisma.$extends(workspaceIsolation);

export * from "@prisma/client";
