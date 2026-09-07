import {
  createApiClient,
  createWorkspaceHumanAgent,
  EmailAlreadyInUseApiError,
  fetchSessionUser,
  listWorkspaceUsers,
  registerWorkspaceAdmin,
  UnauthorizedApiError,
  updateCurrentUserProfile,
} from "@repo/api-client";
import { createAuthClient } from "better-auth/react";
import type {
  AuthUser,
  CreateHumanAgentInput,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
} from "./auth.types";
const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const apiClient = createApiClient(apiBaseUrl);
const authClient = createAuthClient({ baseURL: apiBaseUrl });
export { UnauthorizedApiError as UnauthorizedError };
export async function getCurrentUser() {
  return (await fetchSessionUser(apiClient)) as AuthUser;
}
export async function updateProfile(input: UpdateProfileInput) {
  return (await updateCurrentUserProfile(apiClient, input)) as AuthUser;
}
export async function getWorkspaceUsers() {
  return listWorkspaceUsers(apiClient);
}
export async function createHumanAgent(input: CreateHumanAgentInput) {
  try {
    return await createWorkspaceHumanAgent(apiClient, input);
  } catch (error) {
    if (error instanceof EmailAlreadyInUseApiError) throw new Error(error.message);
    throw error;
  }
}
export async function login(input: LoginInput) {
  const { error } = await authClient.signIn.email(input);
  if (error) throw new Error(error.message ?? "Authentication failed.");
  return getCurrentUser();
}
export async function register(input: RegisterInput) {
  try {
    await registerWorkspaceAdmin(apiClient, {
      email: input.email,
      name: input.name.trim(),
      password: input.password,
    });
  } catch (error) {
    if (error instanceof EmailAlreadyInUseApiError) throw new Error(error.message);
    throw error;
  }
  return getCurrentUser();
}
export async function logout() {
  const { error } = await authClient.signOut();
  if (error) throw new Error(error.message ?? "Failed to log out.");
}
