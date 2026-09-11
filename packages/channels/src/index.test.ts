import { describe, expect, it } from "vitest";
import {
  classifyWhatsAppError,
  mapWhatsAppDeliveryStatus,
  parseWhatsAppWebhook,
  refuseWhatsAppAttachment,
  renderWhatsAppMessage,
  verifyWhatsAppSignature,
  webDeliveryStates,
  whatsAppAttachmentCapability,
  whatsAppDeliveryStates,
} from "./index";

describe("verifyWhatsAppSignature", () => {
  const genuineBody = new TextEncoder().encode('{"entry":[]}\n');
  const genuineSignature =
    "sha256=b10230767dc2c868271c3f6c4f8ecbfdd07399598638bacbf1fd875937f70667";

  it("accepts only the raw payload signed with the App Secret", async () => {
    await expect(
      verifyWhatsAppSignature(genuineBody, genuineSignature, "test-secret"),
    ).resolves.toBe(true);
    await expect(
      verifyWhatsAppSignature(
        new TextEncoder().encode('{"entry":[1]}\n'),
        genuineSignature,
        "test-secret",
      ),
    ).resolves.toBe(false);
    await expect(
      verifyWhatsAppSignature(genuineBody.slice(0, -1), genuineSignature, "test-secret"),
    ).resolves.toBe(false);
    await expect(
      verifyWhatsAppSignature(genuineBody, genuineSignature, "wrong-secret"),
    ).resolves.toBe(false);
  });
});

describe("parseWhatsAppWebhook", () => {
  it("normalizes text, image, document, audio, and every delivery state", () => {
    const events = parseWhatsAppWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "phone-1" },
                contacts: [{ wa_id: "628123", profile: { name: "Ayu" } }],
                messages: [
                  {
                    from: "628123",
                    id: "m-text",
                    timestamp: "1700000000",
                    type: "text",
                    text: { body: "Hi" },
                  },
                  {
                    from: "628123",
                    id: "m-image",
                    timestamp: "1700000001",
                    type: "image",
                    image: {
                      id: "image-1",
                      mime_type: "image/jpeg",
                      sha256: "image-sha",
                      caption: "Broken",
                    },
                  },
                  {
                    from: "628123",
                    id: "m-document",
                    timestamp: "1700000002",
                    type: "document",
                    document: {
                      id: "document-1",
                      mime_type: "application/pdf",
                      sha256: "document-sha",
                      filename: "invoice.pdf",
                      caption: "Invoice",
                    },
                  },
                  {
                    from: "628123",
                    id: "m-audio",
                    timestamp: "1700000003",
                    type: "audio",
                    audio: {
                      id: "audio-1",
                      mime_type: "audio/ogg",
                      sha256: "audio-sha",
                      voice: true,
                    },
                  },
                ],
                statuses: [
                  { id: "out-1", recipient_id: "628123", timestamp: "1700000004", status: "sent" },
                  {
                    id: "out-1",
                    recipient_id: "628123",
                    timestamp: "1700000005",
                    status: "delivered",
                  },
                  { id: "out-1", recipient_id: "628123", timestamp: "1700000006", status: "read" },
                  {
                    id: "out-2",
                    recipient_id: "628123",
                    timestamp: "1700000007",
                    status: "failed",
                    errors: [{ title: "Message undeliverable" }],
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(events).toEqual([
      {
        kind: "message",
        messageId: "m-text",
        from: "628123",
        timestamp: "1700000000",
        phoneNumberId: "phone-1",
        customerName: "Ayu",
        text: "Hi",
      },
      {
        kind: "message",
        messageId: "m-image",
        from: "628123",
        timestamp: "1700000001",
        phoneNumberId: "phone-1",
        customerName: "Ayu",
        text: "Broken",
        attachment: { id: "image-1", type: "image", mimeType: "image/jpeg", sha256: "image-sha" },
      },
      {
        kind: "message",
        messageId: "m-document",
        from: "628123",
        timestamp: "1700000002",
        phoneNumberId: "phone-1",
        customerName: "Ayu",
        text: "Invoice",
        attachment: {
          id: "document-1",
          type: "document",
          mimeType: "application/pdf",
          sha256: "document-sha",
          fileName: "invoice.pdf",
        },
      },
      {
        kind: "message",
        messageId: "m-audio",
        from: "628123",
        timestamp: "1700000003",
        phoneNumberId: "phone-1",
        customerName: "Ayu",
        attachment: { id: "audio-1", type: "audio", mimeType: "audio/ogg", sha256: "audio-sha" },
      },
      {
        kind: "delivery",
        messageId: "out-1",
        recipientId: "628123",
        timestamp: "1700000004",
        deliveryStatus: "SENT",
      },
      {
        kind: "delivery",
        messageId: "out-1",
        recipientId: "628123",
        timestamp: "1700000005",
        deliveryStatus: "DELIVERED",
      },
      {
        kind: "delivery",
        messageId: "out-1",
        recipientId: "628123",
        timestamp: "1700000006",
        deliveryStatus: "READ",
      },
      {
        kind: "delivery",
        messageId: "out-2",
        recipientId: "628123",
        timestamp: "1700000007",
        deliveryStatus: "FAILED",
        failureReason: "Message undeliverable",
      },
    ]);
  });

  it("discards webhook fields and message types the platform does not handle", () => {
    expect(
      parseWhatsAppWebhook({
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  metadata: { phone_number_id: "phone-1" },
                  messages: [
                    {
                      from: "628123",
                      id: "m-sticker",
                      timestamp: "1700000000",
                      type: "sticker",
                      sticker: {},
                    },
                  ],
                },
              },
              { field: "account_update", value: { event: "VERIFIED_ACCOUNT" } },
            ],
          },
        ],
      }),
    ).toEqual([]);
    expect(parseWhatsAppWebhook({ object: "something_else" })).toEqual([]);
  });
});

describe("WhatsApp delivery", () => {
  it("maps provider states and declares the states each adapter reports", () => {
    expect(
      (["sent", "delivered", "read", "failed"] as const).map(mapWhatsAppDeliveryStatus),
    ).toEqual(["SENT", "DELIVERED", "READ", "FAILED"]);
    expect(webDeliveryStates).toEqual(["PENDING", "SENT", "FAILED"]);
    expect(whatsAppDeliveryStates).toEqual(["SENT", "DELIVERED", "READ", "FAILED"]);
  });
});

describe("classifyWhatsAppError", () => {
  it("retries rate limits, server failures, and network faults only", () => {
    expect(classifyWhatsAppError({ status: 429 })).toBe("transient");
    expect(classifyWhatsAppError({ status: 503 })).toBe("transient");
    expect(classifyWhatsAppError(new TypeError("fetch failed"))).toBe("transient");
    expect(classifyWhatsAppError({ code: 190 })).toBe("permanent");
    expect(classifyWhatsAppError({ code: 100 })).toBe("permanent");
    expect(classifyWhatsAppError({ code: 131047 })).toBe("permanent");
  });
});

describe("renderWhatsAppMessage", () => {
  it("renders text and uploaded media into Graph API request bodies", () => {
    expect(renderWhatsAppMessage({ to: "628123", text: "Hello" })).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "628123",
      type: "text",
      text: { body: "Hello" },
    });
    expect(
      renderWhatsAppMessage({
        to: "628123",
        attachment: { type: "document", id: "media-1", fileName: "guide.pdf", caption: "Guide" },
      }),
    ).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "628123",
      type: "document",
      document: { id: "media-1", filename: "guide.pdf", caption: "Guide" },
    });
  });
});

describe("whatsAppAttachmentCapability", () => {
  it("declares one media file and Meta's size limit for each supported type", () => {
    expect(whatsAppAttachmentCapability.maxFilesPerMessage).toBe(1);
    expect(whatsAppAttachmentCapability.maxFileSizeBytesByMimeType["image/jpeg"]).toBe(
      5 * 1024 * 1024,
    );
    expect(whatsAppAttachmentCapability.maxFileSizeBytesByMimeType["audio/ogg"]).toBe(
      16 * 1024 * 1024,
    );
    expect(whatsAppAttachmentCapability.maxFileSizeBytesByMimeType["application/pdf"]).toBe(
      100 * 1024 * 1024,
    );
  });
});

describe("refuseWhatsAppAttachment", () => {
  it("accepts a voice note whose MIME type carries codec parameters", () => {
    expect(refuseWhatsAppAttachment("audio/ogg; codecs=opus", 200_000)).toBeUndefined();
  });

  it("explains an unsupported type and a file over its type's limit", () => {
    expect(refuseWhatsAppAttachment("video/mp4", 1_000)).toMatch(/can't read this type/);
    expect(refuseWhatsAppAttachment("image/png", 6 * 1024 * 1024)).toMatch(/larger than 5 MB/);
    expect(refuseWhatsAppAttachment("application/pdf", 6 * 1024 * 1024)).toBeUndefined();
  });
});
