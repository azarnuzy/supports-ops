-- CreateTable
CREATE TABLE "TicketReadState" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadPosition" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketReadState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketReadState_workspaceId_userId_idx" ON "TicketReadState"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketReadState_ticketId_userId_key" ON "TicketReadState"("ticketId", "userId");

-- AddForeignKey
ALTER TABLE "TicketReadState" ADD CONSTRAINT "TicketReadState_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketReadState" ADD CONSTRAINT "TicketReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
