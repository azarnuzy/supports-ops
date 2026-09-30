import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAdmin } from "../auth/guards";
import type { AuthVariables } from "../auth/types";
import { retryParams, selectionSchema } from "./schema";
import {
  DeliveryNotRetryableError,
  estimateRun,
  getRun,
  listRuns,
  RunActiveError,
  RunBlockedError,
  RunNotFoundError,
  retryDelivery,
  RunSelectionNotFoundError,
  startRun,
} from "./services";

type Answer = { json: (body: unknown, status: 404 | 409 | 422) => Response };

async function respond(work: () => Promise<Response>, c: Answer) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof RunSelectionNotFoundError || error instanceof RunNotFoundError)
      return c.json({ error: "not_found" }, 404);
    if (error instanceof RunActiveError)
      return c.json(
        { error: "run_active", message: "This Workspace already has a Run in progress." },
        409,
      );
    if (error instanceof DeliveryNotRetryableError)
      return c.json({ error: "not_retryable", message: error.message }, 409);
    if (error instanceof RunBlockedError)
      return c.json({ caseKeys: error.caseKeys, error: error.code, message: error.message }, 422);
    throw error;
  }
}

/** Evaluation Runs are Admin-only, like the datasets they execute. */
export const evalRunsRouter = new Hono<{ Variables: AuthVariables }>()
  .use("*", async (c, next) => {
    if (!requireAdmin(c)) return c.json({ error: "forbidden" }, 403);
    await next();
  })
  .get("/", async (c) => c.json({ runs: await listRuns(c.req.query("datasetId")) }, 200))
  .post("/estimate", zValidator("json", selectionSchema), (c) =>
    respond(async () => c.json({ estimate: await estimateRun(c.req.valid("json")) }, 200), c),
  )
  .post("/", zValidator("json", selectionSchema), (c) =>
    respond(async () => c.json({ run: await startRun(c.req.valid("json")) }, 201), c),
  )
  .get("/:id", (c) =>
    respond(async () => c.json({ run: await getRun(c.req.param("id")) }, 200), c),
  )
  .post("/:id/delivery/:target/retry", zValidator("param", retryParams), (c) => {
    const { id, target } = c.req.valid("param");
    return respond(async () => c.json({ run: await retryDelivery(id, target) }, 200), c);
  });
