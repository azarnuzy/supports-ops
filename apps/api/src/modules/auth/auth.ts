import { betterAuthConfig } from "../../config";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "../../utils/prisma";

export const auth = betterAuth({
  appName: "SupportOps",
  baseURL: betterAuthConfig.url,
  database: prismaAdapter(prisma, {
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
  secret: betterAuthConfig.secret,
  trustedOrigins: betterAuthConfig.trustedOrigins,
});

export type AuthSession = typeof auth.$Infer.Session.session;
export type AuthUser = typeof auth.$Infer.Session.user;
