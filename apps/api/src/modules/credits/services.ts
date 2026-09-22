import { randomUUID } from "node:crypto";
import { unscopedPrisma } from "../../utils/prisma";
import { modelRateFor, resolveAgentModelId } from "../ai-agent/model-catalog";
import { enqueueCreditAlertEmail } from "./alerts-queue";

export const trialGrantCredits = 500;
const lowBalanceThreshold = 100;

export class WorkspaceNotFoundError extends Error {}
export class InvalidTopUpAmountError extends Error {}

/** Written in the same transaction that creates the Workspace, so a Workspace never
 * exists without its balance. */
export async function grantTrialCredits(
  tx: Pick<typeof unscopedPrisma, "creditLedgerEntry">,
  workspaceId: string,
) {
  await tx.creditLedgerEntry.create({
    data: {
      id: randomUUID(),
      workspaceId,
      type: "TRIAL_GRANT",
      credits: trialGrantCredits,
    },
  });
}

/** The balance is always the ledger sum, never a separately stored number. */
export async function creditBalance(workspaceId: string) {
  return balanceWithin(unscopedPrisma, workspaceId);
}

async function balanceWithin(
  tx: Pick<typeof unscopedPrisma, "creditLedgerEntry">,
  workspaceId: string,
) {
  const { _sum } = await tx.creditLedgerEntry.aggregate({
    where: { workspaceId },
    _sum: { credits: true },
  });

  return _sum.credits ?? 0;
}

/** Crossing below zero and crossing below the low-balance threshold each email
 * every Admin once: only the spend that carries the balance across the line
 * fires, so it never repeats until a Top-Up lifts the balance back up and a
 * later spend crosses it again. */
async function notifyBalanceCrossing(
  workspaceId: string,
  balanceBefore: number,
  balanceAfter: number,
) {
  if (balanceBefore > 0 && balanceAfter <= 0) {
    await enqueueCreditAlertEmail({ kind: "CREDIT_EXHAUSTED", workspaceId });
    return;
  }
  if (balanceBefore >= lowBalanceThreshold && balanceAfter < lowBalanceThreshold) {
    await enqueueCreditAlertEmail({ kind: "LOW_BALANCE", workspaceId });
  }
}

/** Written for every AI Turn that finishes with a decision (reply, escalate,
 * resolve) and for every Follow-Up, at the Agent Model's Model Rate. Callers
 * only invoke this for a genuine decision — a Turn aborted by Takeover or
 * failed by a provider error must never reach it. */
export async function spendForTurn(
  tx: Pick<typeof unscopedPrisma, "creditLedgerEntry">,
  params: {
    aiAgentId: string;
    agentModel: string | null;
    providerCostUsd?: number | null;
    sessionId: string;
    ticketId: string;
    workspaceId: string;
  },
) {
  const agentModel = resolveAgentModelId(params.agentModel);
  const rate = modelRateFor(agentModel);
  const balanceBefore = await balanceWithin(tx, params.workspaceId);
  await tx.creditLedgerEntry.create({
    data: {
      agentModel,
      aiAgentId: params.aiAgentId,
      credits: -rate,
      id: randomUUID(),
      modelRate: rate,
      providerCostUsd: params.providerCostUsd ?? null,
      sessionId: params.sessionId,
      ticketId: params.ticketId,
      type: "SPEND",
      workspaceId: params.workspaceId,
    },
  });
  await notifyBalanceCrossing(params.workspaceId, balanceBefore, balanceBefore - rate);
}

/** The operator Top-Up path (`pnpm credits:top-up`). Runs outside any Workspace
 * request context, so it looks the Workspace up by slug and reads/writes unscoped. */
export async function topUpBySlug(slug: string, credits: number, note: string) {
  if (!Number.isInteger(credits) || credits <= 0) {
    throw new InvalidTopUpAmountError();
  }

  const workspace = await unscopedPrisma.workspace.findUnique({ where: { slug } });

  if (!workspace) {
    throw new WorkspaceNotFoundError();
  }

  await unscopedPrisma.creditLedgerEntry.create({
    data: {
      id: randomUUID(),
      workspaceId: workspace.id,
      type: "TOP_UP",
      credits,
      note,
    },
  });

  return creditBalance(workspace.id);
}
