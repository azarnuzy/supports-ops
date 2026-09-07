import type { Role } from "../../utils/prisma";

export type UserListItem = {
  createdAt: Date;
  email: string;
  id: string;
  name: string;
  role: Role;
  updatedAt: Date;
};

export type UsersResponse = {
  nextCursor: string | null;
  users: UserListItem[];
};
