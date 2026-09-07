import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  getCurrentUser,
  login,
  logout,
  register,
  updateProfile,
} from "./auth.services";
export const authQueryKey = ["auth"] as const;
export const meQueryOptions = queryOptions({
  queryKey: [...authQueryKey, "me"],
  queryFn: getCurrentUser,
  retry: false,
});
export function useLoginMutation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authQueryKey });
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
      await queryClient.invalidateQueries({ queryKey: authQueryKey });
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
      queryClient.removeQueries({ queryKey: authQueryKey });
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
      void queryClient.invalidateQueries({ queryKey: authQueryKey });
    },
  });
}
