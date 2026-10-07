import { APIError } from "better-auth/api";
import { unscopedPrisma } from "../../utils/prisma";
import { enqueueAccountEmail } from "./account-email";

export const verificationEmailCooldownMs = 60_000;

/** Better Auth's `sendVerificationEmail` hook. Registration and every resend route through it, so the cooldown is enforced once. */
export async function sendVerificationEmail({
  user,
  url,
}: {
  user: { id: string; email: string };
  url: string;
}) {
  const claimed = await unscopedPrisma.user.updateMany({
    where: {
      id: user.id,
      OR: [
        { verificationEmailSentAt: null },
        { verificationEmailSentAt: { lt: new Date(Date.now() - verificationEmailCooldownMs) } },
      ],
    },
    data: { verificationEmailSentAt: new Date() },
  });

  if (claimed.count === 0) {
    throw new APIError("TOO_MANY_REQUESTS", {
      message: "A verification email was just sent. Wait a minute before requesting another.",
    });
  }

  await enqueueAccountEmail({
    to: user.email,
    subject: "Verify your SupportOps email",
    text: `Confirm your email to sign in to SupportOps: ${url}\n\nThis link is valid for 24 hours.`,
    html: `<p>Confirm your email to sign in to SupportOps.</p><p><a href="${url.replace(/&/g, "&amp;")}">Verify my email</a></p><p>This link is valid for 24 hours.</p>`,
  });
}
