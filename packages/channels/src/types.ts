export type AttachmentCapability = {
  directions: readonly ("inbound" | "outbound")[];
  mimeTypes: readonly string[];
  maxFileSizeBytes: number;
  maxFileSizeBytesByMimeType?: Readonly<Record<string, number>>;
  maxFilesPerMessage: number;
};

export type MessageDeliveryStatus = "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";
