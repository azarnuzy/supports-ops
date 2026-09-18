/** Where a Message with `position` belongs among the bubbles already rendered.
 *
 * Bubbles without a position — an optimistic send, a pre-Ticket ephemeral
 * turn, an in-flight streamed reply, the typing indicator — are pinned to the
 * end of the transcript, so a persisted Message must land *above* them rather
 * than after. Comparing only against positioned bubbles is what produced
 * `customer, customer, agent, agent`: the AI Agent's reply to turn N arrived
 * while turn N+1 was already on screen as an unpositioned bubble, and got
 * appended behind it.
 *
 * Returns -1 when the Message goes last.
 */
export function orderedInsertIndex(rendered: (number | undefined)[], position: number) {
  return rendered.findIndex((existing) => existing === undefined || existing > position);
}
