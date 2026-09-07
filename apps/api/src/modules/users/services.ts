import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { type Prisma, prisma, unscopedPrisma } from "../../utils/prisma";
import type { CreateHumanAgentInput } from "./schema";
import type { HumanAgentResponse, UsersResponse } from "./types";
import { usersListDefaultLimit } from "./utils";

export type ListRecentUsersInput = {
  cursor?: string;
  limit?: number;
};

export class InvalidUsersCursorError extends Error {
  constructor() {
    super("Invalid users cursor.");
    this.name = "InvalidUsersCursorError";
  }
}

export class HumanAgentEmailAlreadyInUseError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "HumanAgentEmailAlreadyInUseError";
  }
}

export async function createHumanAgent(
  workspaceId: string,
  input: CreateHumanAgentInput,
): Promise<HumanAgentResponse> {
  const existingUser = await unscopedPrisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (existingUser) {
    throw new HumanAgentEmailAlreadyInUseError();
  }

  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  const userId = randomUUID();

  try {
    const user = await unscopedPrisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: input.email,
          id: userId,
          name: input.name,
          role: "HUMAN_AGENT",
          workspaceId,
        },
      });

      await tx.account.create({
        data: {
          accountId: userId,
          createdAt: now,
          id: randomUUID(),
          password: passwordHash,
          providerId: "credential",
          updatedAt: now,
          userId,
        },
      });

      return createdUser;
    });

    return { user };
  } catch (error) {
    if (isEmailUniqueConstraintViolation(error)) {
      throw new HumanAgentEmailAlreadyInUseError();
    }

    throw error;
  }
}

export async function listRecentUsers({
  cursor,
  limit = usersListDefaultLimit,
}: ListRecentUsersInput = {}): Promise<UsersResponse> {
  const cursorUser = cursor
    ? await prisma.user.findUnique({
        where: { id: cursor },
        select: { createdAt: true, id: true },
      })
    : null;

  if (cursor && !cursorUser) {
    throw new InvalidUsersCursorError();
  }

  const where: Prisma.UserWhereInput | undefined = cursorUser
    ? {
        OR: [
          { createdAt: { lt: cursorUser.createdAt } },
          {
            createdAt: cursorUser.createdAt,
            id: { lt: cursorUser.id },
          },
        ],
      }
    : undefined;

  const users = await prisma.user.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    where,
  });

  const visibleUsers = users.slice(0, limit);

  return {
    nextCursor: users.length > limit ? (visibleUsers.at(-1)?.id ?? null) : null,
    users: visibleUsers.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })),
  };
}

function isEmailUniqueConstraintViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    (error.meta?.target as string[] | undefined)?.includes("email")
  );
}
