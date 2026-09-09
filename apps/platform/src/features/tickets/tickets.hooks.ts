import type { ListTicketsFilters, TicketDetail } from "@repo/api-client";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { queryKeys } from "../../lib/query-keys";
import {
  claimTicket,
  generateSuggestedReply,
  getLiveAiTickets,
  getMyTickets,
  getSharedHumanQueue,
  getTicketDetail,
  getTickets,
  markTicketRead,
  reassignTicket,
  resolveHumanTicket,
  retryHumanReply,
  sendHumanReply,
  sendHumanAttachments,
  subscribeToTicketEvents,
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

/** Realtime for the currently open Ticket: new Messages, delivery, and
 * status changes refetch the detail query rather than patching the cache in
 * place, so duplicate or out-of-order SSE delivery can never duplicate or
 * misorder rendered Messages — the refetch always reflects the database. */
export function useTicketDetailEvents(ticketId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidateLists = useTicketInvalidation();
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    if (!ticketId) return;
    setReconnecting(false);
    const onEvent = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspace.ticket(ticketId) });
      void invalidateLists();
    };
    return subscribeToTicketEvents(ticketId, onEvent, setReconnecting);
  }, [invalidateLists, queryClient, ticketId]);

  return { reconnecting };
}

/** Marks a Ticket read only while its view is active, the browser is
 * focused, and there is a newest position to advance to — never while
 * backgrounded or on a different Ticket.
 * ponytail: assumes the transcript is scrolled to the newest Message (the
 * scroller already pins to bottom), rather than tracking visibility of the
 * last bubble with an IntersectionObserver — add that if the scroller ever
 * stops auto-pinning. */
export function useMarkTicketReadOnView(ticket: TicketDetail | undefined) {
  const queryClient = useQueryClient();
  const lastSent = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!ticket) return;
    const latestPosition = ticket.messages.at(-1)?.position;
    if (latestPosition === undefined) return;
    const key = `${ticket.id}:${latestPosition}`;

    const attempt = () => {
      if (lastSent.current === key) return;
      if (document.visibilityState !== "visible" || !document.hasFocus()) return;
      lastSent.current = key;
      void markTicketRead({ id: ticket.id, position: latestPosition }).then(() =>
        queryClient.setQueryData(
          queryKeys.workspace.ticket(ticket.id),
          (current: { ticket: TicketDetail } | undefined) =>
            current ? { ticket: { ...current.ticket, unreadCount: 0 } } : current,
        ),
      );
    };

    attempt();
    document.addEventListener("visibilitychange", attempt);
    window.addEventListener("focus", attempt);
    return () => {
      document.removeEventListener("visibilitychange", attempt);
      window.removeEventListener("focus", attempt);
    };
  }, [queryClient, ticket]);
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
