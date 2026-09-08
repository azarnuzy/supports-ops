import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryKeys } from "../../lib/query-keys";
import {
  claimTicket,
  getMyTickets,
  getSharedHumanQueue,
  reassignTicket,
  subscribeToSharedHumanQueue,
} from "./tickets.services";

export const sharedHumanQueueQueryOptions = queryOptions({
  queryFn: getSharedHumanQueue,
  queryKey: queryKeys.workspace.sharedHumanQueue,
});

export const myTicketsQueryOptions = queryOptions({
  queryFn: getMyTickets,
  queryKey: queryKeys.workspace.myTickets,
});

function useTicketInvalidation() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.sharedHumanQueue }),
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.myTickets }),
    ]);
}

export function useSharedHumanQueueEvents() {
  useTicketEvents();
}

export function useTicketEvents() {
  const invalidate = useTicketInvalidation();
  useEffect(() => subscribeToSharedHumanQueue(() => void invalidate()), [invalidate]);
}

export function useClaimTicketMutation() {
  const invalidate = useTicketInvalidation();
  return useMutation({ mutationFn: claimTicket, onSuccess: invalidate });
}

export function useReassignTicketMutation() {
  const invalidate = useTicketInvalidation();
  return useMutation({ mutationFn: reassignTicket, onSuccess: invalidate });
}
