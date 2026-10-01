import { spawn } from "node:child_process";
import Redis from "ioredis";
import { createStorage } from "@repo/storage";
import {
  externalErrorCode,
  externalHttpStatus,
  externalResponseCode,
  fetchWithRetry,
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
            typeof error.externalProvider === "string"
          )
            await recordExternalError(prisma, {
              provider: error.externalProvider,
              operation: attachment.mimeType.startsWith("audio/")
                ? "TRANSCRIPTION"
                : "ATTACHMENT_READ",
              modelId: attachment.mimeType.startsWith("audio/")
                ? ingestionConfig.audioFallbackModel
                : ingestionConfig.attachmentFallbackModel,
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
  if (mimeType.startsWith("audio/")) return transcribe(storageKey, mimeType);
  if (!mimeType.startsWith("image/") && !readableDocumentTypes.has(mimeType))
    throw new Error("This file type cannot be read automatically.");
  if (
    mimeType.endsWith("wordprocessingml.document") ||
    mimeType.endsWith("presentationml.presentation")
  ) {
    const object = await createStorage(storageConfig).getObject(storageKey);
    if (!object.Body) throw new Error("Attachment file is missing.");
    const { text, visual } = await readOffice(
      new Uint8Array(await object.Body.transformToByteArray()),
      mimeType.endsWith("presentationml.presentation") ? "pptx" : "docx",
    );
    if (text.trim() && !visual) return text;
    const url = await createStorage(storageConfig).getSignedGetObjectUrl({ key: storageKey });
    const visualText = await extractWithOpenRouter(url, mimeType);
    return visualText || text;
  }
  const url = await createStorage(storageConfig).getSignedGetObjectUrl({ key: storageKey });
  return extractWithOpenRouter(url, mimeType);
}

function readOffice(
  data: Uint8Array,
  kind: "docx" | "pptx",
): Promise<{ text: string; visual: boolean }> {
  return new Promise((resolve, reject) => {
    const process = spawn(
      "python3",
      [new URL("./office-text.py", import.meta.url).pathname, kind],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    process.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    process.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    process.on("error", reject);
    process.on("close", (code) => {
      if (code !== 0)
        return reject(
          new Error(`Office extraction failed: ${Buffer.concat(errors).toString().trim()}`),
        );
      try {
        resolve(JSON.parse(Buffer.concat(output).toString()) as { text: string; visual: boolean });
      } catch (error) {
        reject(error);
      }
    });
    process.stdin.end(data);
  });
}

export async function extractDocument(url: string, mimeType: string) {
  if (!ingestionConfig.mistralApiKey)
    throw new Error("Configure MISTRAL_API_KEY to process Knowledge Source PDFs.");
  const document = mimeType.startsWith("image/")
    ? { image_url: url, type: "image_url" }
    : { document_url: url, type: "document_url" };
  try {
    return await withSpan(
      "external.mistral.ocr",
      {
        "external.provider": "MISTRAL",
        "external.operation": "OCR",
        "external.model_id": "mistral-ocr-latest",
      },
      async () => {
        const response = await fetchWithRetry("https://api.mistral.ai/v1/ocr", {
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
  } catch (error) {
    if (!shouldFallback(error) || !ingestionConfig.openRouterApiKey) throw error;
    return extractWithOpenRouter(url, mimeType);
  }
}

function shouldFallback(error: unknown) {
  if (
    !(error instanceof Error) ||
    !("externalProvider" in error) ||
    error.externalProvider !== "MISTRAL"
  )
    return false;
  const status = externalHttpStatus(error);
  return status === 429 || (status !== undefined && status >= 500) || status === undefined;
}

async function extractWithOpenRouter(url: string, mimeType: string) {
  if (!ingestionConfig.openRouterApiKey)
    throw new Error("Configure OPENROUTER_API_KEY to process chat attachments.");
  const model = ingestionConfig.attachmentFallbackModel;
  return withSpan(
    "external.openrouter.document",
    {
      "external.provider": "OPENROUTER",
      "external.operation": "ATTACHMENT_READ",
      "external.model_id": model,
    },
    async () => {
      const file = mimeType.startsWith("image/")
        ? { type: "image_url", image_url: { url } }
        : {
            type: "file",
            file: {
              filename:
                mimeType === "application/pdf"
                  ? "document.pdf"
                  : mimeType.endsWith("presentationml.presentation")
                    ? "document.pptx"
                    : "document.docx",
              file_data: url,
            },
          };
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ingestionConfig.openRouterApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Transcribe all readable content faithfully in reading order. Preserve headings, tables, and slide or page boundaries as Markdown. Do not summarize or invent missing text.",
                },
                file,
              ],
            },
          ],
          ...(mimeType === "application/pdf"
            ? { plugins: [{ id: "file-parser", pdf: { engine: "native" } }] }
            : {}),
        }),
      }).catch((error: unknown) => {
        throw tagExternalError(error, "OPENROUTER");
      });
      if (!response.ok) {
        const body = await response.text();
        throw tagExternalError(
          new Error(`Document extraction failed: ${body}`),
          "OPENROUTER",
          response.status,
          externalResponseCode(body),
        );
      }
      const body = (await response.json().catch((error: unknown) => {
        throw tagExternalError(error, "OPENROUTER");
      })) as { choices?: Array<{ message?: { content?: string } }> };
      return body.choices?.[0]?.message?.content ?? "";
    },
    false,
  );
}

async function transcribe(storageKey: string, mimeType: string) {
  if (!ingestionConfig.openRouterApiKey)
    throw new Error("Configure OPENROUTER_API_KEY to process voice notes.");
  const object = await createStorage(storageConfig).getObject(storageKey);
  if (!object.Body) throw new Error("Voice note file is missing.");
  const subtype = mimeType.split("/")[1]?.split(";")[0] ?? "audio";
  const extension = subtype === "mpeg" ? "mp3" : subtype === "mp4" ? "m4a" : subtype;
  const form = new FormData();
  form.set("model", ingestionConfig.audioFallbackModel);
  form.set(
    "file",
    new Blob([new Uint8Array(await object.Body.transformToByteArray())], { type: mimeType }),
    `voice-note.${extension}`,
  );
  return withSpan(
    "external.openrouter.transcription",
    {
      "external.provider": "OPENROUTER",
      "external.operation": "TRANSCRIPTION",
      "external.model_id": ingestionConfig.audioFallbackModel,
    },
    async () => {
      const response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
        body: form,
        headers: { Authorization: `Bearer ${ingestionConfig.openRouterApiKey}` },
        method: "POST",
      }).catch((failure: unknown) => {
        throw tagExternalError(failure, "OPENROUTER");
      });
      if (!response.ok) {
        const body = await response.text();
        throw tagExternalError(
          new Error(`Transcription failed: ${body}`),
          "OPENROUTER",
          response.status,
          externalResponseCode(body),
        );
      }
      return (
        (
          (await response.json().catch((failure: unknown) => {
            throw tagExternalError(failure, "OPENROUTER");
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
