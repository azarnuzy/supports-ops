import {
  createApiClient,
  acceptInvitation as acceptInvitationRequest,
  EmailAlreadyInUseApiError,
  fetchInvitation,
  inviteUser,
  listPendingInvitations,
  resendInvitation,
  revokeInvitation,
  EmailUnverifiedApiError,
  fetchAuthProviders,
  fetchSessionUser,
  listWorkspaceUsers,
  updateWorkspaceUser,
  removeWorkspaceUser,
  updateOrganizationAdmin,
  registerWorkspaceAdmin,
  setCurrentUserPassword,
  UnauthorizedApiError,
  updateCurrentUserProfile,
} from "@repo/api-client";
import { createAuthClient } from "better-auth/react";
import type { AuthUser, LoginInput, RegisterInput, Role, UpdateProfileInput } from "./auth.types";
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
export async function setWorkspaceUserRole(userId: string, role: "ADMIN" | "HUMAN_AGENT") {
  return updateWorkspaceUser(apiClient, userId, role);
}
export async function deleteWorkspaceUser(userId: string) {
  return removeWorkspaceUser(apiClient, userId);
}
export async function setOrganizationAdminRole(userId: string, enabled: boolean) {
  return updateOrganizationAdmin(apiClient, userId, enabled);
}
export const getPendingInvitations = () => listPendingInvitations(apiClient);
export const sendInvitation = (input: { email: string; role: Role }) =>
  inviteUser(apiClient, input);
export const resendPendingInvitation = (id: string) => resendInvitation(apiClient, id);
export const revokePendingInvitation = (id: string) => revokeInvitation(apiClient, id);
export const getInvitation = (token: string) => fetchInvitation(apiClient, token);
export const acceptInvitation = (input: { token: string; name: string; password: string }) =>
  acceptInvitationRequest(apiClient, input.token, { name: input.name, password: input.password });
export async function login(input: LoginInput) {
  const { error } = await authClient.signIn.email(input);
  if (error?.code === "EMAIL_NOT_VERIFIED") throw new EmailNotVerifiedError();
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
    if (error instanceof EmailUnverifiedApiError) throw error;
    if (error instanceof EmailAlreadyInUseApiError) throw new Error(error.message);
    throw error;
  }
}
export class EmailNotVerifiedError extends Error {
  constructor() {
    super("Email not verified");
    this.name = "EmailNotVerifiedError";
  }
}
export { EmailUnverifiedApiError };
/** Emails a fresh verification link. The API refuses a second one within 60 s. */
export async function resendVerificationEmail(email: string) {
  const { error } = await authClient.sendVerificationEmail({
    email,
    callbackURL: `${window.location.origin}/verify-email`,
  });
  if (error) throw new Error(error.message ?? "Could not send the verification email.");
}
export async function changePassword(input: { currentPassword: string; newPassword: string }) {
  const { error } = await authClient.changePassword({ ...input, revokeOtherSessions: true });
  if (error?.code === "INVALID_PASSWORD") throw new Error("Current password is incorrect.");
  if (error) throw new Error(error.message ?? "Failed to change password.");
}
export async function getAuthProviders() {
  return fetchAuthProviders(apiClient);
}
export async function setPassword(newPassword: string) {
  await setCurrentUserPassword(apiClient, newPassword);
}
/** Redirects to Google; the same call signs in a known email and registers an unknown one. */
export async function continueWithGoogle() {
  const { error } = await authClient.signIn.social({
    provider: "google",
    callbackURL: `${window.location.origin}/`,
    errorCallbackURL: `${window.location.origin}/login`,
  });
  if (error) throw new Error(error.message ?? "Could not continue with Google.");
}
export async function logout() {
  const { error } = await authClient.signOut();
  if (error) throw new Error(error.message ?? "Failed to log out.");
}
