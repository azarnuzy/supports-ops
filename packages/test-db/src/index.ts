import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { Client } from "pg";

const execFileAsync = promisify(execFile);

/**
 * Points at the Postgres from `docker-compose.dev.yaml`. The database in the
 * URL is only used to connect while creating and dropping the throwaway one,
 * so pointing this at a different server is all CI needs.
 */
const maintenanceUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:15432/supportops";

export type TestDatabase = {
  /** Connection string for the throwaway, fully migrated database. */
  url: string;
  name: string;
  drop: () => Promise<void>;
};

/**
 * Creates an isolated, migrated database for one test file. The name is random,
 * so API and worker suites can run in parallel without colliding.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `supportops_test_${randomBytes(6).toString("hex")}`;
  const url = new URL(maintenanceUrl);
  url.pathname = `/${name}`;

  await runMaintenanceQuery(`CREATE DATABASE "${name}"`);

  try {
    // ponytail: one `migrate deploy` per database (~1.5s). If suites multiply,
    // migrate a template database once and `CREATE DATABASE ... TEMPLATE` instead.
    await execFileAsync("pnpm", ["--filter", "@repo/api", "exec", "prisma", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: url.toString() },
    });
  } catch (error) {
    await dropDatabase(name);
    throw error;
  }

  return { drop: () => dropDatabase(name), name, url: url.toString() };
}

/** Empties every table but keeps the schema, for use between tests. */
export async function truncateAll(client: {
  $executeRawUnsafe: (sql: string) => Promise<unknown>;
}) {
  await client.$executeRawUnsafe(`
    DO $$
    DECLARE statement TEXT;
    BEGIN
      SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
        INTO statement
        FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';

      IF statement IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || statement || ' CASCADE';
      END IF;
    END $$;
  `);
}

async function dropDatabase(name: string) {
  await runMaintenanceQuery(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
}

async function runMaintenanceQuery(sql: string) {
  const client = new Client({ connectionString: maintenanceUrl });
  await client.connect();

  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}
