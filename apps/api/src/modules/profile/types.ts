import type { Role } from "../../utils/prisma";

export type ProfileUser = {
  createdAt: Date;
  email: string;
  emailVerified: boolean;
  id: string;
  image: string | null;
  name: string;
  role: Role;
  updatedAt: Date;
};

export type ProfileResponse = {
  user: ProfileUser;
};
