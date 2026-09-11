import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAdmin } from "../auth/guards";
import type { AuthVariables } from "../auth/types";
import { createTicketCategorySchema, updateTicketCategorySchema } from "./schema";
import {
  createTicketCategory,
  deleteTicketCategory,
  DuplicateCategoryError,
  FallbackCategoryError,
  listTicketCategories,
  TicketCategoryNotFoundError,
  updateTicketCategory,
} from "./services";

export const ticketCategoriesRouter = new Hono<{ Variables: AuthVariables }>()
  // Every signed-in teammate needs the list to read and filter Tickets; only an Admin may edit it.
  .get("/", async (c) => c.json({ categories: await listTicketCategories() }, 200))
  .use("*", async (c, next) => {
    if (!requireAdmin(c)) return c.json({ error: "forbidden" }, 403);
    await next();
  })
  .post("/", zValidator("json", createTicketCategorySchema), async (c) => {
    try {
      return c.json({ category: await createTicketCategory(c.req.valid("json")) }, 201);
    } catch (error) {
      if (error instanceof DuplicateCategoryError)
        return c.json({ error: "duplicate_category" }, 409);
      throw error;
    }
  })
  .put("/:id", zValidator("json", updateTicketCategorySchema), async (c) => {
    try {
      return c.json(
        { category: await updateTicketCategory(c.req.param("id"), c.req.valid("json")) },
        200,
      );
    } catch (error) {
      if (error instanceof TicketCategoryNotFoundError) return c.json({ error: "not_found" }, 404);
      throw error;
    }
  })
  .delete("/:id", async (c) => {
    try {
      await deleteTicketCategory(c.req.param("id"));
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof TicketCategoryNotFoundError) return c.json({ error: "not_found" }, 404);
      if (error instanceof FallbackCategoryError)
        return c.json({ error: "fallback_category" }, 409);
      throw error;
    }
  });
