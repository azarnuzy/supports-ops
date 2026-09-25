import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { unscopedPrisma } from "../../utils/prisma";

export const paymentQuerySchema = z.object({
  status: z.enum(["PENDING", "PAID", "EXPIRED"]).optional(),
  workspace: z.string().trim().max(100).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z
    .enum(["createdAt", "workspace", "amountIdr", "status", "paidAt", "credits"])
    .default("createdAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

export async function listPayments(query: z.infer<typeof paymentQuerySchema>) {
  const now = new Date();
  const sort: Record<
    z.infer<typeof paymentQuerySchema>["sortBy"],
    Prisma.TopUpPaymentOrderByWithRelationInput
  > = {
    createdAt: { createdAt: query.sortDirection },
    workspace: { workspace: { name: query.sortDirection } },
    amountIdr: { amountIdr: query.sortDirection },
    status: { status: query.sortDirection },
    paidAt: { paidAt: query.sortDirection },
    credits: { credits: query.sortDirection },
  };
  const where = {
    createdAt: {
      ...(query.from && { gte: new Date(query.from) }),
      ...(query.to && { lte: new Date(query.to) }),
    },
    ...(query.status === "PAID"
      ? { status: "PAID" as const }
      : query.status === "EXPIRED"
        ? { status: "PENDING" as const, expiresAt: { lte: now } }
        : query.status === "PENDING"
          ? { status: "PENDING" as const, expiresAt: { gt: now } }
          : {}),
    ...(query.workspace && {
      workspace: { name: { contains: query.workspace, mode: "insensitive" as const } },
    }),
  };
  const [total, rows] = await Promise.all([
    unscopedPrisma.topUpPayment.count({ where }),
    unscopedPrisma.topUpPayment.findMany({
      where,
      orderBy: [sort[query.sortBy], { id: "desc" }],
      skip: query.sortBy === "status" ? undefined : (query.page - 1) * query.limit,
      take: query.sortBy === "status" ? undefined : query.limit,
      select: {
        id: true,
        workspace: { select: { id: true, name: true, slug: true } },
        packId: true,
        amountIdr: true,
        credits: true,
        status: true,
        mayarPaymentId: true,
        createdAt: true,
        paidAt: true,
        expiresAt: true,
        ledgerEntryId: true,
      },
    }),
  ]);
  const payments = rows.map(({ expiresAt, ledgerEntryId, ...payment }) => ({
    ...payment,
    status:
      payment.status === "PAID"
        ? ("PAID" as const)
        : expiresAt <= now
          ? ("EXPIRED" as const)
          : ("PENDING" as const),
    ledgerEntryId: payment.status === "PAID" ? ledgerEntryId : null,
  }));
  // ponytail: status sorting loads matching payments; use a stored effective status if this grows large.
  if (query.sortBy === "status") {
    const rank = { PAID: 0, PENDING: 1, EXPIRED: 2 };
    payments.sort(
      (a, b) =>
        (rank[a.status] - rank[b.status]) * (query.sortDirection === "asc" ? 1 : -1) ||
        b.id.localeCompare(a.id),
    );
  }
  return {
    payments:
      query.sortBy === "status"
        ? payments.slice((query.page - 1) * query.limit, query.page * query.limit)
        : payments,
    page: query.page,
    limit: query.limit,
    total,
  };
}
