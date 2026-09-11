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
    allTickets: (filters: {
      category?: string;
      priority?: string;
      search?: string;
      status?: string;
    }) => ["workspace", "all-tickets", filters] as const,
    analytics: ["workspace", "analytics"] as const,
    analyticsTraffic: ["workspace", "analytics-traffic"] as const,
    aiSettings: ["workspace", "ai-settings"] as const,
    ticket: (id: string) => ["workspace", "tickets", id] as const,
    tools: (aiAgentId: string) => ["workspace", "tools", aiAgentId] as const,
    mcpServers: ["workspace", "mcp-servers"] as const,
  },
} as const;
