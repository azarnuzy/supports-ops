import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { requireAdmin } from "../auth/guards";
import type { AuthVariables } from "../auth/types";
import { subscribeToKnowledgeSourceEvents } from "../widget/realtime";
import {
  createDocumentationUrlSchema,
  createManualFaqSchema,
  createPdfKnowledgeSourceSchema,
  retrievalTestSchema,
  updateManualFaqSchema,
} from "./schema";
import {
  createManualFaq,
  createDocumentationUrl,
  createPdfKnowledgeSource,
  deleteKnowledgeSource,
  EmbeddingNotConfiguredError,
  getKnowledgeSource,
  KnowledgeSourceMissingContentError,
  KnowledgeSourceNotFoundError,
  KnowledgeSourceProcessingError,
  listKnowledgeSources,
  publishKnowledgeSource,
  testRetrieval,
  updateManualFaq,
} from "./services";

export const knowledgeRouter = new Hono<{ Variables: AuthVariables }>()
  .get("/", async (c) => {
    const currentUser = requireAdmin(c);

    if (!currentUser) {
      return c.json({ error: "forbidden" }, 403);
    }

    const result = await listKnowledgeSources();

    return c.json(result, 200);
  })
  .post("/", zValidator("json", createManualFaqSchema), async (c) => {
    const currentUser = requireAdmin(c);

    if (!currentUser) {
      return c.json({ error: "forbidden" }, 403);
    }

    const knowledgeSource = await createManualFaq(c.req.valid("json"));

    return c.json({ knowledgeSource }, 201);
  })
  .post("/pdf", zValidator("form", createPdfKnowledgeSourceSchema), async (c) => {
    if (!requireAdmin(c)) return c.json({ error: "forbidden" }, 403);
    const { file, visibility } = c.req.valid("form");
    try {
      return c.json({ knowledgeSource: await createPdfKnowledgeSource(file, visibility) }, 201);
    } catch (error) {
      return c.json(
        { error: "invalid_pdf", message: error instanceof Error ? error.message : "Invalid PDF." },
        422,
      );
    }
  })
  .post("/url", zValidator("json", createDocumentationUrlSchema), async (c) => {
    if (!requireAdmin(c)) return c.json({ error: "forbidden" }, 403);
    return c.json({ knowledgeSource: await createDocumentationUrl(c.req.valid("json")) }, 201);
  })
  .post("/retrieval-test", zValidator("json", retrievalTestSchema), async (c) => {
    const currentUser = requireAdmin(c);

    if (!currentUser) {
      return c.json({ error: "forbidden" }, 403);
    }

    try {
      const result = await testRetrieval(c.req.valid("json").query);

      return c.json(result, 200);
    } catch (error) {
      if (error instanceof EmbeddingNotConfiguredError) {
        return c.json({ error: "embedding_not_configured", message: error.message }, 503);
      }

      throw error;
    }
  })
  .get("/events", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    return streamSSE(c, async (stream) => {
      const unsubscribe = await subscribeToKnowledgeSourceEvents(user.workspaceId, async (event) => {
        await stream.writeSSE({ data: JSON.stringify(event), event: event.type });
      });
      stream.onAbort(unsubscribe);
      await new Promise<void>(() => undefined);
    });
  })
  .get("/:id", async (c) => {
    const currentUser = requireAdmin(c);

    if (!currentUser) {
      return c.json({ error: "forbidden" }, 403);
    }

    try {
      const knowledgeSource = await getKnowledgeSource(c.req.param("id"));

      return c.json({ knowledgeSource }, 200);
    } catch (error) {
      if (error instanceof KnowledgeSourceNotFoundError) {
        return c.json({ error: "not_found" }, 404);
      }

      throw error;
    }
  })
  .patch("/:id", zValidator("json", updateManualFaqSchema), async (c) => {
    const currentUser = requireAdmin(c);

    if (!currentUser) {
      return c.json({ error: "forbidden" }, 403);
    }

    try {
      const knowledgeSource = await updateManualFaq(c.req.param("id"), c.req.valid("json"));

      return c.json({ knowledgeSource }, 200);
    } catch (error) {
      if (error instanceof KnowledgeSourceNotFoundError) {
        return c.json({ error: "not_found" }, 404);
      }

      if (error instanceof KnowledgeSourceProcessingError) {
        return c.json({ error: "processing", message: error.message }, 409);
      }

      throw error;
    }
  })
  .post("/:id/publish", async (c) => {
    const currentUser = requireAdmin(c);

    if (!currentUser) {
      return c.json({ error: "forbidden" }, 403);
    }

    try {
      const knowledgeSource = await publishKnowledgeSource(c.req.param("id"));

      return c.json({ knowledgeSource }, 200);
    } catch (error) {
      if (error instanceof KnowledgeSourceNotFoundError) {
        return c.json({ error: "not_found" }, 404);
      }

      if (error instanceof KnowledgeSourceProcessingError) {
        return c.json({ error: "processing", message: error.message }, 409);
      }

      if (error instanceof KnowledgeSourceMissingContentError) {
        return c.json({ error: "missing_content", message: error.message }, 422);
      }

      throw error;
    }
  })
  .delete("/:id", async (c) => {
    const currentUser = requireAdmin(c);

    if (!currentUser) {
      return c.json({ error: "forbidden" }, 403);
    }

    try {
      await deleteKnowledgeSource(c.req.param("id"), currentUser.id);

      return c.body(null, 204);
    } catch (error) {
      if (error instanceof KnowledgeSourceNotFoundError) {
        return c.json({ error: "not_found" }, 404);
      }

      throw error;
    }
  });
