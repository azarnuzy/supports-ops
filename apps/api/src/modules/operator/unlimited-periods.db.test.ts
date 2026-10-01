import { randomUUID } from "node:crypto";
import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

let database: TestDatabase;
let prisma: typeof import("../../utils/prisma").unscopedPrisma;
let unlimitedPeriods: typeof import("./unlimited-periods");
let workspaceId: string;
let organizationId: string;
let operatorId: string;

beforeAll(async () => {
  database = await createTestDatabase();
  process.env.DATABASE_URL = database.url;
  ({ unscopedPrisma: prisma } = await import("../../utils/prisma"));
  unlimitedPeriods = await import("./unlimited-periods");
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await database?.drop();
});

beforeEach(async () => {
  await truncateAll(prisma);
  workspaceId = randomUUID();
  organizationId = randomUUID();
  operatorId = randomUUID();
  await prisma.organization.create({ data: { id: organizationId, name: "Acme" } });
  await prisma.workspace.create({
    data: { id: workspaceId, organizationId, name: "Acme", slug: workspaceId },
  });
  await prisma.operator.create({
    data: { id: operatorId, name: "Operator", email: `${operatorId}@example.com` },
  });
});

it("resolves the end date to 23:59 Asia/Jakarta (16:59 UTC)", () => {
  const endAt = unlimitedPeriods.endOfDayJakarta("2026-10-05");
  expect(endAt.toISOString()).toBe("2026-10-05T16:59:59.999Z");
});

it("grants a period and records one Operator Action", async () => {
  const period = await unlimitedPeriods.grantUnlimitedPeriod(
    operatorId,
    organizationId,
    "2026-10-05",
  );

  expect(period.endAt?.toISOString()).toBe("2026-10-05T16:59:59.999Z");
  const actions = await prisma.operatorAction.findMany({ where: { workspaceId } });
  expect(actions).toHaveLength(1);
  expect(actions[0]).toMatchObject({ operatorId, type: "UNLIMITED_PERIOD_GRANTED" });
});

it("rejects an overlapping grant", async () => {
  await unlimitedPeriods.grantUnlimitedPeriod(operatorId, organizationId, "2026-10-05");
  await prisma.workspace.create({
    data: { id: randomUUID(), organizationId, name: "Second", slug: randomUUID() },
  });

  await expect(
    unlimitedPeriods.grantUnlimitedPeriod(operatorId, organizationId, "2026-10-10"),
  ).rejects.toBeInstanceOf(unlimitedPeriods.OverlappingUnlimitedPeriodError);
});

it("keeps an undated period active until ended or given an end date", async () => {
  const period = await unlimitedPeriods.grantUnlimitedPeriod(operatorId, organizationId, null);
  expect(period.endAt).toBeNull();
  await expect(
    unlimitedPeriods.grantUnlimitedPeriod(operatorId, organizationId, null),
  ).rejects.toBeInstanceOf(unlimitedPeriods.OverlappingUnlimitedPeriodError);

  const dated = await unlimitedPeriods.extendUnlimitedPeriod(
    operatorId,
    organizationId,
    "2026-10-12",
  );
  expect(dated.endAt?.toISOString()).toBe("2026-10-12T16:59:59.999Z");
  await unlimitedPeriods.extendUnlimitedPeriod(operatorId, organizationId, null);
  await unlimitedPeriods.endUnlimitedPeriodEarly(operatorId, organizationId);
  expect(await prisma.unlimitedPeriod.findFirst({ where: { id: period.id } })).toMatchObject({
    endedEarlyAt: expect.any(Date),
  });
});

it("extends the active period and records one Operator Action", async () => {
  await unlimitedPeriods.grantUnlimitedPeriod(operatorId, organizationId, "2026-10-05");

  const extended = await unlimitedPeriods.extendUnlimitedPeriod(
    operatorId,
    organizationId,
    "2026-10-12",
  );

  expect(extended.endAt?.toISOString()).toBe("2026-10-12T16:59:59.999Z");
  const actions = await prisma.operatorAction.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
  });
  expect(actions).toHaveLength(2);
  expect(actions[1]).toMatchObject({ type: "UNLIMITED_PERIOD_EXTENDED" });
});

it("rejects extending a Workspace with no active period", async () => {
  await expect(
    unlimitedPeriods.extendUnlimitedPeriod(operatorId, organizationId, "2026-10-12"),
  ).rejects.toBeInstanceOf(unlimitedPeriods.NoActiveUnlimitedPeriodError);
});

it("ends the active period early and records one Operator Action", async () => {
  await unlimitedPeriods.grantUnlimitedPeriod(operatorId, organizationId, "2026-10-05");

  const ended = await unlimitedPeriods.endUnlimitedPeriodEarly(operatorId, organizationId);

  expect(ended.endedEarlyAt).not.toBeNull();
  expect(ended.endAt?.getTime()).toBe(ended.endedEarlyAt?.getTime());
  const actions = await prisma.operatorAction.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
  });
  expect(actions).toHaveLength(2);
  expect(actions[1]).toMatchObject({ type: "UNLIMITED_PERIOD_ENDED" });

  await expect(
    unlimitedPeriods.endUnlimitedPeriodEarly(operatorId, organizationId),
  ).rejects.toBeInstanceOf(unlimitedPeriods.NoActiveUnlimitedPeriodError);
});

it("allows a new grant once the prior period has ended early", async () => {
  await unlimitedPeriods.grantUnlimitedPeriod(operatorId, organizationId, "2026-10-05");
  await unlimitedPeriods.endUnlimitedPeriodEarly(operatorId, organizationId);

  await expect(
    unlimitedPeriods.grantUnlimitedPeriod(operatorId, organizationId, "2026-11-01"),
  ).resolves.toBeTruthy();
});

it("exposes the current or most recently ended period", async () => {
  expect(await unlimitedPeriods.currentOrLastUnlimitedPeriod(organizationId)).toBeNull();

  await unlimitedPeriods.grantUnlimitedPeriod(operatorId, organizationId, "2026-10-05");
  const current = await unlimitedPeriods.currentOrLastUnlimitedPeriod(organizationId);
  expect(current?.endAt?.toISOString()).toBe("2026-10-05T16:59:59.999Z");

  await unlimitedPeriods.endUnlimitedPeriodEarly(operatorId, organizationId);
  const last = await unlimitedPeriods.currentOrLastUnlimitedPeriod(organizationId);
  expect(last?.endedEarlyAt).not.toBeNull();
});
