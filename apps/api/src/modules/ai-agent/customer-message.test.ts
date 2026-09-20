import { describe, expect, it } from "vitest";
import { describeMessageContent } from "./customer-message";

const attachment = {
  extractedText: null as string | null,
  fileName: "invoice.pdf",
  mimeType: "application/pdf",
  processingStatus: "READY" as "PROCESSING" | "READY" | "FAILED",
};

describe("describeMessageContent", () => {
  it("reads an Attachment-only Message as its Attachment's text", () => {
    // The property the Copilot's choice of "latest Customer message" rests on:
    // a voice note with no typed content must not look like an empty turn.
    const described = describeMessageContent({
      attachments: [
        {
          ...attachment,
          extractedText: "Baterainya terlalu panas.",
          fileName: "voice.ogg",
          mimeType: "audio/ogg",
        },
      ],
      content: "",
    });

    expect(described.trim()).not.toBe("");
    expect(described).toContain("Baterainya terlalu panas.");
  });

  it("labels a transcript so a mis-heard word is not read as something the Customer typed", () => {
    const described = describeMessageContent({
      attachments: [
        { ...attachment, extractedText: "halo", fileName: "voice.ogg", mimeType: "audio/ogg" },
      ],
      content: "tolong dengar ini",
    });

    expect(described).toBe(
      "tolong dengar ini\n\n[Automatic transcript of a voice note — may contain mistakes]\nhalo",
    );
  });

  it("names a document rather than passing its text off as the Customer's words", () => {
    expect(
      describeMessageContent({
        attachments: [{ ...attachment, extractedText: "Total USD 149.99" }],
        content: "",
      }),
    ).toBe("[Content of attached file invoice.pdf]\nTotal USD 149.99");
  });

  it("distinguishes an Attachment still being read from one that failed", () => {
    expect(
      describeMessageContent({
        attachments: [{ ...attachment, processingStatus: "PROCESSING" }],
        content: "",
      }),
    ).toBe("[Attached file invoice.pdf is still being read.]");
    expect(
      describeMessageContent({
        attachments: [{ ...attachment, processingStatus: "FAILED" }],
        content: "",
      }),
    ).toBe("[Attached file invoice.pdf could not be read. Tell the Customer.]");
  });
});
