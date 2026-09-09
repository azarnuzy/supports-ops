# Channel adapters declare attachment capabilities

Attachments use one normalized Message-level model for both Customer and Human Agent Messages, while each Channel Adapter declares which directions, formats, size limits, and file counts its transport supports. The Ticket workspace renders and validates against those capabilities rather than assuming every Channel behaves like the Web Widget; this keeps Attachment handling consistent across a Ticket without forcing future Channels to support operations their transports cannot deliver.

## Consequences

The Web Widget initially supports inbound and outbound PDF, TXT, JPG, and PNG Attachments up to 10 MB each, with up to 10 Attachments on one Message. Preview and download authorization follows permission to view the parent Ticket, extraction status is distinct from delivery and storage availability, and adding audio or video requires the relevant Channel Adapter to declare support first.
