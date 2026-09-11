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

/** True when `error` is a unique-constraint violation naming `field`.
 *
 * The field is matched against the whole `meta` object rather than
 * `meta.target`: with the pg driver adapter Prisma reports the offending
 * columns under `meta.driverAdapterError`, and reading one fixed path silently
 * stopped recognising any conflict at all. */
export function isUniqueConstraintError(error: unknown, field: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002" &&
    "meta" in error &&
    JSON.stringify(error.meta ?? {}).includes(field)
  );
}

export * from "@prisma/client";
