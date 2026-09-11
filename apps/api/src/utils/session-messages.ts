import { randomUUID } from "node:crypto";
import { type Prisma, unscopedPrisma } from "./prisma";

type TransactionClient = Omit<typeof unscopedPrisma, `$${string}`>;

/** Every Message on a Session — Customer, AI Agent, Human Agent, or system —
 * takes its position from the Session's counter, claimed inside the writing
 * transaction. One counter per conversation means the transcript is ordered
 * without a special case for the turns that came before a Ticket existed.
 * See ADR-0017. */
export async function claimMessageSlot(
  tx: TransactionClient,
  sessionId: string,
  options?: { fromCustomer?: boolean },
) {
  const session = await tx.session.update({
    data: {
      messageSeq: { increment: 1 },
      // The Customer's clock drives Follow-Up, Auto-Resolution, and Idle
      // Closure, so a Workspace user replying must never move it.
      ...(options?.fromCustomer ? { customerLastMessageAt: new Date() } : {}),
    },
    select: { conversation: { select: { id: true } }, messageSeq: true },
    where: { id: sessionId },
  });
  if (!session.conversation) throw new MissingAgentMemoryError(sessionId);

  return {
    id: randomUUID(),
    memorySessionId: session.conversation.id,
    position: session.messageSeq,
    runId: randomUUID(),
    sessionId,
    turn: session.messageSeq,
  } satisfies Partial<Prisma.MessageUncheckedCreateInput>;
}

/** A Session is opened with its Agent Memory, so this only fires for rows that
 * predate that rule or were written around it. */
export class MissingAgentMemoryError extends Error {
  constructor(sessionId: string) {
    super(`Session ${sessionId} has no Agent Memory.`);
    this.name = "MissingAgentMemoryError";
  }
}
