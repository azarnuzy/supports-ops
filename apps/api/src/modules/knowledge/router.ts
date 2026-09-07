import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { requireAdmin } from "../auth/guards";
import type { AuthVariables } from "../auth/types";
import { createManualFaqSchema, retrievalTestSchema, updateManualFaqSchema } from "./schema";
import {
  createManualFaq,
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
