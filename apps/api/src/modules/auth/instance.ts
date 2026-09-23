import { betterAuthConfig, operatorAuthConfig } from "../../config";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { unscopedPrisma } from "../../utils/prisma";

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
  },
  user: {
    additionalFields: {
      role: {
        type: ["ADMIN", "HUMAN_AGENT"],
        input: false,
        required: true,
      },
      workspaceId: {
        type: "string",
        input: false,
        required: true,
      },
    },
  },
  // The domain's Session is a Customer's conversation on a Channel, so Better
  // Auth's own sign-in session lives on the AuthSession model instead.
  // The signed cookie cache keeps the session out of the database on every
  // request; 60s is short enough that a revoked session stops working almost
  // immediately, and every session write refreshes the cookie anyway.
  session: { cookieCache: { enabled: true, maxAge: 60 }, modelName: "authSession" },
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
