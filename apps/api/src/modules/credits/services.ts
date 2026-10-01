import { randomUUID } from "node:crypto";
import { type Prisma, unscopedPrisma } from "../../utils/prisma";
import { modelRateFor, resolveAgentModelId } from "../ai-agent/model-catalog";
import { enqueueCreditAlertEmail } from "./alerts-queue";

export const trialGrantCredits = 500;
export const lowBalanceThreshold = 100;

export class WorkspaceNotFoundError extends Error {}
export class InvalidTopUpAmountError extends Error {}

export async function organizationIdForWorkspace(
  tx: Pick<typeof unscopedPrisma, "workspace">,
  workspaceId: string,
) {
  const workspace = await tx.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { organizationId: true },
  });
  return workspace.organizationId;
}

export async function recordTopUp(
  tx: Pick<typeof unscopedPrisma, "creditLedgerEntry" | "workspace">,
  workspaceId: string,
  credits: number,
  note: string,
) {
  if (!Number.isInteger(credits) || credits <= 0) throw new InvalidTopUpAmountError();
  return tx.creditLedgerEntry.create({
    data: {
      id: randomUUID(),
      organizationId: await organizationIdForWorkspace(tx, workspaceId),
      workspaceId,
      type: "TOP_UP",
      credits,
      note,
    },
  });
}

/** Written in the registration transaction, once per Organization. */
export async function grantTrialCredits(
  tx: Pick<typeof unscopedPrisma, "creditLedgerEntry">,
  organizationId: string,
  workspaceId: string,
) {
  await tx.creditLedgerEntry.create({
    data: {
      id: randomUUID(),
      organizationId,
      workspaceId,
      type: "TRIAL_GRANT",
      credits: trialGrantCredits,
    },
  });
}

/** The balance is always the ledger sum, never a separately stored number. */
export async function creditBalance(workspaceId: string) {
  return balanceWithin(
    unscopedPrisma,
    await organizationIdForWorkspace(unscopedPrisma, workspaceId),
  );
}

export async function hasActiveUnlimitedPeriod(workspaceId: string) {
  return Boolean(
    await unscopedPrisma.unlimitedPeriod.findFirst({
      where: {
        organizationId: await organizationIdForWorkspace(unscopedPrisma, workspaceId),
        endedEarlyAt: null,
        OR: [{ endAt: null }, { endAt: { gt: new Date() } }],
      },
      select: { id: true },
    }),
  );
}

async function balanceWithin(
  tx: Pick<typeof unscopedPrisma, "creditLedgerEntry">,
  organizationId: string,
) {
  const { _sum } = await tx.creditLedgerEntry.aggregate({
    where: { organizationId },
    _sum: { credits: true },
  });

  return _sum.credits ?? 0;
}

/** Crossing below zero and crossing below the low-balance threshold each email
 * every Admin once: only the spend that carries the balance across the line
 * fires, so it never repeats until a Top-Up lifts the balance back up and a
 * later spend crosses it again. */
async function notifyBalanceCrossing(
  organizationId: string,
  workspaceId: string,
  balanceBefore: number,
  balanceAfter: number,
) {
  if (balanceBefore > 0 && balanceAfter <= 0) {
    await enqueueCreditAlertEmail({ kind: "CREDIT_EXHAUSTED", organizationId, workspaceId });
    return;
  }
  if (balanceBefore >= lowBalanceThreshold && balanceAfter < lowBalanceThreshold) {
    await enqueueCreditAlertEmail({ kind: "LOW_BALANCE", organizationId, workspaceId });
  }
}

/** What one successful Judge model call costs, in Credits. Platform-defined and independent of the
 * Agent Model's Model Rate (ADR-0027): an Admin predicts Judge spend by counting Judge calls. */
export const judgeCreditRate = 1;

type SpendTx = Pick<
  typeof unscopedPrisma,
  "creditLedgerEntry" | "organization" | "unlimitedPeriod" | "workspace"
>;

/** One SPEND ledger entry at `rate`, free during an Unlimited Period (still recorded, so what it
 * would have cost stays visible). Serializes spends across Workspaces before reading the balance. */
async function recordSpend(
  tx: SpendTx,
  workspaceId: string,
  rate: number,
  data: Omit<
    Prisma.CreditLedgerEntryUncheckedCreateInput,
    "credits" | "id" | "organizationId" | "type" | "workspaceId"
  >,
) {
  const organizationId = await organizationIdForWorkspace(tx, workspaceId);
  const unlimited = await tx.unlimitedPeriod.findFirst({
    where: {
      organizationId,
      endedEarlyAt: null,
      OR: [{ endAt: null }, { endAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  const credits = unlimited ? 0 : rate;
  if (!unlimited) {
    await tx.organization.update({
      where: { id: organizationId },
      data: { updatedAt: new Date() },
    });
  }
  const balanceBefore = unlimited ? 0 : await balanceWithin(tx, organizationId);
  await tx.creditLedgerEntry.create({
    data: {
      ...data,
      credits: -credits,
      id: randomUUID(),
      organizationId,
      type: "SPEND",
      workspaceId,
    },
  });
  if (unlimited) return;
  await notifyBalanceCrossing(organizationId, workspaceId, balanceBefore, balanceBefore - rate);
}

/** Written for every AI Turn that finishes with a decision (reply, escalate,
 * resolve) and for every Follow-Up, at the Agent Model's Model Rate. Callers
 * only invoke this for a genuine decision — a Turn aborted by Takeover or
 * failed by a provider error must never reach it. */
export async function spendForTurn(
  tx: SpendTx,
  params: {
    aiAgentId: string;
    agentModel: string | null;
    channel?: "WEB" | "WHATSAPP" | null;
    /** Set for an Eval Run's spend, so it stays attributable after the scratch Ticket is removed. */
    evalRunId?: string | null;
    providerCostUsd?: number | null;
    sessionId: string;
    ticketId: string;
    /** Provider-reported Tokens for the whole Turn; absent for a Follow-Up, which calls no model. */
    usage?: { cachedInputTokens: number; inputTokens: number; outputTokens: number } | null;
    workspaceId: string;
  },
) {
  const agentModel = resolveAgentModelId(params.agentModel);
  const rate = modelRateFor(agentModel);
  await recordSpend(tx, params.workspaceId, rate, {
    agentModel,
    aiAgentId: params.aiAgentId,
    cachedInputTokens: params.usage?.cachedInputTokens ?? null,
    channel: params.channel ?? null,
    chargeKind: params.evalRunId ? "AI_TURN" : null,
    evalRunId: params.evalRunId ?? null,
    inputTokens: params.usage?.inputTokens ?? null,
    modelRate: rate,
    outputTokens: params.usage?.outputTokens ?? null,
    providerCostUsd: params.providerCostUsd ?? null,
    sessionId: params.sessionId,
    ticketId: params.ticketId,
  });
}

/** Written for each successful Judge model call in an Eval Run, at the platform Judge rate, so a
 * metric that calls the Judge several times is charged for every one that succeeded. A failed call
 * never reaches it. The actual model usage is kept, and the entry is attributed to the Run and Case
 * independently of any scratch Ticket. */
export async function spendForJudgeCall(
  tx: SpendTx,
  params: {
    caseKey: string;
    evalRunId: string;
    judgeModel: string;
    usage?: { cachedInputTokens: number; inputTokens: number; outputTokens: number } | null;
    workspaceId: string;
  },
) {
  await recordSpend(tx, params.workspaceId, judgeCreditRate, {
    cachedInputTokens: params.usage?.cachedInputTokens ?? null,
    chargeKind: "JUDGE",
    evalCaseKey: params.caseKey,
    evalRunId: params.evalRunId,
    inputTokens: params.usage?.inputTokens ?? null,
    judgeModel: params.judgeModel,
    modelRate: judgeCreditRate,
    outputTokens: params.usage?.outputTokens ?? null,
  });
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

  await recordTopUp(unscopedPrisma, workspace.id, credits, note);

  return creditBalance(workspace.id);
}
