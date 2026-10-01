import { randomUUID } from "node:crypto";
import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

let database: TestDatabase;
let prisma: typeof import("../../utils/prisma").unscopedPrisma;
let billing: typeof import("./billing");

beforeAll(async () => {
  database = await createTestDatabase();
  process.env.DATABASE_URL = database.url;
  ({ unscopedPrisma: prisma } = await import("../../utils/prisma"));
  billing = await import("./billing");
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await database?.drop();
});

beforeEach(async () => {
  await truncateAll(prisma);
});

it("counts an Organization once in the balance distribution regardless of Workspace count", async () => {
  const organizationId = randomUUID();
  const workspaceIds = [randomUUID(), randomUUID()];
  await prisma.organization.create({ data: { id: organizationId, name: "Acme" } });
  for (const workspaceId of workspaceIds) {
    await prisma.workspace.create({
      data: { id: workspaceId, organizationId, name: "Acme", slug: workspaceId },
    });
  }
  await prisma.creditLedgerEntry.create({
    data: {
      id: randomUUID(),
      organizationId,
      workspaceId: workspaceIds[0],
      type: "TOP_UP",
      credits: 5_000,
    },
  });

  const overview = await billing.getBillingOverview({});

  expect(overview.organizationCount).toBe(1);
  expect(overview.distribution).toMatchObject({
    over1000: 1,
    from100To1000: 0,
    from1To100: 0,
    zeroOrLess: 0,
  });
});

it("only attaches a Workspace to Spend rows, never to Top-Ups or Trial Grants", async () => {
  const organizationId = randomUUID();
  const workspaceId = randomUUID();
  await prisma.organization.create({ data: { id: organizationId, name: "Acme" } });
  await prisma.workspace.create({
    data: { id: workspaceId, organizationId, name: "Acme", slug: workspaceId },
  });
  await prisma.creditLedgerEntry.createMany({
    data: [
      { id: randomUUID(), organizationId, workspaceId, type: "TRIAL_GRANT", credits: 500 },
      { id: randomUUID(), organizationId, workspaceId, type: "TOP_UP", credits: 1_000 },
      { id: randomUUID(), organizationId, workspaceId, type: "SPEND", credits: -10 },
    ],
  });

  const { operations } = await billing.listCreditOperations({
    sortBy: "createdAt",
    sortDirection: "desc",
    page: 1,
    limit: 20,
  });

  const byType = Object.fromEntries(operations.map((row) => [row.type, row]));
  expect(byType.TRIAL_GRANT.workspace).toBeNull();
  expect(byType.TOP_UP.workspace).toBeNull();
  expect(byType.SPEND.workspace).toMatchObject({ id: workspaceId });
  expect(byType.SPEND.organization).toMatchObject({ id: organizationId });
});
