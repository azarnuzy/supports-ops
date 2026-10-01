import { sendEmail } from "./session-email";
import { prisma } from "./prisma";

export type CreditAlertEmailJob = {
  kind: "LOW_BALANCE" | "CREDIT_EXHAUSTED";
  organizationId: string;
  workspaceId: string;
};

export async function sendCreditAlertEmail({
  kind,
  organizationId,
  workspaceId,
}: CreditAlertEmailJob) {
  const [organization, admins] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      select: { name: true },
      where: { id: organizationId },
    }),
    prisma.user.findMany({
      select: { email: true },
      where: { deletedAt: null, isOrganizationAdmin: true, organizationId },
    }),
  ]);
  if (!admins.length) return;

  const subject =
    kind === "CREDIT_EXHAUSTED"
      ? `${organization.name}: AI Credits exhausted`
      : `${organization.name}: AI Credits running low`;
  const text =
    kind === "CREDIT_EXHAUSTED"
      ? "Your Organization has run out of AI Credits. New conversations will escalate to a Human Agent until you top up."
      : "Your Organization's AI Credit balance has dropped below 100. Top up soon to avoid an interruption.";

  await Promise.all(
    admins.map((admin) => sendEmail({ subject, text, to: admin.email, workspaceId })),
  );
}
