import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { Prisma, unscopedPrisma } from "../../utils/prisma";
import type { RegisterInput } from "./schema";

export class EmailAlreadyInUseError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "EmailAlreadyInUseError";
  }
}

export async function registerAdminWorkspace(input: RegisterInput) {
  const existingUser = await unscopedPrisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (existingUser) {
    throw new EmailAlreadyInUseError();
  }

  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  try {
    return await unscopedPrisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          id: randomUUID(),
          name: workspaceNameFor(input.name),
          slug: workspaceSlugFor(input.name),
        },
      });

      const userId = randomUUID();

      const user = await tx.user.create({
        data: {
          id: userId,
          name: input.name,
          email: input.email,
          role: "ADMIN",
          workspaceId: workspace.id,
        },
      });

      await tx.account.create({
        data: {
          id: randomUUID(),
          accountId: userId,
          providerId: "credential",
          userId,
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        },
      });

      return { user, workspace };
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error, "email")) {
      throw new EmailAlreadyInUseError();
    }

    throw error;
  }
}

function workspaceNameFor(adminName: string) {
  return `${adminName}'s Workspace`;
}

function workspaceSlugFor(adminName: string) {
  const base = adminName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = randomBytes(4).toString("hex");

  return `${base || "workspace"}-${suffix}`;
}

function isUniqueConstraintViolation(error: unknown, field: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    (error.meta?.target as string[] | undefined)?.includes(field)
  );
}
