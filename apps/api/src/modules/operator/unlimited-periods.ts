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
  workspaceId: string,
) {
  return tx.unlimitedPeriod.findFirst({
    where: { workspaceId, endedEarlyAt: null, endAt: { gt: new Date() } },
  });
}

export async function grantUnlimitedPeriod(operatorId: string, workspaceId: string, endDate: string) {
  return unscopedPrisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
      select: { id: true },
    });
    if (!workspace) throw new WorkspaceNotFoundError();
    if (await findActivePeriod(tx, workspaceId)) throw new OverlappingUnlimitedPeriodError();

    const endAt = endOfDayJakarta(endDate);
    const period = await tx.unlimitedPeriod.create({
      data: { id: randomUUID(), workspaceId, operatorId, endAt },
    });
    await tx.operatorAction.create({
      data: {
        id: randomUUID(),
        operatorId,
        workspaceId,
        type: "UNLIMITED_PERIOD_GRANTED",
        payload: { unlimitedPeriodId: period.id, endAt: endAt.toISOString() },
      },
    });
    return period;
  });
}

export async function extendUnlimitedPeriod(operatorId: string, workspaceId: string, endDate: string) {
  return unscopedPrisma.$transaction(async (tx) => {
    const active = await findActivePeriod(tx, workspaceId);
    if (!active) throw new NoActiveUnlimitedPeriodError();

    const endAt = endOfDayJakarta(endDate);
    const period = await tx.unlimitedPeriod.update({ where: { id: active.id }, data: { endAt } });
    await tx.operatorAction.create({
      data: {
        id: randomUUID(),
        operatorId,
        workspaceId,
        type: "UNLIMITED_PERIOD_EXTENDED",
        payload: { unlimitedPeriodId: period.id, endAt: endAt.toISOString() },
      },
    });
    return period;
  });
}

export async function endUnlimitedPeriodEarly(operatorId: string, workspaceId: string) {
  return unscopedPrisma.$transaction(async (tx) => {
    const active = await findActivePeriod(tx, workspaceId);
    if (!active) throw new NoActiveUnlimitedPeriodError();

    const now = new Date();
    const period = await tx.unlimitedPeriod.update({
      where: { id: active.id },
      data: { endAt: now, endedEarlyAt: now },
    });
    await tx.operatorAction.create({
      data: {
        id: randomUUID(),
        operatorId,
        workspaceId,
        type: "UNLIMITED_PERIOD_ENDED",
        payload: { unlimitedPeriodId: period.id },
      },
    });
    return period;
  });
}

/** The Workspace's current or most recently ended period — periods never overlap,
 * so the latest by `createdAt` is always the right one. */
export async function currentOrLastUnlimitedPeriod(workspaceId: string) {
  return unscopedPrisma.unlimitedPeriod.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
}
