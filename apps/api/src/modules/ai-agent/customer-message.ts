type DescribableAttachment = {
  extractedText: string | null;
  fileName: string;
  mimeType: string;
  processingStatus: "PROCESSING" | "READY" | "FAILED";
};

/** What a Message actually says to a model.
 *
 * An Attachment frequently carries the whole message — a voice note's words,
 * an invoice's figures — while `content` is empty, so anything reasoning over
 * a conversation has to read both or it sees a blank turn where the Customer
 * said the most important thing.
 *
 * A transcript stays labelled as Attachment content, so a mis-heard word is
 * never mistaken for something the Customer typed. */
export function describeMessageContent(message: {
  attachments: DescribableAttachment[];
  content: string;
}) {
  return [message.content, ...message.attachments.map(describeAttachment)]
    .filter(Boolean)
    .join("\n\n");
}

function describeAttachment(attachment: DescribableAttachment) {
  if (attachment.processingStatus === "PROCESSING")
    return `[Attached file ${attachment.fileName} is still being read.]`;
  if (attachment.processingStatus === "FAILED")
    return `[Attached file ${attachment.fileName} could not be read. Tell the Customer.]`;
  const label = attachment.mimeType.startsWith("audio/")
    ? "Automatic transcript of a voice note — may contain mistakes"
    : `Content of attached file ${attachment.fileName}`;
  return `[${label}]\n${attachment.extractedText}`;
}
