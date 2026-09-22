import { sendEmail } from "./session-email";
import { prisma } from "./prisma";

export type CreditAlertEmailJob = {
  kind: "LOW_BALANCE" | "CREDIT_EXHAUSTED";
  workspaceId: string;
};

export async function sendCreditAlertEmail({ kind, workspaceId }: CreditAlertEmailJob) {
  const [workspace, admins] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({ select: { name: true }, where: { id: workspaceId } }),
    prisma.user.findMany({
      select: { email: true },
      where: { deletedAt: null, role: "ADMIN", workspaceId },
    }),
  ]);
  if (!admins.length) return;

  const subject =
    kind === "CREDIT_EXHAUSTED"
      ? `${workspace.name}: AI Credits exhausted`
      : `${workspace.name}: AI Credits running low`;
  const text =
    kind === "CREDIT_EXHAUSTED"
      ? "Your workspace has run out of AI Credits. New conversations will escalate to a Human Agent until you top up."
      : "Your workspace's AI Credit balance has dropped below 100. Top up soon to avoid an interruption.";

  await Promise.all(admins.map((admin) => sendEmail({ subject, text, to: admin.email })));
}
