import { unscopedPrisma } from "../../utils/prisma";
import { topUpWorkspace } from "./services";
import { currentOrLastUnlimitedPeriod } from "./unlimited-periods";

/** Batches an Organization name lookup for a set of ids, some possibly null. */
export async function getOrganizationNames(ids: (string | null)[]) {
  const uniqueIds = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!uniqueIds.length) return new Map<string, string>();
  const organizations = await unscopedPrisma.organization.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true },
  });
  return new Map(organizations.map((organization) => [organization.id, organization.name]));
}

export async function listOrganizations(search?: string) {
  const organizations = await unscopedPrisma.organization.findMany({
    where: search ? { name: { contains: search, mode: "insensitive" } } : undefined,
    select: {
      id: true,
      name: true,
      workspaces: { where: { deletedAt: null }, select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
  const balances = await unscopedPrisma.creditLedgerEntry.groupBy({
    by: ["organizationId"],
    _sum: { credits: true },
  });
  const byId = new Map(balances.map((row) => [row.organizationId, row._sum.credits ?? 0]));
  return organizations.map((organization) => ({
    ...organization,
    balance: byId.get(organization.id) ?? 0,
  }));
}

export async function getOrganizationDetail(id: string) {
  const organization = await unscopedPrisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      workspaces: {
        where: { deletedAt: null },
        select: { id: true, name: true, slug: true },
        orderBy: { name: "asc" },
      },
      users: {
        where: { isOrganizationAdmin: true, deletedAt: null },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!organization) return null;
  const [balance, payments, ledger, unlimitedPeriod] = await Promise.all([
    unscopedPrisma.creditLedgerEntry.aggregate({
      where: { organizationId: id },
      _sum: { credits: true },
    }),
    unscopedPrisma.topUpPayment.findMany({
      where: { workspace: { organizationId: id } },
      select: { id: true, credits: true, amountIdr: true, status: true, paidAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    unscopedPrisma.creditLedgerEntry.findMany({
      where: { organizationId: id },
      select: { id: true, type: true, credits: true, note: true, createdAt: true, workspaceId: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    currentOrLastUnlimitedPeriod(id),
  ]);
  return { ...organization, balance: balance._sum.credits ?? 0, payments, ledger,
    unlimitedPeriod: unlimitedPeriod ? { endAt: unlimitedPeriod.endAt, endedEarlyAt: unlimitedPeriod.endedEarlyAt } : null };
}

export async function topUpOrganization(operatorId: string, organizationId: string, credits: number, note: string) {
  const workspace = await unscopedPrisma.workspace.findFirst({
    where: { organizationId, deletedAt: null },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return workspace ? topUpWorkspace(operatorId, workspace.id, credits, note) : null;
}
