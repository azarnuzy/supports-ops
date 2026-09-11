export type AttachmentCapability = {
  directions: readonly ("inbound" | "outbound")[];
  mimeTypes: readonly string[];
  maxFileSizeBytes: number;
  maxFileSizeBytesByMimeType?: Readonly<Record<string, number>>;
  maxFilesPerMessage: number;
};

export type MessageDeliveryStatus = "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";

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

const MB = 1024 * 1024;
const whatsAppFileSizeLimits = {
  "image/jpeg": 5 * MB,
  "image/png": 5 * MB,
  "audio/aac": 16 * MB,
  "audio/amr": 16 * MB,
  "audio/mpeg": 16 * MB,
  "audio/mp4": 16 * MB,
  "audio/ogg": 16 * MB,
  "text/plain": 100 * MB,
  "application/pdf": 100 * MB,
  "application/msword": 100 * MB,
  "application/vnd.ms-excel": 100 * MB,
  "application/vnd.ms-powerpoint": 100 * MB,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": 100 * MB,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": 100 * MB,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": 100 * MB,
} as const;

export const whatsAppAttachmentCapability = {
  directions: ["inbound", "outbound"],
  mimeTypes: Object.keys(whatsAppFileSizeLimits),
  maxFileSizeBytes: 100 * MB,
  maxFileSizeBytesByMimeType: whatsAppFileSizeLimits,
  maxFilesPerMessage: 1,
} satisfies AttachmentCapability;

type WhatsAppDeliveryStatus = "sent" | "delivered" | "read" | "failed";

export const whatsAppDeliveryStates = [
  "SENT",
  "DELIVERED",
  "READ",
  "FAILED",
] as const satisfies readonly MessageDeliveryStatus[];

export function mapWhatsAppDeliveryStatus(
  status: WhatsAppDeliveryStatus,
): Exclude<MessageDeliveryStatus, "PENDING"> {
  return (
    {
      sent: "SENT",
      delivered: "DELIVERED",
      read: "READ",
      failed: "FAILED",
    } satisfies Record<WhatsAppDeliveryStatus, Exclude<MessageDeliveryStatus, "PENDING">>
  )[status];
}

export type WhatsAppInboundEvent =
  | {
      kind: "message";
      messageId: string;
      from: string;
      timestamp: string;
      phoneNumberId: string;
      customerName?: string;
      text?: string;
      attachment?: {
        id: string;
        type: "image" | "document" | "audio";
        mimeType: string;
        sha256?: string;
        fileName?: string;
      };
    }
  | {
      kind: "delivery";
      messageId: string;
      recipientId: string;
      timestamp: string;
      deliveryStatus: Exclude<MessageDeliveryStatus, "PENDING">;
      failureReason?: string;
    };

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const object = record(item);
    return object ? [object] : [];
  });
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function parseWhatsAppWebhook(payload: unknown): WhatsAppInboundEvent[] {
  const root = record(payload);
  if (root?.object !== "whatsapp_business_account") return [];

  const events: WhatsAppInboundEvent[] = [];
  for (const entry of records(root.entry)) {
    for (const change of records(entry.changes)) {
      if (change.field !== "messages") continue;
      const value = record(change.value);
      const phoneNumberId = string(record(value?.metadata)?.phone_number_id);
      if (!value || !phoneNumberId) continue;

      const contacts = records(value.contacts);
      for (const message of records(value.messages)) {
        const messageId = string(message.id);
        const from = string(message.from);
        const timestamp = string(message.timestamp);
        const messageType = string(message.type);
        if (!messageId || !from || !timestamp || !messageType) continue;

        const contact = contacts.find((item) => item.wa_id === from);
        const customerName = string(record(contact?.profile)?.name);
        if (messageType === "text") {
          const text = string(record(message.text)?.body);
          if (text !== undefined)
            events.push({
              kind: "message",
              messageId,
              from,
              timestamp,
              phoneNumberId,
              customerName,
              text,
            });
          continue;
        }
        if (messageType !== "image" && messageType !== "document" && messageType !== "audio")
          continue;

        const media = record(message[messageType]);
        const id = string(media?.id);
        const mimeType = string(media?.mime_type);
        if (!id || !mimeType) continue;
        const text = messageType === "audio" ? undefined : string(media?.caption);
        events.push({
          kind: "message",
          messageId,
          from,
          timestamp,
          phoneNumberId,
          customerName,
          text,
          attachment: {
            id,
            type: messageType,
            mimeType,
            sha256: string(media?.sha256),
            fileName: messageType === "document" ? string(media?.filename) : undefined,
          },
        });
      }

      for (const status of records(value.statuses)) {
        const messageId = string(status.id);
        const recipientId = string(status.recipient_id);
        const timestamp = string(status.timestamp);
        const providerStatus = string(status.status);
        if (
          !messageId ||
          !recipientId ||
          !timestamp ||
          !providerStatus ||
          !["sent", "delivered", "read", "failed"].includes(providerStatus)
        )
          continue;
        const firstError = records(status.errors)[0];
        events.push({
          kind: "delivery",
          messageId,
          recipientId,
          timestamp,
          deliveryStatus: mapWhatsAppDeliveryStatus(providerStatus as WhatsAppDeliveryStatus),
          failureReason:
            string(firstError?.title) ??
            string(firstError?.message) ??
            string(record(firstError?.error_data)?.details),
        });
      }
    }
  }
  return events;
}

function hexBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let index = 0; index < bytes.length; index++)
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

export async function verifyWhatsAppSignature(
  rawBody: BufferSource,
  signatureHeader: string,
  appSecret: string,
): Promise<boolean> {
  const digest = /^sha256=([\da-f]{64})$/i.exec(signatureHeader)?.[1];
  if (!digest) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, hexBytes(digest), rawBody);
}

type WhatsAppProviderError = Error | { status?: number; code?: number };

export function classifyWhatsAppError(error: WhatsAppProviderError): "transient" | "permanent" {
  if (error instanceof Error) return "transient";
  if (error.status === 429 || (error.status !== undefined && error.status >= 500))
    return "transient";
  return [4, 17, 32, 613, 80007, 130429, 131048].includes(error.code ?? -1)
    ? "transient"
    : "permanent";
}

type WhatsAppOutboundMessage =
  | { to: string; text: string }
  | {
      to: string;
      attachment: {
        type: "image" | "document" | "audio";
        id: string;
        caption?: string;
        fileName?: string;
      };
    };

export function renderWhatsAppMessage(message: WhatsAppOutboundMessage): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to: message.to };
  if ("text" in message) return { ...base, type: "text", text: { body: message.text } };

  const { type, id, caption, fileName } = message.attachment;
  const media = {
    id,
    ...(caption && type !== "audio" ? { caption } : {}),
    ...(fileName && type === "document" ? { filename: fileName } : {}),
  };
  return { ...base, type, [type]: media };
}
