import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { requireAdmin } from "../auth/guards";
import type { AuthVariables } from "../auth/types";
import { subscribeToTicketQueueEvents, subscribeToWidgetEvents } from "../widget/realtime";
import {
  humanReplySchema,
  humanAttachmentReplySchema,
  listTicketsQuerySchema,
  markTicketReadSchema,
  reassignTicketSchema,
  resolveTicketSchema,
} from "./schema";
import {
  claimTicket,
  completeHandoff,
  deleteTicket,
  getTicketDetail,
  HumanAgentNotFoundError,
  InvalidTicketsCursorError,
  InvalidHumanAttachmentError,
  listMyTickets,
  listAiHandlingTickets,
  listSharedHumanQueue,
  listTickets,
  markTicketRead,
  reassignTicket,
  suggestReply,
  SuggestedReplyNotConfiguredError,
  TicketAlreadyClaimedError,
  TicketNotAvailableForAssignmentError,
  TicketNotFoundError,
  TicketNotOwnedError,
  TicketNotAvailableForTakeoverError,
  PendingMessageDeliveryError,
  retryHumanReply,
  takeOverTicket,
  resolveTicket,
  sendHumanReply,
  sendHumanAttachmentReply,
} from "./services";

export const ticketsRouter = new Hono<{ Variables: AuthVariables }>()
  .get("/", zValidator("query", listTicketsQuerySchema), async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    try {
      return c.json(await listTickets(user, c.req.valid("query")), 200);
    } catch (error) {
      if (error instanceof InvalidTicketsCursorError)
        return c.json({ error: "invalid_cursor" }, 400);
      throw error;
    }
  })
  .get("/queue", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    return c.json({ tickets: await listSharedHumanQueue(user.id) }, 200);
  })
  .get("/mine", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    return c.json({ tickets: await listMyTickets(user.id) }, 200);
  })
  .get("/live", async (c) => {
    const user = requireAdmin(c);
    if (!user) return c.json({ error: "forbidden" }, 403);
    return c.json({ tickets: await listAiHandlingTickets(user.workspaceId) }, 200);
  })
  .get("/queue/events", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    return streamSSE(c, async (stream) => {
      const unsubscribe = await subscribeToTicketQueueEvents(user.workspaceId, async (event) => {
        await stream.writeSSE({ data: JSON.stringify(event), event: event.type });
      });
      stream.onAbort(unsubscribe);
      await new Promise<void>(() => undefined);
    });
  })
  .get("/:id", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    try {
      return c.json({ ticket: await getTicketDetail(c.req.param("id"), user) }, 200);
    } catch (error) {
      if (error instanceof TicketNotFoundError) return c.json({ error: "ticket_not_found" }, 404);
      throw error;
    }
  })
  .get("/:id/events", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    try {
      await getTicketDetail(c.req.param("id"), user);
    } catch (error) {
      if (error instanceof TicketNotFoundError) return c.json({ error: "ticket_not_found" }, 404);
      throw error;
    }
    return streamSSE(c, async (stream) => {
      const unsubscribe = await subscribeToWidgetEvents(c.req.param("id"), async (event) => {
        await stream.writeSSE({ data: JSON.stringify(event), event: event.type });
      });
      stream.onAbort(unsubscribe);
      await new Promise<void>(() => undefined);
    });
  })
  .post("/:id/read", zValidator("json", markTicketReadSchema), async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    try {
      return c.json(
        await markTicketRead(c.req.param("id"), user, c.req.valid("json").position),
        200,
      );
    } catch (error) {
      if (error instanceof TicketNotFoundError) return c.json({ error: "ticket_not_found" }, 404);
      throw error;
    }
  })
  .post("/:id/claim", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    if (user.role !== "HUMAN_AGENT" && user.role !== "ADMIN")
      return c.json({ error: "forbidden" }, 403);
    try {
      const ticket = await claimTicket(c.req.param("id"), user.id, user.workspaceId);
      void completeHandoff(ticket.id, user.id, user.workspaceId).catch(() => undefined);
      return c.json({ ticket }, 200);
    } catch (error) {
      if (error instanceof TicketAlreadyClaimedError)
        return c.json({ error: "already_claimed", message: error.message }, 409);
      throw error;
    }
  })
  .post("/:id/takeover", async (c) => {
    const user = requireAdmin(c);
    if (!user) return c.json({ error: "forbidden" }, 403);
    try {
      return c.json(
        { ticket: await takeOverTicket(c.req.param("id"), user.id, user.workspaceId) },
        200,
      );
    } catch (error) {
      if (error instanceof TicketNotAvailableForTakeoverError)
        return c.json({ error: "ticket_not_available_for_takeover" }, 409);
      throw error;
    }
  })
  .post("/:id/messages", zValidator("json", humanReplySchema), async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    if (user.role !== "HUMAN_AGENT" && user.role !== "ADMIN")
      return c.json({ error: "forbidden" }, 403);
    try {
      return c.json(
        {
          message: await sendHumanReply(
            c.req.param("id"),
            user.id,
            c.req.valid("json").content,
            c.req.valid("json").idempotencyKey,
          ),
        },
        201,
      );
    } catch (error) {
      if (error instanceof TicketNotOwnedError) return c.json({ error: "ticket_not_owned" }, 409);
      throw error;
    }
  })
  .post("/:id/attachments", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    if (user.role !== "HUMAN_AGENT" && user.role !== "ADMIN")
      return c.json({ error: "forbidden" }, 403);
    const form = await c.req.formData();
    const parsed = humanAttachmentReplySchema.safeParse({
      content: form.get("content") || undefined,
      idempotencyKey: form.get("idempotencyKey"),
    });
    if (!parsed.success) return c.json({ error: "invalid_attachment" }, 422);
    try {
      return c.json(
        {
          message: await sendHumanAttachmentReply(
            c.req.param("id"),
            user.id,
            parsed.data.content,
            form.getAll("files").filter((value): value is File => value instanceof File),
            parsed.data.idempotencyKey,
          ),
        },
        201,
      );
    } catch (error) {
      if (error instanceof TicketNotOwnedError) return c.json({ error: "ticket_not_owned" }, 409);
      if (error instanceof InvalidHumanAttachmentError)
        return c.json({ error: "invalid_attachment" }, 422);
      throw error;
    }
  })
  .post("/:id/messages/:messageId/retry", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    if (user.role !== "HUMAN_AGENT" && user.role !== "ADMIN")
      return c.json({ error: "forbidden" }, 403);
    try {
      return c.json(
        { message: await retryHumanReply(c.req.param("id"), user.id, c.req.param("messageId")) },
        200,
      );
    } catch (error) {
      if (error instanceof TicketNotOwnedError) return c.json({ error: "ticket_not_owned" }, 409);
      throw error;
    }
  })
  .post("/:id/suggested-reply", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    if (user.role !== "HUMAN_AGENT" && user.role !== "ADMIN")
      return c.json({ error: "forbidden" }, 403);
    try {
      return c.json(
        { suggestedReply: await suggestReply(c.req.param("id"), user.id, user.workspaceId) },
        200,
      );
    } catch (error) {
      if (error instanceof TicketNotOwnedError) return c.json({ error: "ticket_not_owned" }, 409);
      if (error instanceof SuggestedReplyNotConfiguredError)
        return c.json({ error: "copilot_not_configured" }, 503);
      throw error;
    }
  })
  .post("/:id/resolve", zValidator("json", resolveTicketSchema), async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    if (user.role !== "HUMAN_AGENT" && user.role !== "ADMIN")
      return c.json({ error: "forbidden" }, 403);
    try {
      return c.json(
        {
          message: await resolveTicket(
            c.req.param("id"),
            user.id,
            c.req.valid("json").resolutionReason,
          ),
        },
        200,
      );
    } catch (error) {
      if (error instanceof TicketNotOwnedError) return c.json({ error: "ticket_not_owned" }, 409);
      if (error instanceof PendingMessageDeliveryError)
        return c.json({ error: "pending_message_delivery" }, 409);
      throw error;
    }
  })
  .patch("/:id/assignee", zValidator("json", reassignTicketSchema), async (c) => {
    const user = requireAdmin(c);
    if (!user) return c.json({ error: "forbidden" }, 403);
    try {
      return c.json(
        {
          ticket: await reassignTicket(
            c.req.param("id"),
            c.req.valid("json").humanAgentId,
            user.workspaceId,
          ),
        },
        200,
      );
    } catch (error) {
      if (error instanceof HumanAgentNotFoundError)
        return c.json({ error: "human_agent_not_found" }, 422);
      if (error instanceof TicketNotAvailableForAssignmentError)
        return c.json({ error: "ticket_not_available_for_assignment" }, 409);
      throw error;
    }
  })
  .delete("/:id", async (c) => {
    const user = requireAdmin(c);
    if (!user) return c.json({ error: "forbidden" }, 403);
    try {
      await deleteTicket(c.req.param("id"), user.id, user.workspaceId);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof TicketNotFoundError) return c.json({ error: "ticket_not_found" }, 404);
      throw error;
    }
  });
