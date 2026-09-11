-- WhatsApp media can arrive before the Session has produced a Ticket.
ALTER TABLE "Attachment" ALTER COLUMN "ticketId" DROP NOT NULL;
