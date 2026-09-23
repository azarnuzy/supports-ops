import { randomUUID } from "node:crypto";
import { createTestDatabase, type TestDatabase, truncateAll } from "@repo/test-db";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

let database: TestDatabase;
let prisma: typeof import("../../utils/prisma").unscopedPrisma;
let unlimitedPeriods: typeof import("./unlimited-periods");
let workspaceId: string;
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
  operatorId = randomUUID();
  await prisma.workspace.create({ data: { id: workspaceId, name: "Acme", slug: workspaceId } });
  await prisma.operator.create({ data: { id: operatorId, name: "Operator", email: `${operatorId}@example.com` } });
});

it("resolves the end date to 23:59 Asia/Jakarta (16:59 UTC)", () => {
  const endAt = unlimitedPeriods.endOfDayJakarta("2026-10-05");
  expect(endAt.toISOString()).toBe("2026-10-05T16:59:59.999Z");
});

it("grants a period and records one Operator Action", async () => {
  const period = await unlimitedPeriods.grantUnlimitedPeriod(operatorId, workspaceId, "2026-10-05");

  expect(period.endAt.toISOString()).toBe("2026-10-05T16:59:59.999Z");
  const actions = await prisma.operatorAction.findMany({ where: { workspaceId } });
  expect(actions).toHaveLength(1);
  expect(actions[0]).toMatchObject({ operatorId, type: "UNLIMITED_PERIOD_GRANTED" });
});

it("rejects an overlapping grant", async () => {
  await unlimitedPeriods.grantUnlimitedPeriod(operatorId, workspaceId, "2026-10-05");

  await expect(
    unlimitedPeriods.grantUnlimitedPeriod(operatorId, workspaceId, "2026-10-10"),
  ).rejects.toBeInstanceOf(unlimitedPeriods.OverlappingUnlimitedPeriodError);
});

it("extends the active period and records one Operator Action", async () => {
  await unlimitedPeriods.grantUnlimitedPeriod(operatorId, workspaceId, "2026-10-05");

  const extended = await unlimitedPeriods.extendUnlimitedPeriod(operatorId, workspaceId, "2026-10-12");

  expect(extended.endAt.toISOString()).toBe("2026-10-12T16:59:59.999Z");
  const actions = await prisma.operatorAction.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
  expect(actions).toHaveLength(2);
  expect(actions[1]).toMatchObject({ type: "UNLIMITED_PERIOD_EXTENDED" });
});

it("rejects extending a Workspace with no active period", async () => {
  await expect(
    unlimitedPeriods.extendUnlimitedPeriod(operatorId, workspaceId, "2026-10-12"),
  ).rejects.toBeInstanceOf(unlimitedPeriods.NoActiveUnlimitedPeriodError);
});

it("ends the active period early and records one Operator Action", async () => {
  await unlimitedPeriods.grantUnlimitedPeriod(operatorId, workspaceId, "2026-10-05");

  const ended = await unlimitedPeriods.endUnlimitedPeriodEarly(operatorId, workspaceId);

  expect(ended.endedEarlyAt).not.toBeNull();
  expect(ended.endAt.getTime()).toBe(ended.endedEarlyAt!.getTime());
  const actions = await prisma.operatorAction.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
  expect(actions).toHaveLength(2);
  expect(actions[1]).toMatchObject({ type: "UNLIMITED_PERIOD_ENDED" });

  await expect(
    unlimitedPeriods.endUnlimitedPeriodEarly(operatorId, workspaceId),
  ).rejects.toBeInstanceOf(unlimitedPeriods.NoActiveUnlimitedPeriodError);
});

it("allows a new grant once the prior period has ended early", async () => {
  await unlimitedPeriods.grantUnlimitedPeriod(operatorId, workspaceId, "2026-10-05");
  await unlimitedPeriods.endUnlimitedPeriodEarly(operatorId, workspaceId);

  await expect(
    unlimitedPeriods.grantUnlimitedPeriod(operatorId, workspaceId, "2026-11-01"),
  ).resolves.toBeTruthy();
});

it("exposes the current or most recently ended period", async () => {
  expect(await unlimitedPeriods.currentOrLastUnlimitedPeriod(workspaceId)).toBeNull();

  await unlimitedPeriods.grantUnlimitedPeriod(operatorId, workspaceId, "2026-10-05");
  const current = await unlimitedPeriods.currentOrLastUnlimitedPeriod(workspaceId);
  expect(current?.endAt.toISOString()).toBe("2026-10-05T16:59:59.999Z");

  await unlimitedPeriods.endUnlimitedPeriodEarly(operatorId, workspaceId);
  const last = await unlimitedPeriods.currentOrLastUnlimitedPeriod(workspaceId);
  expect(last?.endedEarlyAt).not.toBeNull();
});
