import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAdmin } from "../auth/guards";
import type { AuthVariables } from "../auth/types";
import { evalDestinationSchema } from "./schema";
import {
  checkEvalDestination,
  CredentialsRequiredError,
  DestinationNotFoundError,
  getEvalDestination,
  saveEvalDestination,
  UnsafeDestinationError,
} from "./services";

export const evalDestinationRouter = new Hono<{ Variables: AuthVariables }>()
  .use("*", async (c, next) => {
    if (!requireAdmin(c)) return c.json({ error: "forbidden" }, 403);
    await next();
  })
  .get("/", async (c) => c.json(await getEvalDestination(), 200))
  .put("/", zValidator("json", evalDestinationSchema), async (c) => {
    try {
      return c.json(await saveEvalDestination(c.req.valid("json")), 200);
    } catch (error) {
      if (error instanceof UnsafeDestinationError || error instanceof CredentialsRequiredError) {
        return c.json({ error: "invalid_destination", message: error.message }, 422);
      }
      throw error;
    }
  })
  .post("/check", async (c) => {
    try {
      return c.json({ readiness: await checkEvalDestination() }, 200);
    } catch (error) {
      if (error instanceof DestinationNotFoundError) {
        return c.json({ error: "not_found", message: "No evaluation destination is set." }, 404);
      }
      throw error;
    }
  });
