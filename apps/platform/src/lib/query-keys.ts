/**
 * Centralized so a query and its invalidations can't drift apart (e.g.
 * workspace users being invalidated with a key that no longer matches the
 * one the list query was registered under).
 */
export const queryKeys = {
  auth: {
    all: ["auth"] as const,
    me: ["auth", "me"] as const,
  },
  workspace: {
    knowledgeSources: ["workspace", "knowledge-sources"] as const,
    users: ["workspace", "users"] as const,
    widgetConfig: ["workspace", "widget-config"] as const,
    whatsAppConfig: ["workspace", "whatsapp-config"] as const,
    myTickets: ["workspace", "my-tickets"] as const,
    sharedHumanQueue: ["workspace", "shared-human-queue"] as const,
    liveAiTickets: ["workspace", "live-ai-tickets"] as const,
    conversations: (filters: {
      category?: string;
      priority?: string;
      search?: string;
      status?: string;
    }) => ["workspace", "conversations", filters] as const,
    analytics: (range: { from: string; to: string }) => ["workspace", "analytics", range] as const,
    analyticsTraffic: (range: { from: string; to: string }) =>
      ["workspace", "analytics-traffic", range] as const,
    recentConversations: ["workspace", "recent-conversations"] as const,
    aiSettings: ["workspace", "ai-settings"] as const,
    ticket: (id: string) => ["workspace", "tickets", id] as const,
    conversationSession: (id: string) => ["workspace", "conversation-session", id] as const,
    tools: (aiAgentId: string) => ["workspace", "tools", aiAgentId] as const,
    mcpServers: ["workspace", "mcp-servers"] as const,
    aiUsageSummary: (range: { from: string; to: string }, filters: object = {}) =>
      ["workspace", "ai-usage-summary", range, filters] as const,
    aiToolUsage: (range: { from: string; to: string }, filters: object = {}) =>
      ["workspace", "ai-tool-usage", range, filters] as const,
    billing: ["workspace", "billing"] as const,
    creditLedger: ["workspace", "credit-ledger"] as const,
  },
} as const;
