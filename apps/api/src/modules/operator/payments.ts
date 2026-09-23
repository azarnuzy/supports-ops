import { z } from "zod";
import { unscopedPrisma } from "../../utils/prisma";

export const paymentQuerySchema = z.object({
  status: z.enum(["PENDING", "PAID", "EXPIRED"]).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function listPayments(query: z.infer<typeof paymentQuerySchema>) {
  const now = new Date();
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
  };
  const [total, rows] = await Promise.all([
    unscopedPrisma.topUpPayment.count({ where }),
    unscopedPrisma.topUpPayment.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        workspace: { select: { id: true, name: true, slug: true } },
        packId: true,
        amountIdr: true,
        status: true,
        mayarPaymentId: true,
        createdAt: true,
        paidAt: true,
        expiresAt: true,
        ledgerEntryId: true,
      },
    }),
  ]);
  return {
    payments: rows.map(({ expiresAt, ledgerEntryId, ...payment }) => ({
      ...payment,
      status: payment.status === "PAID" ? "PAID" : expiresAt <= now ? "EXPIRED" : "PENDING",
      ledgerEntryId: payment.status === "PAID" ? ledgerEntryId : null,
    })),
    page: query.page,
    limit: query.limit,
    total,
  };
}
