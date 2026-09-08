import { Hono } from "hono";
import { createStorage } from "@repo/storage";
import { storageConfig } from "../../config";
import { prisma } from "../../utils/prisma";
import type { AuthVariables } from "../auth/types";

/** Authenticated Ticket surfaces use this endpoint rather than persisting a
 * bucket URL. Workspace isolation on `prisma` keeps the signed URL scoped to
 * the current user's Workspace. */
export const attachmentRouter = new Hono<{ Variables: AuthVariables }>().get(
  "/:id/download",
  async (c) => {
    if (!c.get("user")) return c.json({ error: "unauthorized" }, 401);
    const attachment = await prisma.attachment.findFirst({
      where: { deletedAt: null, id: c.req.param("id") },
    });
    if (!attachment) return c.json({ error: "not_found" }, 404);
    const url = await createStorage(storageConfig).getSignedGetObjectUrl({
      key: attachment.storageKey,
      responseContentDisposition: `attachment; filename="${attachment.fileName.replaceAll('"', "")}"`,
      responseContentType: attachment.mimeType,
    });
    return c.json({ url }, 200);
  },
);
