import { type TestDatabase, createTestDatabase, truncateAll } from "@repo/test-db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Proof that the database-backed harness works end to end: no Prisma mock, the
 * real migrated schema, and assertions about the rows that end up in it.
 */
let database: TestDatabase;
let prisma: typeof import("../../utils/prisma").unscopedPrisma;
let services: typeof import("./services");

const input = {
  email: "admin@example.com",
  name: "Ada Lovelace",
  password: "correct-horse-battery-staple",
};

beforeAll(async () => {
  database = await createTestDatabase();
  process.env.DATABASE_URL = database.url;
  ({ unscopedPrisma: prisma } = await import("../../utils/prisma"));
  services = await import("./services");
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await database?.drop();
});

beforeEach(async () => {
  await truncateAll(prisma);
});

describe("registerAdminWorkspace", () => {
  it("persists the workspace and its admin", async () => {
    const { user, workspace } = await services.registerAdminWorkspace(input);

    const stored = await prisma.user.findUniqueOrThrow({
      where: { email: input.email },
      include: { workspace: true },
    });

    expect(stored.id).toBe(user.id);
    expect(stored.role).toBe("ADMIN");
    expect(stored.workspace.id).toBe(workspace.id);
    expect(await prisma.aiSettings.count({ where: { workspaceId: workspace.id } })).toBe(1);
    expect(await prisma.toolAssignment.count({ where: { workspaceId: workspace.id } })).toBe(2);
  });

  it("rejects a second registration for the same email", async () => {
    await services.registerAdminWorkspace(input);

    await expect(services.registerAdminWorkspace(input)).rejects.toBeInstanceOf(
      services.EmailAlreadyInUseError,
    );

    expect(await prisma.workspace.count()).toBe(1);
  });
});
