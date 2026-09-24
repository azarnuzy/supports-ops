import type { AttachmentCapability, MessageDeliveryStatus } from "./types";

/** Channel adapters expose their file limits here, before either UI or API use them. */
export const webAttachmentCapability: AttachmentCapability = {
  directions: ["inbound", "outbound"],
  mimeTypes: ["application/pdf", "text/plain", "image/jpeg", "image/png"],
  maxFileSizeBytes: 10 * 1024 * 1024,
  maxFilesPerMessage: 10,
};

export const webDeliveryStates = [
  "PENDING",
  "SENT",
  "FAILED",
] as const satisfies readonly MessageDeliveryStatus[];
