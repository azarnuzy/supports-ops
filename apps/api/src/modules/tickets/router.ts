import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { requireAdmin } from "../auth/guards";
import type { AuthVariables } from "../auth/types";
import { subscribeToTicketQueueEvents } from "../widget/realtime";
import { humanReplySchema, reassignTicketSchema } from "./schema";
import {
  claimTicket,
  completeHandoff,
  HumanAgentNotFoundError,
  listMyTickets,
  listAiHandlingTickets,
  listSharedHumanQueue,
  reassignTicket,
  suggestReply,
  SuggestedReplyNotConfiguredError,
  TicketAlreadyClaimedError,
  TicketNotOwnedError,
  TicketNotAvailableForTakeoverError,
  takeOverTicket,
  resolveTicket,
  sendHumanReply,
} from "./services";

export const ticketsRouter = new Hono<{ Variables: AuthVariables }>()
  .get("/queue", async (c) => {
    if (!c.get("user")) return c.json({ error: "unauthorized" }, 401);
    return c.json({ tickets: await listSharedHumanQueue() }, 200);
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
  .post("/:id/claim", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    if (user.role !== "HUMAN_AGENT" && user.role !== "ADMIN") return c.json({ error: "forbidden" }, 403);
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
      return c.json({ ticket: await takeOverTicket(c.req.param("id"), user.id, user.workspaceId) }, 200);
    } catch (error) {
      if (error instanceof TicketNotAvailableForTakeoverError)
        return c.json({ error: "ticket_not_available_for_takeover" }, 409);
      throw error;
    }
  })
  .post("/:id/messages", zValidator("json", humanReplySchema), async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    if (user.role !== "HUMAN_AGENT" && user.role !== "ADMIN") return c.json({ error: "forbidden" }, 403);
    try {
      return c.json({ message: await sendHumanReply(c.req.param("id"), user.id, c.req.valid("json").content) }, 201);
    } catch (error) {
      if (error instanceof TicketNotOwnedError) return c.json({ error: "ticket_not_owned" }, 409);
      throw error;
    }
  })
  .post("/:id/suggested-reply", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    if (user.role !== "HUMAN_AGENT" && user.role !== "ADMIN") return c.json({ error: "forbidden" }, 403);
    try {
      return c.json({ suggestedReply: await suggestReply(c.req.param("id"), user.id, user.workspaceId) }, 200);
    } catch (error) {
      if (error instanceof TicketNotOwnedError) return c.json({ error: "ticket_not_owned" }, 409);
      if (error instanceof SuggestedReplyNotConfiguredError)
        return c.json({ error: "copilot_not_configured" }, 503);
      throw error;
    }
  })
  .post("/:id/resolve", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    if (user.role !== "HUMAN_AGENT") return c.json({ error: "forbidden" }, 403);
    try {
      return c.json({ message: await resolveTicket(c.req.param("id"), user.id) }, 200);
    } catch (error) {
      if (error instanceof TicketNotOwnedError) return c.json({ error: "ticket_not_owned" }, 409);
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
      throw error;
    }
  });
