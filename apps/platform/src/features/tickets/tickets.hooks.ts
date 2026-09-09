import type { ListTicketsFilters } from "@repo/api-client";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryKeys } from "../../lib/query-keys";
import {
  claimTicket,
  generateSuggestedReply,
  getLiveAiTickets,
  getMyTickets,
  getSharedHumanQueue,
  getTicketDetail,
  getTickets,
  reassignTicket,
  resolveHumanTicket,
  retryHumanReply,
  sendHumanReply,
  sendHumanAttachments,
  takeOverTicket,
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

export const liveAiTicketsQueryOptions = queryOptions({
  queryFn: getLiveAiTickets,
  queryKey: queryKeys.workspace.liveAiTickets,
});

export function ticketsQueryOptions(filters: ListTicketsFilters) {
  return queryOptions({
    queryFn: () => getTickets(filters),
    queryKey: [...queryKeys.workspace.tickets, filters] as const,
  });
}

export function ticketDetailQueryOptions(id: string) {
  return queryOptions({
    queryFn: () => getTicketDetail(id),
    queryKey: queryKeys.workspace.ticket(id),
  });
}

function useTicketInvalidation() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.sharedHumanQueue }),
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.myTickets }),
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.liveAiTickets }),
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.tickets }),
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
  return useMutation({ mutationFn: claimTicket, onSettled: invalidate });
}

export function useReassignTicketMutation() {
  const invalidate = useTicketInvalidation();
  return useMutation({ mutationFn: reassignTicket, onSuccess: invalidate });
}

export function useTakeOverTicketMutation() {
  const invalidate = useTicketInvalidation();
  return useMutation({ mutationFn: takeOverTicket, onSuccess: invalidate });
}

export function useSendHumanReplyMutation() {
  const invalidate = useTicketInvalidation();
  return useMutation({ mutationFn: sendHumanReply, onSuccess: invalidate });
}

export function useSendHumanAttachmentsMutation() {
  const invalidate = useTicketInvalidation();
  return useMutation({ mutationFn: sendHumanAttachments, onSuccess: invalidate });
}

export function useRetryHumanReplyMutation() {
  const invalidate = useTicketInvalidation();
  return useMutation({ mutationFn: retryHumanReply, onSuccess: invalidate });
}

export function useGenerateSuggestedReplyMutation() {
  return useMutation({ mutationFn: generateSuggestedReply });
}

export function useResolveHumanTicketMutation() {
  const invalidate = useTicketInvalidation();
  return useMutation({ mutationFn: resolveHumanTicket, onSuccess: invalidate });
}
