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
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
      await navigate({ to: "/" });
    },
  });
}
export function useRegisterMutation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: register,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
      await navigate({ to: "/" });
    },
  });
}
export function useLogoutMutation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: async () => {
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
      queryClient.setQueryData(meQueryOptions.queryKey, user);
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
