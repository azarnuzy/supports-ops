import type { ListTicketsFilters, TicketDetail } from "@repo/api-client";
import { queryOptions, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { queryKeys } from "../../lib/query-keys";
import {
  claimTicket,
  generateSuggestedReply,
  getAllTickets,
  getLiveAiTickets,
  getMyTickets,
  getSharedHumanQueue,
  getTicketDetail,
  markTicketRead,
  reassignTicket,
  resolveHumanTicket,
  retryHumanReply,
  sendHumanReply,
  sendHumanAttachments,
  subscribeToTicketEvents,
  subscribeToSharedHumanQueue,
  takeOverTicket,
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

export function useAllTicketsQuery(filters: {
  enabled: boolean;
  search?: string;
  status?: ListTicketsFilters["status"];
}) {
  return useInfiniteQuery({
    enabled: filters.enabled,
    getNextPageParam: (lastPage: Awaited<ReturnType<typeof getAllTickets>>) =>
      lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      getAllTickets({ cursor: pageParam, search: filters.search, status: filters.status }),
    queryKey: queryKeys.workspace.allTickets({
      search: filters.search,
      status: filters.status?.join(","),
    }),
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
  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.workspace.sharedHumanQueue }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workspace.myTickets }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workspace.liveAiTickets }),
        queryClient.invalidateQueries({ queryKey: ["workspace", "all-tickets"] }),
      ]),
    [queryClient],
  );
}

/** Invalidates one Ticket's detail query on top of the shared lists, so the
 * sender sees its own Message immediately even if the per-Ticket SSE event
 * was published inside a reconnect window (those events are never replayed). */
function useInvalidateTicketAndLists() {
  const queryClient = useQueryClient();
  const invalidateLists = useTicketInvalidation();
  return useCallback(
    (ticketId: string) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.workspace.ticket(ticketId) }),
        invalidateLists(),
      ]),
    [invalidateLists, queryClient],
  );
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
 * focused, and the newest Message is visible in the transcript (per
 * `newestMessageVisible`, driven by an IntersectionObserver on the last
 * bubble) — never while backgrounded, on a different Ticket, or scrolled
 * away from the newest Message. */
export function useMarkTicketReadOnView(ticket: TicketDetail | undefined, newestMessageVisible: boolean) {
  const queryClient = useQueryClient();
  const lastSent = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!ticket || !newestMessageVisible) return;
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
  }, [newestMessageVisible, queryClient, ticket]);
}

/** Reports whether `element` is currently intersecting the viewport, for
 * gating "the newest Message is visible" — re-observes whenever the
 * observed node changes (e.g. a new Message becomes the last bubble). */
export function useIsElementVisible(element: Element | null) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!element) {
      setVisible(false);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false), {
      threshold: 0.5,
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return visible;
}

export function useClaimTicketMutation() {
  const invalidate = useTicketInvalidation();
  return useMutation({ mutationFn: claimTicket, onSettled: invalidate });
}

export function useTakeOverTicketMutation() {
  const invalidate = useTicketInvalidation();
  return useMutation({ mutationFn: takeOverTicket, onSettled: invalidate });
}

export function useReassignTicketMutation() {
  const invalidate = useTicketInvalidation();
  return useMutation({ mutationFn: reassignTicket, onSettled: invalidate });
}

export function useSendHumanReplyMutation() {
  const invalidateTicketAndLists = useInvalidateTicketAndLists();
  return useMutation({ mutationFn: sendHumanReply, onSuccess: (_m, v) => invalidateTicketAndLists(v.id) });
}

export function useSendHumanAttachmentsMutation() {
  const invalidateTicketAndLists = useInvalidateTicketAndLists();
  return useMutation({ mutationFn: sendHumanAttachments, onSuccess: (_m, v) => invalidateTicketAndLists(v.id) });
}

export function useRetryHumanReplyMutation() {
  const invalidateTicketAndLists = useInvalidateTicketAndLists();
  return useMutation({ mutationFn: retryHumanReply, onSuccess: (_m, v) => invalidateTicketAndLists(v.id) });
}

export function useGenerateSuggestedReplyMutation() {
  return useMutation({ mutationFn: generateSuggestedReply });
}

export function useResolveHumanTicketMutation() {
  const invalidate = useTicketInvalidation();
  return useMutation({ mutationFn: resolveHumanTicket, onSuccess: invalidate });
}
