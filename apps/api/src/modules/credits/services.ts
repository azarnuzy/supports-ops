import { randomUUID } from "node:crypto";
import { unscopedPrisma } from "../../utils/prisma";
import { modelRateFor, resolveAgentModelId } from "../ai-agent/model-catalog";

export const trialGrantCredits = 500;

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
  const { _sum } = await unscopedPrisma.creditLedgerEntry.aggregate({
    where: { workspaceId },
    _sum: { credits: true },
  });

  return _sum.credits ?? 0;
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
  await tx.creditLedgerEntry.create({
    data: {
      agentModel,
      aiAgentId: params.aiAgentId,
      credits: -modelRateFor(agentModel),
      id: randomUUID(),
      modelRate: modelRateFor(agentModel),
      providerCostUsd: params.providerCostUsd ?? null,
      sessionId: params.sessionId,
      ticketId: params.ticketId,
      type: "SPEND",
      workspaceId: params.workspaceId,
    },
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
