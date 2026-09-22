import { randomUUID } from "node:crypto";
import { unscopedPrisma } from "../../utils/prisma";

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
