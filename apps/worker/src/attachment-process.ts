import Redis from "ioredis";
import { createStorage } from "@repo/storage";
import { apiConfig, ingestionConfig, storageConfig } from "./config";
import { prisma } from "./prisma";

export type AttachmentProcessJob = { attachmentId: string; ticketId: string; workspaceId: string };

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
    where: {
      deletedAt: null,
      id: job.data.attachmentId,
      ticketId: job.data.ticketId,
      workspaceId: job.data.workspaceId,
    },
  });
  if (!attachment) return;

  await prisma.attachment.update({
    data: { failureReason: null, processingStatus: "PROCESSING" },
    where: { id: attachment.id },
  });
  await publishStatus(job.data.ticketId, attachment.id, "PROCESSING");

  try {
    const extractedText = await extractAttachment(attachment.storageKey, attachment.mimeType);
    if (!extractedText.trim()) throw new Error("The attachment did not contain readable text.");
    await prisma.attachment.update({
      data: { extractedText, processingStatus: "READY" },
      where: { id: attachment.id },
    });
    await publishStatus(job.data.ticketId, attachment.id, "READY");
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : "Attachment processing failed.";
    await prisma.attachment.update({
      data: { failureReason, processingStatus: "FAILED" },
      where: { id: attachment.id },
    });
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
}

async function extractAttachment(storageKey: string, mimeType: string) {
  if (mimeType === "text/plain") {
    const object = await createStorage(storageConfig).getObject(storageKey);
    if (!object.Body) throw new Error("Attachment file is missing.");
    return new TextDecoder().decode(await object.Body.transformToByteArray());
  }
  if (!ingestionConfig.mistralApiKey)
    throw new Error("Configure MISTRAL_API_KEY to process attachments.");
  const url = await createStorage(storageConfig).getSignedGetObjectUrl({ key: storageKey });
  const document =
    mimeType === "application/pdf"
      ? { document_url: url, type: "document_url" }
      : { image_url: url, type: "image_url" };
  const response = await fetch("https://api.mistral.ai/v1/ocr", {
    body: JSON.stringify({ document, model: "mistral-ocr-latest" }),
    headers: {
      Authorization: `Bearer ${ingestionConfig.mistralApiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) throw new Error(`OCR failed: ${await response.text()}`);
  const body = (await response.json()) as { pages?: Array<{ markdown?: string }> };
  return body.pages?.map((page) => page.markdown ?? "").join("\n\n") ?? "";
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
      },
      method: "POST",
    },
  );
  if (!response.ok) throw new Error("Could not start the AI Agent reply for the attachment.");
}
