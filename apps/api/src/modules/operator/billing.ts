import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { unscopedPrisma } from "../../utils/prisma";
import { resolveRange } from "../analytics/services";
import { analyticsRangeQuerySchema } from "../analytics/schema";

const sortDirection = z.enum(["asc", "desc"]).default("desc");
const pageFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortDirection,
};

export const creditQuerySchema = z.object({
  workspace: z.string().trim().max(100).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  type: z.enum(["TRIAL_GRANT", "TOP_UP", "SPEND"]).optional(),
  sortBy: z.enum(["createdAt", "workspace", "type", "credits"]).default("createdAt"),
  ...pageFields,
});

export const periodQuerySchema = z.object({
  workspace: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "ENDED", "ENDED_EARLY"]).optional(),
  sortBy: z.enum(["startAt", "workspace", "endAt", "status", "operator"]).default("startAt"),
  ...pageFields,
});

export async function getBillingOverview(query: z.infer<typeof analyticsRangeQuerySchema>) {
  const { from, to, startAt, endAt } = resolveRange(query);
  const days = Math.round((endAt.getTime() - startAt.getTime()) / 86_400_000);
  const previousAt = new Date(startAt.getTime() - days * 86_400_000);
  const now = new Date();
  const [
    payments,
    previousPayments,
    ledger,
    previousLedger,
    workspaces,
    balances,
    periods,
    paymentStatuses,
  ] = await Promise.all([
    unscopedPrisma.topUpPayment.findMany({
      where: { status: "PAID", paidAt: { gte: startAt, lt: endAt } },
      select: { paidAt: true, amountIdr: true },
    }),
    unscopedPrisma.topUpPayment.aggregate({
      where: { status: "PAID", paidAt: { gte: previousAt, lt: startAt } },
      _sum: { amountIdr: true },
      _count: true,
    }),
    unscopedPrisma.creditLedgerEntry.findMany({
      where: { createdAt: { gte: startAt, lt: endAt }, type: { in: ["TOP_UP", "SPEND"] } },
      select: { createdAt: true, type: true, credits: true, workspaceId: true },
    }),
    unscopedPrisma.creditLedgerEntry.groupBy({
      by: ["type"],
      where: { createdAt: { gte: previousAt, lt: startAt }, type: { in: ["TOP_UP", "SPEND"] } },
      _sum: { credits: true },
    }),
    unscopedPrisma.workspace.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    }),
    unscopedPrisma.creditLedgerEntry.groupBy({ by: ["workspaceId"], _sum: { credits: true } }),
    unscopedPrisma.unlimitedPeriod.findMany({
      where: { endedEarlyAt: null, OR: [{ endAt: null }, { endAt: { gt: now } }] },
      select: { workspaceId: true },
    }),
    unscopedPrisma.topUpPayment.findMany({
      where: { createdAt: { gte: startAt, lt: endAt } },
      select: { status: true, expiresAt: true },
    }),
  ]);
  const daily = Array.from({ length: days }, (_, index) => ({
    date: new Date(startAt.getTime() + index * 86_400_000).toISOString().slice(0, 10),
    revenueIdr: 0,
    added: 0,
    spent: 0,
  }));
  for (const payment of payments) {
    if (!payment.paidAt) continue;
    const index = Math.floor((payment.paidAt.getTime() - startAt.getTime()) / 86_400_000);
    if (daily[index]) daily[index].revenueIdr += payment.amountIdr;
  }
  const spentByWorkspace = new Map<string, number>();
  for (const entry of ledger) {
    const index = Math.floor((entry.createdAt.getTime() - startAt.getTime()) / 86_400_000);
    if (!daily[index]) continue;
    if (entry.type === "TOP_UP") daily[index].added += entry.credits;
    else {
      daily[index].spent -= entry.credits;
      spentByWorkspace.set(
        entry.workspaceId,
        (spentByWorkspace.get(entry.workspaceId) ?? 0) - entry.credits,
      );
    }
  }
  const balanceByWorkspace = new Map(
    balances.map((row) => [row.workspaceId, row._sum.credits ?? 0]),
  );
  const distribution = { over1000: 0, from100To1000: 0, from1To100: 0, zeroOrLess: 0 };
  for (const workspace of workspaces) {
    const balance = balanceByWorkspace.get(workspace.id) ?? 0;
    if (balance > 1000) distribution.over1000++;
    else if (balance >= 100) distribution.from100To1000++;
    else if (balance > 0) distribution.from1To100++;
    else distribution.zeroOrLess++;
  }
  const previous = (type: "TOP_UP" | "SPEND") =>
    Math.abs(previousLedger.find((row) => row.type === type)?._sum.credits ?? 0);
  return {
    range: { from, to },
    metrics: {
      revenueIdr: payments.reduce((sum, row) => sum + row.amountIdr, 0),
      successfulPayments: payments.length,
      creditsAdded: ledger
        .filter((row) => row.type === "TOP_UP")
        .reduce((sum, row) => sum + row.credits, 0),
      creditsConsumed: ledger
        .filter((row) => row.type === "SPEND")
        .reduce((sum, row) => sum - row.credits, 0),
      activeUnlimitedPeriods: periods.length,
    },
    previous: {
      revenueIdr: previousPayments._sum.amountIdr ?? 0,
      successfulPayments: previousPayments._count,
      creditsAdded: previous("TOP_UP"),
      creditsConsumed: previous("SPEND"),
    },
    daily,
    distribution,
    workspaceCount: workspaces.length,
    paymentStatuses: {
      paid: paymentStatuses.filter((row) => row.status === "PAID").length,
      pending: paymentStatuses.filter((row) => row.status === "PENDING" && row.expiresAt > now)
        .length,
      expired: paymentStatuses.filter((row) => row.status === "PENDING" && row.expiresAt <= now)
        .length,
    },
    topWorkspaces: workspaces
      .map((workspace) => ({
        ...workspace,
        creditsConsumed: spentByWorkspace.get(workspace.id) ?? 0,
      }))
      .sort((a, b) => b.creditsConsumed - a.creditsConsumed)
      .slice(0, 5),
  };
}

export async function listCreditOperations(query: z.infer<typeof creditQuerySchema>) {
  const sort: Record<
    z.infer<typeof creditQuerySchema>["sortBy"],
    Prisma.CreditLedgerEntryOrderByWithRelationInput
  > = {
    createdAt: { createdAt: query.sortDirection },
    workspace: { workspace: { name: query.sortDirection } },
    type: { type: query.sortDirection },
    credits: { credits: query.sortDirection },
  };
  const where = {
    ...(query.type && { type: query.type }),
    ...(query.workspace && {
      workspace: { name: { contains: query.workspace, mode: "insensitive" as const } },
    }),
    createdAt: {
      ...(query.from && { gte: new Date(query.from) }),
      ...(query.to && { lte: new Date(query.to) }),
    },
  };
  const [total, rows] = await Promise.all([
    unscopedPrisma.creditLedgerEntry.count({ where }),
    unscopedPrisma.creditLedgerEntry.findMany({
      where,
      orderBy: [sort[query.sortBy], { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        createdAt: true,
        type: true,
        credits: true,
        note: true,
        workspace: { select: { id: true, name: true } },
      },
    }),
  ]);
  return { operations: rows, total, page: query.page, limit: query.limit };
}

export async function listUnlimitedPeriods(query: z.infer<typeof periodQuerySchema>) {
  const now = new Date();
  const sort: Record<
    z.infer<typeof periodQuerySchema>["sortBy"],
    Prisma.UnlimitedPeriodOrderByWithRelationInput
  > = {
    startAt: { startAt: query.sortDirection },
    workspace: { workspace: { name: query.sortDirection } },
    endAt: { endAt: query.sortDirection },
    status: { endedEarlyAt: query.sortDirection },
    operator: { operator: { name: query.sortDirection } },
  };
  const statusWhere =
    query.status === "ACTIVE"
      ? { endedEarlyAt: null, OR: [{ endAt: null }, { endAt: { gt: now } }] }
      : query.status === "ENDED_EARLY"
        ? { endedEarlyAt: { not: null } }
        : query.status === "ENDED"
          ? { endedEarlyAt: null, endAt: { lte: now } }
          : {};
  const where = {
    ...statusWhere,
    ...(query.workspace && {
      workspace: { name: { contains: query.workspace, mode: "insensitive" as const } },
    }),
  };
  const [total, periods] = await Promise.all([
    unscopedPrisma.unlimitedPeriod.count({ where }),
    unscopedPrisma.unlimitedPeriod.findMany({
      where,
      orderBy: [sort[query.sortBy], { id: "desc" }],
      skip: query.sortBy === "status" ? undefined : (query.page - 1) * query.limit,
      take: query.sortBy === "status" ? undefined : query.limit,
      select: {
        id: true,
        startAt: true,
        endAt: true,
        endedEarlyAt: true,
        workspace: { select: { id: true, name: true } },
        operator: { select: { name: true } },
      },
    }),
  ]);
  const rows = periods.map((period) => ({
    ...period,
    status: period.endedEarlyAt
      ? ("ENDED_EARLY" as const)
      : period.endAt && period.endAt <= now
        ? ("ENDED" as const)
        : ("ACTIVE" as const),
  }));
  // ponytail: status sorting loads matching periods; store status only if the history grows large.
  if (query.sortBy === "status") {
    const rank = { ACTIVE: 0, ENDED: 1, ENDED_EARLY: 2 };
    rows.sort(
      (a, b) =>
        (rank[a.status] - rank[b.status]) * (query.sortDirection === "asc" ? 1 : -1) ||
        b.id.localeCompare(a.id),
    );
  }
  return {
    periods:
      query.sortBy === "status"
        ? rows.slice((query.page - 1) * query.limit, query.page * query.limit)
        : rows,
    total,
    page: query.page,
    limit: query.limit,
  };
}
