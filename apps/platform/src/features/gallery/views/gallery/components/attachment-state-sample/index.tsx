import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@repo/ui/components/attachment";
import type { AttachmentStateSampleProps } from "./index.types";

export default function AttachmentStateSample({ state, label, detail }: AttachmentStateSampleProps) {
  return (
    <Attachment state={state}>
      <AttachmentMedia />
      <AttachmentContent>
        <AttachmentTitle>{label}</AttachmentTitle>
        <AttachmentDescription>{detail}</AttachmentDescription>
      </AttachmentContent>
    </Attachment>
  );
}
