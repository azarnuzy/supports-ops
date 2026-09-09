import type { TicketActivity } from "@repo/api-client";

export type ActivityDescription = { mono?: string; text: string };

/** Maps a raw AI Activity event into human-readable text for the Activity timeline. */
export function describeActivity(activity: TicketActivity): ActivityDescription {
  const metadata = activity.metadata ?? {};
  switch (activity.eventType) {
    case "TICKET_CREATED":
      return { text: "Ticket created." };
    case "CLASSIFIED":
      return {
        mono: [metadata.category, metadata.priority].filter(Boolean).join(" · "),
        text: "Classified",
      };
    case "KNOWLEDGE_RETRIEVED": {
      const count = Array.isArray(metadata.chunkIds) ? metadata.chunkIds.length : 0;
      return { text: `Knowledge retrieved — ${count} chunk${count === 1 ? "" : "s"}.` };
    }
    case "TOOL_CALLED":
      return { mono: String(metadata.tool ?? ""), text: "Tool called" };
    case "TOOL_FAILED":
      return { mono: String(metadata.tool ?? ""), text: "Tool failed" };
    case "AI_REPLIED":
      return { text: "AI Agent replied." };
    case "CLARIFICATION_ASKED":
      return { text: "AI Agent asked a clarifying question." };
    case "ESCALATED":
      return { mono: String(metadata.reason ?? ""), text: "Escalated" };
    case "FOLLOW_UP_SENT":
      return { text: "Follow-up sent to the Customer." };
    case "RESOLVED":
      return { mono: String(metadata.reason ?? ""), text: "Resolved" };
    case "CLAIMED":
      return { text: "Claimed by a Human Agent." };
    case "TAKEN_OVER":
      return { text: "Taken over by an Admin." };
    case "HANDOFF_SENT":
      return { mono: String(metadata.humanAgentName ?? ""), text: "Handoff sent to" };
    case "SUMMARY_GENERATED":
      return { mono: String(metadata.outcome ?? ""), text: "Escalation summary generated" };
    case "SUGGESTED_REPLY_GENERATED":
      return { text: "Suggested reply generated." };
    case "TICKET_KNOWLEDGE_INDEXED":
      return { text: "Indexed as Ticket Knowledge." };
    case "TICKET_KNOWLEDGE_RETRIEVED":
      return { text: "Retrieved Ticket Knowledge from a previous Ticket." };
    default:
      return { text: activity.eventType.replaceAll("_", " ").toLowerCase() };
  }
}
