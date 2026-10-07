import { betterAuthConfig, googleAuthConfig, operatorAuthConfig } from "../../config";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { unscopedPrisma } from "../../utils/prisma";
import { sendResetPasswordEmail } from "./reset-password-email";
import { googleUserHooks } from "./google";
import { sendVerificationEmail } from "./verification-email";

export const auth = betterAuth({
  appName: "SupportOps",
  baseURL: betterAuthConfig.url,
  database: prismaAdapter(unscopedPrisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    // Registration goes through the /register endpoint so a Workspace and
    // Admin are created together in one transaction; the built-in sign-up
    // route would create a User with no Workspace.
    disableSignUp: true,
    requireEmailVerification: true,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: sendResetPasswordEmail,
    // The link proved ownership of the inbox, so an unverified user can sign in right after.
    onPasswordReset: async ({ user }) => {
      await unscopedPrisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
    },
  },
  // Better Auth limits in production only (sign-in is 3 per 10s per IP by default);
  // AUTH_RATE_LIMIT=on forces it for tests.
  rateLimit: {
    enabled: process.env.AUTH_RATE_LIMIT === "on" || undefined,
    customRules: { "/request-password-reset": { window: 60, max: 3 } },
  },
  // Registration and resend send the email explicitly, so it is never sent on
  // sign-in or sign-up; the link signs the user straight in.
  emailVerification: {
    autoSignInAfterVerification: true,
    expiresIn: 24 * 60 * 60,
    sendVerificationEmail,
  },
  socialProviders: googleAuthConfig ? { google: googleAuthConfig } : {},
  // A Google email matching an existing User signs into that account; Better
  // Auth only links when the local email is verified, so an unverified form
  // registration cannot be taken over by whoever controls the Google email.
  account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
  databaseHooks: { user: { create: googleUserHooks } },
  user: {
    // Placeholder defaults only satisfy Better Auth's required-field check
    // before the Google user hook (./google) assigns the real Organization.
    additionalFields: {
      role: {
        type: ["ADMIN", "HUMAN_AGENT"],
        input: false,
        required: true,
        defaultValue: "ADMIN",
      },
      organizationId: { type: "string", input: false, required: true, defaultValue: "" },
      isOrganizationAdmin: {
        type: "boolean",
        input: false,
        required: true,
        defaultValue: true,
      },
    },
  },
  // The domain's Session is a Customer's conversation on a Channel, so Better
  // Auth's own sign-in session lives on the AuthSession model instead.
  // No cookie cache: loadAuthSession already reads the database on every
  // request, and a cache would keep a revoked session (e.g. after a password
  // change) valid until it expires.
  session: { modelName: "authSession" },
  secret: betterAuthConfig.secret,
  trustedOrigins: betterAuthConfig.trustedOrigins,
});

export const operatorAuth = betterAuth({
  appName: "SupportOps Console",
  baseURL: new URL("/operator/auth", operatorAuthConfig.url).toString(),
  database: prismaAdapter(unscopedPrisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, disableSignUp: true },
  user: {
    modelName: "operator",
    additionalFields: {
      disabledAt: { type: "date", input: false, required: false },
    },
  },
  session: { expiresIn: 8 * 60 * 60, modelName: "operatorSession" },
  account: { modelName: "operatorAccount" },
  advanced: { cookiePrefix: "supportops-operator" },
  secret: operatorAuthConfig.secret,
  trustedOrigins: operatorAuthConfig.trustedOrigins,
});
