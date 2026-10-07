import { activeWorkspaceStorageKey } from "@repo/api-client";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { queryKeys } from "../../lib/query-keys";
import {
  createHumanAgent,
  getCurrentUser,
  getWorkspaceUsers,
  login,
  logout,
  register,
  requestPasswordReset,
  resendVerificationEmail,
  resetPassword,
  updateProfile,
} from "./auth.services";
export const meQueryOptions = queryOptions({
  queryKey: queryKeys.auth.me,
  queryFn: getCurrentUser,
  retry: false,
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

export function useCreateHumanAgentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createHumanAgent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.workspace.users }),
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
