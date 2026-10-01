import { randomUUID } from "node:crypto";
import { unscopedPrisma } from "../../utils/prisma";

export class WorkspaceNotFoundError extends Error {}
export class OverlappingUnlimitedPeriodError extends Error {}
export class NoActiveUnlimitedPeriodError extends Error {}

/** 23:59:59.999 Asia/Jakarta (UTC+7, no DST) on the given `YYYY-MM-DD` date. */
export function endOfDayJakarta(date: string) {
  return new Date(`${date}T23:59:59.999+07:00`);
}

async function findActivePeriod(
  tx: Pick<typeof unscopedPrisma, "unlimitedPeriod">,
  organizationId: string,
) {
  return tx.unlimitedPeriod.findFirst({
    where: {
      organizationId,
      endedEarlyAt: null,
      OR: [{ endAt: null }, { endAt: { gt: new Date() } }],
    },
  });
}

export async function grantUnlimitedPeriod(
  operatorId: string,
  organizationId: string,
  endDate: string | null,
) {
  return unscopedPrisma.$transaction(async (tx) => {
    // Serialize grants for the Organization before checking for an active period.
    const organization = await tx.organization.updateMany({
      where: { id: organizationId },
      data: { updatedAt: new Date() },
    });
    if (!organization.count) throw new WorkspaceNotFoundError();
    const workspace = await tx.workspace.findFirst({
      where: { organizationId, deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (!workspace) throw new WorkspaceNotFoundError();
    if (await findActivePeriod(tx, organizationId)) throw new OverlappingUnlimitedPeriodError();

    const endAt = endDate ? endOfDayJakarta(endDate) : null;
    const period = await tx.unlimitedPeriod.create({
      data: { id: randomUUID(), organizationId, operatorId, endAt },
    });
    await tx.operatorAction.create({
      data: {
        id: randomUUID(),
        operatorId,
        workspaceId: workspace.id,
        type: "UNLIMITED_PERIOD_GRANTED",
        payload: {
          organizationId,
          unlimitedPeriodId: period.id,
          endAt: endAt?.toISOString() ?? null,
        },
      },
    });
    return period;
  });
}

export async function extendUnlimitedPeriod(
  operatorId: string,
  organizationId: string,
  endDate: string | null,
) {
  return unscopedPrisma.$transaction(async (tx) => {
    const active = await findActivePeriod(tx, organizationId);
    if (!active) throw new NoActiveUnlimitedPeriodError();
    const workspace = await tx.workspace.findFirstOrThrow({
      where: { organizationId },
      select: { id: true },
    });

    const endAt = endDate ? endOfDayJakarta(endDate) : null;
    const period = await tx.unlimitedPeriod.update({ where: { id: active.id }, data: { endAt } });
    await tx.operatorAction.create({
      data: {
        id: randomUUID(),
        operatorId,
        workspaceId: workspace.id,
        type: "UNLIMITED_PERIOD_EXTENDED",
        payload: {
          organizationId,
          unlimitedPeriodId: period.id,
          endAt: endAt?.toISOString() ?? null,
        },
      },
    });
    return period;
  });
}

export async function endUnlimitedPeriodEarly(operatorId: string, organizationId: string) {
  return unscopedPrisma.$transaction(async (tx) => {
    const active = await findActivePeriod(tx, organizationId);
    if (!active) throw new NoActiveUnlimitedPeriodError();
    const workspace = await tx.workspace.findFirstOrThrow({
      where: { organizationId },
      select: { id: true },
    });

    const now = new Date();
    const period = await tx.unlimitedPeriod.update({
      where: { id: active.id },
      data: { endAt: now, endedEarlyAt: now },
    });
    await tx.operatorAction.create({
      data: {
        id: randomUUID(),
        operatorId,
        workspaceId: workspace.id,
        type: "UNLIMITED_PERIOD_ENDED",
        payload: { organizationId, unlimitedPeriodId: period.id },
      },
    });
    return period;
  });
}

/** The Organization's current or most recently ended period — periods never overlap,
 * so the latest by `createdAt` is always the right one. */
export async function currentOrLastUnlimitedPeriod(organizationId: string) {
  return unscopedPrisma.unlimitedPeriod.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
}
