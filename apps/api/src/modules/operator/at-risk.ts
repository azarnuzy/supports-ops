import { unscopedPrisma } from "../../utils/prisma";
import { lowBalanceThreshold } from "../credits/services";

const unlimitedEndingWindowMs = 7 * 24 * 60 * 60 * 1000;
const inactivityWindowMs = 14 * 24 * 60 * 60 * 1000;

export type AtRiskCondition =
  | "CREDIT_EXHAUSTED"
  | "LOW_BALANCE"
  | "UNLIMITED_ENDING_SOON"
  | "INACTIVE";

/** A Workspace matching several conditions appears once, listing all of them. */
export async function listAtRiskWorkspaces() {
  const now = new Date();
  const workspaces = await unscopedPrisma.workspace.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, slug: true },
  });
  const ids = workspaces.map((workspace) => workspace.id);
  if (!ids.length) return { workspaces: [] };

  const [balances, activePeriods, activity] = await Promise.all([
    unscopedPrisma.creditLedgerEntry.groupBy({
      by: ["workspaceId"],
      where: { workspaceId: { in: ids } },
      _sum: { credits: true },
    }),
    unscopedPrisma.unlimitedPeriod.findMany({
      where: { workspaceId: { in: ids }, endedEarlyAt: null, endAt: { gt: now } },
      select: { workspaceId: true, endAt: true },
    }),
    unscopedPrisma.session.groupBy({
      by: ["workspaceId"],
      where: { workspaceId: { in: ids } },
      _max: { customerLastMessageAt: true },
    }),
  ]);

  const inactiveSince = new Date(now.getTime() - inactivityWindowMs);
  const endingSoonBy = new Date(now.getTime() + unlimitedEndingWindowMs);

  const rows = workspaces.map((workspace) => {
    const balance = balances.find((row) => row.workspaceId === workspace.id)?._sum.credits ?? 0;
    const activePeriod = activePeriods.find((row) => row.workspaceId === workspace.id) ?? null;
    const lastCustomerActivityAt =
      activity.find((row) => row.workspaceId === workspace.id)?._max.customerLastMessageAt ?? null;

    const conditions: AtRiskCondition[] = [];
    if (!activePeriod) {
      if (balance <= 0) conditions.push("CREDIT_EXHAUSTED");
      else if (balance < lowBalanceThreshold) conditions.push("LOW_BALANCE");
    }
    if (activePeriod && activePeriod.endAt <= endingSoonBy)
      conditions.push("UNLIMITED_ENDING_SOON");
    if (lastCustomerActivityAt === null || lastCustomerActivityAt < inactiveSince)
      conditions.push("INACTIVE");

    return {
      ...workspace,
      balance,
      activeUnlimitedPeriod: activePeriod ? { endAt: activePeriod.endAt } : null,
      lastCustomerActivityAt,
      conditions,
    };
  });

  return { workspaces: rows.filter((row) => row.conditions.length > 0) };
}
