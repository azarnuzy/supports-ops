import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAdmin } from "../auth/guards";
import type { AuthVariables } from "../auth/types";
import { importSourceSchema } from "./import";
import {
  caseSchema,
  datasetSchema,
  importMessagesQuery,
  datasetCaseQuery,
  bulkCaseSchema,
} from "./schema";
import {
  CaseNotFoundError,
  createCase,
  createDataset,
  DatasetNotFoundError,
  deleteCase,
  DuplicateCaseKeyError,
  getDataset,
  importCases,
  listImportSessions,
  listImportMessages,
  getImportMessageContext,
  previewImport,
  listDatasets,
  updateCase,
  updateCaseExpectations,
  updateDataset,
} from "./services";

/** Wraps a handler so the service's domain errors become their HTTP answers. */
async function respond(
  work: () => Promise<Response>,
  c: { json: (body: unknown, status: 404 | 409) => Response },
) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DatasetNotFoundError || error instanceof CaseNotFoundError)
      return c.json({ error: "not_found" }, 404);
    if (error instanceof DuplicateCaseKeyError) return c.json({ error: "duplicate_case_key" }, 409);
    throw error;
  }
}

/** Evaluation resources are Admin-only: a Human Agent cannot read them either. */
export const evalDatasetsRouter = new Hono<{ Variables: AuthVariables }>()
  .use("*", async (c, next) => {
    if (!requireAdmin(c)) return c.json({ error: "forbidden" }, 403);
    await next();
  })
  .get("/", async (c) => c.json({ datasets: await listDatasets() }, 200))
  .post("/", zValidator("json", datasetSchema), async (c) =>
    c.json({ dataset: await createDataset(c.req.valid("json")) }, 201),
  )
  .get("/import-messages", zValidator("query", importMessagesQuery), async (c) =>
    c.json(await listImportMessages(c.req.valid("query")), 200),
  )
  .get("/import-messages/:messageId/context", (c) =>
    respond(
      async () => c.json({ history: await getImportMessageContext(c.req.param("messageId")) }, 200),
      c,
    ),
  )
  .get("/import-sessions", async (c) => c.json({ sessions: await listImportSessions() }, 200))
  .get("/:id", zValidator("query", datasetCaseQuery), (c) =>
    respond(
      async () =>
        c.json({ dataset: await getDataset(c.req.param("id"), c.req.valid("query")) }, 200),
      c,
    ),
  )
  .put("/:id", zValidator("json", datasetSchema), (c) =>
    respond(
      async () =>
        c.json({ dataset: await updateDataset(c.req.param("id"), c.req.valid("json")) }, 200),
      c,
    ),
  )
  .post("/:id/import/preview", zValidator("json", importSourceSchema), (c) =>
    respond(
      async () =>
        c.json({ preview: await previewImport(c.req.param("id"), c.req.valid("json")) }, 200),
      c,
    ),
  )
  .post("/:id/import", zValidator("json", importSourceSchema), (c) =>
    respond(
      async () =>
        c.json({ import: await importCases(c.req.param("id"), c.req.valid("json")) }, 201),
      c,
    ),
  )
  .put("/:id/cases", zValidator("json", bulkCaseSchema), (c) =>
    respond(
      async () => c.json(await updateCaseExpectations(c.req.param("id"), c.req.valid("json")), 200),
      c,
    ),
  )
  .post("/:id/cases", zValidator("json", caseSchema), (c) =>
    respond(
      async () => c.json({ case: await createCase(c.req.param("id"), c.req.valid("json")) }, 201),
      c,
    ),
  )
  .put("/:id/cases/:caseId", zValidator("json", caseSchema), (c) =>
    respond(
      async () =>
        c.json(
          { case: await updateCase(c.req.param("id"), c.req.param("caseId"), c.req.valid("json")) },
          200,
        ),
      c,
    ),
  )
  .delete("/:id/cases/:caseId", (c) =>
    respond(async () => {
      await deleteCase(c.req.param("id"), c.req.param("caseId"));
      return c.body(null, 204);
    }, c),
  );
