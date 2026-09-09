# Channel attachment capabilities

Each Channel Adapter declares the directions, MIME types, maximum file size, and maximum Attachments per Message it supports. UI controls and server validation use the same declaration, so a narrower future Channel cannot accidentally expose unsupported files.

The Web Widget supports inbound and outbound PDF, TXT, JPEG, and PNG; each file is at most 10 MB and a Message carries at most ten files. DOCX, audio, and video are deliberately unsupported.

Attachments remain normalized records on a Message. Channel-specific delivery is an adapter concern, not an Attachment model concern.
