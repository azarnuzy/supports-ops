import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock("./prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@repo/api/credits", () => ({ spendForTurn: vi.fn() }));
vi.mock("@repo/api/whatsapp-queue", () => ({ enqueueWhatsAppDelivery: vi.fn() }));
vi.mock("@repo/api/ticket-queue", () => ({ enqueueTicketKnowledgeIndex: vi.fn() }));

import { processAutoResolveJob, processFollowUpJob } from "./follow-up";

describe("Follow-Up transaction query ordering", () => {
  it.each([processFollowUpJob, processAutoResolveJob])(
    "%s waits for the Ticket query before reading settings",
    async (processJob) => {
      let queryRunning = false;
      const findTicket = vi.fn(async () => {
        queryRunning = true;
        await Promise.resolve();
        queryRunning = false;
        return null;
      });
      const findSettings = vi.fn(async () => {
        expect(queryRunning).toBe(false);
        return null;
      });
      const tx = {
        ticket: { findFirst: findTicket },
        aiSettings: { findUnique: findSettings },
      };
      mocks.transaction.mockImplementation(async (operation) => operation(tx));

      await processJob({
        data: {
          aiMessageId: "ai-message",
          followUpMessageId: "follow-up-message",
          ticketId: "ticket",
          workspaceId: "workspace",
        },
      });

      expect(findTicket).toHaveBeenCalledOnce();
      expect(findSettings).toHaveBeenCalledOnce();
    },
  );
});
