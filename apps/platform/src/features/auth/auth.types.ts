export type AuthUser = { createdAt: string; email: string; emailVerified?: boolean; id: string; image?: string | null; name: string; role?: string | null; updatedAt: string; };
export type LoginInput = { email: string; password: string; };
export type RegisterInput = { email: string; password: string; name?: string; };
export type UpdateProfileInput = { image?: string | null; name: string; };
