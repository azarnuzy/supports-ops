import { activeWorkspaceStorageKey } from "@repo/api-client";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { queryKeys } from "../../lib/query-keys";
import {
  acceptInvitation,
  continueWithGoogle,
  getAuthProviders,
  getCurrentUser,
  getInvitation,
  getPendingInvitations,
  getWorkspaceUsers,
  login,
  changePassword,
  logout,
  register,
  requestPasswordReset,
  resendPendingInvitation,
  resendVerificationEmail,
  resetPassword,
  revokePendingInvitation,
  sendInvitation,
  setPassword,
  updateProfile,
} from "./auth.services";
export const meQueryOptions = queryOptions({
  queryKey: queryKeys.auth.me,
  queryFn: getCurrentUser,
  retry: false,
});
export const authProvidersQueryOptions = queryOptions({
  queryKey: ["auth-providers"] as const,
  queryFn: getAuthProviders,
  staleTime: Infinity,
});
export const workspaceUsersQueryOptions = queryOptions({
  queryKey: queryKeys.workspace.users,
  queryFn: getWorkspaceUsers,
});
export function useLoginMutation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: async () => {
      // A Workspace switch (#270) belongs to whoever picked it — never carry
      // it over to whichever account signs in next on this tab.
      sessionStorage.removeItem(activeWorkspaceStorageKey);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
      await navigate({ to: "/" });
    },
  });
}
export function useRegisterMutation() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: register,
    onSuccess: (_data, { email }) => navigate({ to: "/check-inbox", search: { email } }),
  });
}
export function useLogoutMutation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      sessionStorage.removeItem(activeWorkspaceStorageKey);
      queryClient.removeQueries({ queryKey: queryKeys.auth.all });
      await navigate({ to: "/login" });
    },
  });
}
export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateProfile,
    onSuccess: (user) => {
      queryClient.setQueryData(meQueryOptions.queryKey, (current) => ({ ...current, ...user }));
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
    },
  });
}

export const pendingInvitationsQueryOptions = queryOptions({
  queryKey: queryKeys.workspace.invitations,
  queryFn: getPendingInvitations,
});

export const invitationQueryOptions = (token: string) =>
  queryOptions({
    queryKey: ["invitation", token],
    queryFn: () => getInvitation(token),
    retry: false,
  });

export function useInvitationMutations() {
  const queryClient = useQueryClient();
  const onSuccess = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.invitations }),
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.users }),
    ]);
  return {
    invite: useMutation({ mutationFn: sendInvitation, onSuccess }),
    resend: useMutation({ mutationFn: resendPendingInvitation, onSuccess }),
    revoke: useMutation({ mutationFn: revokePendingInvitation, onSuccess }),
  };
}

export function useAcceptInvitationMutation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: acceptInvitation,
    onSuccess: async () => {
      sessionStorage.removeItem(activeWorkspaceStorageKey);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
      await navigate({ to: "/" });
    },
  });
}

export function useResendVerificationMutation() {
  return useMutation({ mutationFn: resendVerificationEmail });
}

export function useRequestPasswordResetMutation() {
  return useMutation({ mutationFn: requestPasswordReset });
}

export function useResetPasswordMutation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resetPassword,
    onSuccess: async () => {
      sessionStorage.removeItem(activeWorkspaceStorageKey);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
      await navigate({ to: "/" });
    },
  });
}

export function useChangePasswordMutation() {
  return useMutation({ mutationFn: changePassword });
}

export function useGoogleMutation() {
  return useMutation({ mutationFn: (invitationToken?: string) => continueWithGoogle(invitationToken) });
}
export function useSetPasswordMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setPassword,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.auth.all }),
  });
}
