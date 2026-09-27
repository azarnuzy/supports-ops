import Redis from "ioredis";
import { createStorage } from "@repo/storage";
import {
  externalErrorCode,
  externalHttpStatus,
  externalResponseCode,
  recordExternalError,
  tagExternalError,
} from "@repo/api/external-errors";
import {
  injectTraceContext,
  sessionAttributes,
  withSpan,
  withTraceContext,
} from "@repo/logger/telemetry";
import { apiConfig, ingestionConfig, storageConfig } from "./config";
import { prisma } from "./prisma";

export type AttachmentProcessJob = {
  attachmentId: string;
  ticketId: string;
  workspaceId: string;
  traceContext?: Record<string, string>;
};

let publisher: Redis | undefined;

async function publishStatus(
  ticketId: string,
  attachmentId: string,
  status: "PROCESSING" | "READY" | "FAILED",
  failureReason?: string,
) {
  publisher ??= new Redis(process.env.REDIS_URL ?? "redis://localhost:16379", {
    maxRetriesPerRequest: null,
  });
  await publisher.publish(
    `supportops:ticket:${ticketId}`,
    JSON.stringify({
      type: "attachment.updated",
      data: { attachmentId, failureReason, processingStatus: status },
    }),
  );
}

export async function processAttachmentJob(job: { data: AttachmentProcessJob }) {
  const attachment = await prisma.attachment.findFirst({
    include: { message: { select: { sessionId: true } } },
    where: {
      deletedAt: null,
      id: job.data.attachmentId,
      ticketId: job.data.ticketId,
      workspaceId: job.data.workspaceId,
    },
  });
  if (!attachment) return;

  return withTraceContext(job.data.traceContext, () =>
    withSpan(
      "support.attachment_process",
      {
        ...sessionAttributes(attachment.message.sessionId),
        "supportops.workspace_id": attachment.workspaceId,
        "supportops.ticket_id": job.data.ticketId,
        "supportops.attachment_id": attachment.id,
      },
      async (span) => {
        await prisma.attachment.update({
          data: { failureReason: null, processingStatus: "PROCESSING" },
          where: { id: attachment.id },
        });
        await publishStatus(job.data.ticketId, attachment.id, "PROCESSING");

        let failed = false;
        try {
          const extractedText = await extractAttachment(attachment.storageKey, attachment.mimeType);
          if (!extractedText.trim())
            throw new Error("The attachment did not contain readable text.");
          await prisma.attachment.update({
            data: { extractedText, processingStatus: "READY" },
            where: { id: attachment.id },
          });
          span.setAttribute("supportops.processing_status", "READY");
          await publishStatus(job.data.ticketId, attachment.id, "READY");
        } catch (error) {
          failed = true;
          if (
            error instanceof Error &&
            "externalProvider" in error &&
            error.externalProvider === "MISTRAL"
          )
            await recordExternalError(prisma, {
              provider: "MISTRAL",
              operation: attachment.mimeType.startsWith("audio/")
                ? "TRANSCRIPTION"
                : "ATTACHMENT_READ",
              modelId: attachment.mimeType.startsWith("audio/")
                ? "voxtral-mini-latest"
                : "mistral-ocr-latest",
              workspaceId: attachment.workspaceId,
              resourceType: "ATTACHMENT",
              resourceId: attachment.id,
              code: externalErrorCode(error),
              httpStatus: externalHttpStatus(error),
            });
          const failureReason =
            error instanceof Error ? error.message : "Attachment processing failed.";
          await prisma.attachment.update({
            data: { failureReason, processingStatus: "FAILED" },
            where: { id: attachment.id },
          });
          span.setAttribute("supportops.processing_status", "FAILED");
          await publishStatus(job.data.ticketId, attachment.id, "FAILED", failureReason);
        }

        const pending = await prisma.attachment.count({
          where: { messageId: attachment.messageId, processingStatus: "PROCESSING" },
        });
        if (!pending) {
          publisher ??= new Redis(process.env.REDIS_URL ?? "redis://localhost:16379", {
            maxRetriesPerRequest: null,
          });
          const replyKey = `supportops:attachment-reply:${attachment.messageId}`;
          if (await publisher.set(replyKey, "1", "EX", 300, "NX")) {
            try {
              await requestReply(job.data.ticketId, attachment.workspaceId);
            } catch (error) {
              await publisher.del(replyKey);
              throw error;
            }
          }
        }
        return failed;
      },
      false,
      (failed) => failed,
    ),
  );
}

/** What the OCR model reads. A WhatsApp Document can be anything — a
 * spreadsheet, an archive, a video — and those are still stored and downloadable
 * for a Human Agent; only automatic reading stops here, so the Customer is told
 * once instead of paying for an OCR call that was never going to work. */
const readableDocumentTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export async function extractAttachment(storageKey: string, mimeType: string) {
  // Every text/* type — text/plain, text/csv — is its own transcript.
  if (mimeType.startsWith("text/")) {
    const object = await createStorage(storageConfig).getObject(storageKey);
    if (!object.Body) throw new Error("Attachment file is missing.");
    return new TextDecoder().decode(await object.Body.transformToByteArray());
  }
  if (!ingestionConfig.mistralApiKey)
    throw new Error("Configure MISTRAL_API_KEY to process attachments.");
  if (mimeType.startsWith("audio/")) return transcribe(storageKey, mimeType);
  if (!mimeType.startsWith("image/") && !readableDocumentTypes.has(mimeType))
    throw new Error("This file type cannot be read automatically.");
  const url = await createStorage(storageConfig).getSignedGetObjectUrl({ key: storageKey });
  const document = mimeType.startsWith("image/")
    ? { image_url: url, type: "image_url" }
    : { document_url: url, type: "document_url" };
  return withSpan(
    "external.mistral.ocr",
    {
      "external.provider": "MISTRAL",
      "external.operation": "OCR",
      "external.model_id": "mistral-ocr-latest",
    },
    async () => {
      const response = await fetch("https://api.mistral.ai/v1/ocr", {
        body: JSON.stringify({ document, model: "mistral-ocr-latest" }),
        headers: {
          Authorization: `Bearer ${ingestionConfig.mistralApiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      }).catch((error: unknown) => {
        throw tagExternalError(error, "MISTRAL");
      });
      if (!response.ok) {
        const body = await response.text();
        throw tagExternalError(
          new Error(`OCR failed: ${body}`),
          "MISTRAL",
          response.status,
          externalResponseCode(body),
        );
      }
      const body = (await response.json().catch((error: unknown) => {
        throw tagExternalError(error, "MISTRAL");
      })) as { pages?: Array<{ markdown?: string }> };
      return body.pages?.map((page) => page.markdown ?? "").join("\n\n") ?? "";
    },
    false,
  );
}

async function transcribe(storageKey: string, mimeType: string) {
  const object = await createStorage(storageConfig).getObject(storageKey);
  if (!object.Body) throw new Error("Voice note file is missing.");
  const form = new FormData();
  form.set("model", "voxtral-mini-latest");
  form.set(
    "file",
    new Blob([new Uint8Array(await object.Body.transformToByteArray())], { type: mimeType }),
    `voice-note.${mimeType.split("/")[1]}`,
  );
  return withSpan(
    "external.mistral.transcription",
    {
      "external.provider": "MISTRAL",
      "external.operation": "TRANSCRIPTION",
      "external.model_id": "voxtral-mini-latest",
    },
    async () => {
      const response = await fetch("https://api.mistral.ai/v1/audio/transcriptions", {
        body: form,
        headers: { Authorization: `Bearer ${ingestionConfig.mistralApiKey}` },
        method: "POST",
      }).catch((error: unknown) => {
        throw tagExternalError(error, "MISTRAL");
      });
      if (!response.ok) {
        const body = await response.text();
        throw tagExternalError(
          new Error(`Transcription failed: ${body}`),
          "MISTRAL",
          response.status,
          externalResponseCode(body),
        );
      }
      return (
        (
          (await response.json().catch((error: unknown) => {
            throw tagExternalError(error, "MISTRAL");
          })) as { text?: string }
        ).text ?? ""
      );
    },
    false,
  );
}

async function requestReply(ticketId: string, workspaceId: string) {
  if (!apiConfig.workerToken)
    throw new Error("Configure INTERNAL_WORKER_TOKEN to generate attachment replies.");
  const response = await fetch(
    `${apiConfig.internalUrl.replace(/\/$/, "")}/internal/tickets/${ticketId}/generate`,
    {
      body: JSON.stringify({ workspaceId }),
      headers: {
        "Content-Type": "application/json",
        "x-supportops-worker-token": apiConfig.workerToken,
        ...injectTraceContext(),
      },
      method: "POST",
    },
  );
  if (!response.ok) throw new Error("Could not start the AI Agent reply for the attachment.");
}
