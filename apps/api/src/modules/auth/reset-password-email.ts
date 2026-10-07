import { enqueueAccountEmail } from "./account-email";

/** Better Auth's `sendResetPassword` hook; only a known email ever reaches it. */
export async function sendResetPasswordEmail({
  user,
  url,
}: {
  user: { email: string };
  url: string;
}) {
  await enqueueAccountEmail({
    to: user.email,
    subject: "Reset your SupportOps password",
    text: `Choose a new SupportOps password: ${url}\n\nThis link is valid for 1 hour and can be used once. If you did not ask for it, ignore this email.`,
    html: `<p>Choose a new SupportOps password.</p><p><a href="${url.replace(/&/g, "&amp;")}">Reset my password</a></p><p>This link is valid for 1 hour and can be used once. If you did not ask for it, ignore this email.</p>`,
  });
}
