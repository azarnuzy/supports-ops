import type { TicketActivity } from "@repo/api-client";
import { formatEnumLabel } from "../../lib/utils";

export type ActivityDescription = {
  /** Tool arguments, pretty-printed — rendered as an expandable mono block. */
  args?: string;
  /** Why a Tool call failed — rendered in the destructive color. */
  error?: string;
  /** Muted secondary line, e.g. "MCP · Read only · 230 ms". */
  meta?: string;
  /** Inline mono identifier — Tool name, category · priority. */
  mono?: string;
  text: string;
};

type ToolCallMetadata = {
  error?: unknown;
  inputJson?: unknown;
  latencyMs?: unknown;
  origin?: unknown;
  risk?: unknown;
  tool?: unknown;
};

/** Tool origin as domain language (CONTEXT.md): Built-in Tool, HTTP Tool, MCP Tool. */
const ORIGIN_LABELS: Record<string, string> = {
  BUILT_IN: "Built-in",
  HTTP: "HTTP",
  MCP: "MCP",
};

function toolMeta(metadata: ToolCallMetadata) {
  const latency =
    typeof metadata.latencyMs === "number" && Number.isFinite(metadata.latencyMs)
      ? metadata.latencyMs < 1000
        ? `${Math.round(metadata.latencyMs)} ms`
        : `${(metadata.latencyMs / 1000).toFixed(1)} s`
      : undefined;
  const parts = [
    typeof metadata.origin === "string"
      ? (ORIGIN_LABELS[metadata.origin] ?? formatEnumLabel(metadata.origin))
      : undefined,
    typeof metadata.risk === "string" ? formatEnumLabel(metadata.risk) : undefined,
    latency,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function toolArgs(inputJson: unknown) {
  if (typeof inputJson !== "string" || inputJson.length === 0) return undefined;
  try {
    return JSON.stringify(JSON.parse(inputJson), null, 2);
  } catch {
    return inputJson;
  }
}

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
    case "TOOL_FAILED": {
      const tool = metadata as ToolCallMetadata;
      const failed = activity.eventType === "TOOL_FAILED";
      return {
        args: toolArgs(tool.inputJson),
        error:
          failed && typeof tool.error === "string" && tool.error.length > 0
            ? tool.error
            : undefined,
        meta: toolMeta(tool),
        mono: String(tool.tool ?? ""),
        text: failed ? "Tool failed" : "Tool called",
      };
    }
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
