import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { appConfig, databaseConfig } from "../config";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseConfig.url }),
  });

if (!appConfig.isProduction) {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
