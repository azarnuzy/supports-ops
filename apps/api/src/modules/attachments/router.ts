import { Hono } from "hono";
import { createStorage } from "@repo/storage";
import { storageConfig } from "../../config";
import { prisma } from "../../utils/prisma";
import type { AuthVariables } from "../auth/types";
import { ticketVisibilityWhere } from "../tickets/services";

/** Authenticated Ticket surfaces use this endpoint rather than persisting a
 * bucket URL. Workspace isolation on `prisma` keeps the signed URL scoped to
 * the current user's Workspace. */
export const attachmentRouter = new Hono<{ Variables: AuthVariables }>().get(
  "/:id/:mode",
  async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    const mode = c.req.param("mode");
    if (mode !== "download" && mode !== "preview") return c.json({ error: "not_found" }, 404);
    const attachment = await prisma.attachment.findFirst({
      where: {
        deletedAt: null,
        id: c.req.param("id"),
        ticket: { is: ticketVisibilityWhere(user) },
      },
    });
    // A refused WhatsApp file is recorded without ever being stored.
    if (!attachment?.storageKey) return c.json({ error: "not_found" }, 404);
    const url = await createStorage(storageConfig).getSignedGetObjectUrl({
      key: attachment.storageKey,
      responseContentDisposition: `${mode === "preview" ? "inline" : "attachment"}; filename="${attachment.fileName.replaceAll('"', "")}"`,
      responseContentType: attachment.mimeType,
    });
    return c.json({ url }, 200);
  },
);
