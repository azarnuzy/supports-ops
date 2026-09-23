import { randomUUID } from "node:crypto";
import type { TopUpPayment } from "@prisma/client";
import { mayarConfig } from "../../config";
import { logger } from "../../utils/logger";
import { prisma, unscopedPrisma } from "../../utils/prisma";
import { requireWorkspaceId } from "../../utils/workspace-context";
import { modelCatalog } from "../ai-agent/model-catalog";
import { creditBalance } from "../credits/services";
import { currentOrLastUnlimitedPeriod } from "../operator/unlimited-periods";
import { createMayarPayment, fetchMayarPayment } from "./mayar";
import { findTopUpPack, topUpPacks } from "./packs";

const checkoutLifetimeMs = 24 * 60 * 60 * 1000;
// ponytail: history is paged client-side; move to a cursor endpoint if Workspaces pass 100 Top-Ups.
const paymentHistoryLimit = 100;

export class UnknownTopUpPackError extends Error {}

export type TopUpPaymentView = {
  id: string;
  packId: string;
  credits: number;
  amountIdr: number;
  status: "PENDING" | "PAID" | "EXPIRED";
  /** Null once the payment can no longer be completed. */
  checkoutUrl: string | null;
  createdAt: Date;
  expiresAt: Date;
  paidAt: Date | null;
};

function toView(payment: TopUpPayment, now = new Date()): TopUpPaymentView {
  const status =
    payment.status === "PAID" ? "PAID" : payment.expiresAt <= now ? "EXPIRED" : "PENDING";
  return {
    amountIdr: payment.amountIdr,
    checkoutUrl: status === "PENDING" ? payment.checkoutUrl : null,
    createdAt: payment.createdAt,
    credits: payment.credits,
    expiresAt: payment.expiresAt,
    id: payment.id,
    packId: payment.packId,
    paidAt: payment.paidAt,
    status,
  };
}

/**
 * Asks Mayar whether this payment is paid — the only source of truth, since
 * Mayar's webhook is unsigned (ADR-0023). Marking it paid and writing the
 * Top-Up happen together and only from PENDING, so a repeat adds nothing.
 */
export async function verifyTopUpPayment(payment: TopUpPayment) {
  if (payment.status === "PAID") return false;
  const remote = await fetchMayarPayment(payment.mayarPaymentId);
  if (remote.status !== "paid" || remote.amount !== payment.amountIdr) return false;

  return unscopedPrisma.$transaction(async (tx) => {
    const transition = await tx.topUpPayment.updateMany({
      data: { paidAt: new Date(), status: "PAID" },
      where: { id: payment.id, status: "PENDING" },
    });
    if (!transition.count) return false;
    const ledgerEntry = await tx.creditLedgerEntry.create({
      data: {
        credits: payment.credits,
        id: randomUUID(),
        note: `Top-Up Pack ${payment.packId} (Mayar ${payment.mayarPaymentId})`,
        type: "TOP_UP",
        workspaceId: payment.workspaceId,
      },
    });
    await tx.topUpPayment.update({
      data: { ledgerEntryId: ledgerEntry.id },
      where: { id: payment.id },
    });
    return true;
  });
}

/** Re-checks the given unpaid, unexpired payments; a Mayar outage leaves them pending. */
async function verifyAll(payments: TopUpPayment[]) {
  for (const payment of payments) {
    try {
      await verifyTopUpPayment(payment);
    } catch (error) {
      logger.warn({ error, topUpPaymentId: payment.id }, "Top-Up Payment verification failed.");
    }
  }
}

function pendingWhere(now = new Date()) {
  return { expiresAt: { gt: now }, status: "PENDING" as const };
}

/** Everything the Billing page shows. Pending payments are re-checked first, so
 * an Admin returning from checkout sees their Credits even if the webhook was lost. */
export async function getBilling() {
  const workspaceId = requireWorkspaceId();
  await verifyAll(await prisma.topUpPayment.findMany({ where: pendingWhere() }));

  const [balance, payments, unlimitedPeriod] = await Promise.all([
    creditBalance(workspaceId),
    prisma.topUpPayment.findMany({ orderBy: { createdAt: "desc" }, take: paymentHistoryLimit }),
    currentOrLastUnlimitedPeriod(workspaceId),
  ] as const);

  return {
    balance,
    modelRates: modelCatalog,
    packs: topUpPacks,
    payments: payments.map((payment) => toView(payment)),
    paymentsEnabled: Boolean(mayarConfig.apiKey),
    unlimitedPeriod: unlimitedPeriod
      ? { endAt: unlimitedPeriod.endAt, endedEarlyAt: unlimitedPeriod.endedEarlyAt }
      : null,
  };
}

export async function createTopUpCheckout(params: {
  adminEmail: string;
  packId: string;
}): Promise<TopUpPaymentView> {
  const workspaceId = requireWorkspaceId();
  const pack = findTopUpPack(params.packId);
  if (!pack) throw new UnknownTopUpPackError();

  const expiresAt = new Date(Date.now() + checkoutLifetimeMs);
  const credits = new Intl.NumberFormat("en-US").format(pack.credits);
  const remote = await createMayarPayment({
    amount: pack.priceIdr,
    description: `${credits} SupportOps AI Credits`,
    email: params.adminEmail,
    expiredAt: expiresAt,
    name: `SupportOps Top-Up — ${credits} Credits`,
  });

  const payment = await prisma.topUpPayment.create({
    data: {
      amountIdr: pack.priceIdr,
      checkoutUrl: remote.link,
      credits: pack.credits,
      expiresAt,
      id: randomUUID(),
      mayarPaymentId: remote.id,
      packId: pack.id,
      workspaceId,
    },
  });
  return toView(payment);
}

/**
 * Handles a Mayar webhook without trusting it: the payload only picks which
 * payments to re-check. Which id Mayar puts where differs between products,
 * so every id-looking field is tried.
 * ponytail: falls back to re-checking every pending payment across Workspaces
 * when nothing matches — fine while pending checkouts number in the tens.
 */
export async function handleMayarWebhook(payload: unknown) {
  const data = (payload as { data?: Record<string, unknown> } | null)?.data ?? {};
  const candidateIds = [data.id, data.productId, data.paymentLinkId, data.transactionId].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  const matched = candidateIds.length
    ? await unscopedPrisma.topUpPayment.findMany({
        where: { mayarPaymentId: { in: candidateIds }, status: "PENDING" },
      })
    : [];
  await verifyAll(
    matched.length
      ? matched
      : await unscopedPrisma.topUpPayment.findMany({ take: 50, where: pendingWhere() }),
  );
}
