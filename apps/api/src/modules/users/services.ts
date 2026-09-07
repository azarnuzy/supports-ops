import { type Prisma, prisma } from "../../utils/prisma";
import type { UsersResponse } from "./types";
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
