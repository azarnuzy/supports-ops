import { hc } from "hono/client";
import type { AppType } from "@repo/api";

export function createApiClient(baseUrl: string) {
  return hc<AppType>(baseUrl, {
    init: {
      credentials: "include",
    },
  });
}

export type ApiClient = ReturnType<typeof createApiClient>;

export type UpdateProfileInput = {
  image?: string | null;
  name: string;
};

export type AiSettings = {
  aiAgentId: string;
  followUpAfterSeconds: number;
  autoResolveAfterSeconds: number;
  autoResolveEnabled: boolean;
  idleCloseAfterSeconds: number;
  instructions: string;
  handoffMessage: string;
  resolutionMessage: string;
};

export async function fetchAiSettings(client: ApiClient) {
  const response = await client["ai-settings"].$get();

  if (response.status === 403) throw new Error("Only an Admin can manage AI settings.");
  if (!response.ok) throw new Error("Failed to load AI settings.");
  return (await response.json()) as { aiSettings: AiSettings };
}

export async function updateAiSettings(client: ApiClient, input: AiSettings) {
  const response = await client["ai-settings"].$patch({ json: input });
  if (!response.ok) throw new Error("Failed to save AI settings.");
  return (await response.json()) as { aiSettings: AiSettings };
}

export type ResolutionFigure = { count: number; rate: number | null };
export type AnalyticsStatusCount = { status: TicketStatus; count: number };
export type ChannelType = "WEB" | "WHATSAPP";
export type AnalyticsChannelCount = {
  channelId: string;
  channelName: string;
  channelType: ChannelType;
  ticketCount: number;
};
export type AnalyticsAgentLoad = {
  humanAgentId: string;
  humanAgentName: string;
  activeTicketCount: number;
};
export type AnalyticsOverview = {
  totalTickets: number;
  aiResolution: {
    customerConfirmed: ResolutionFigure;
    customerInactive: ResolutionFigure;
  };
  humanEscalation: ResolutionFigure;
  humanIdleClosure: {
    handled: ResolutionFigure;
    sharedQueue: ResolutionFigure;
  };
  statusCounts: AnalyticsStatusCount[];
  channelCounts: AnalyticsChannelCount[];
  activeTicketsPerHumanAgent: AnalyticsAgentLoad[];
};

export async function fetchAnalyticsOverview(client: ApiClient) {
  const response = await client.analytics.overview.$get();
  if (response.status === 403) throw new Error("Only an Admin can view Workspace analytics.");
  if (!response.ok) throw new Error("Failed to load analytics.");
  return (await response.json()) as { analytics: AnalyticsOverview };
}

export type AnalyticsHourBucket = { hourStart: string; count: number };
export type AnalyticsTraffic = {
  traffic: AnalyticsHourBucket[];
  resolutions: AnalyticsHourBucket[];
};

export async function fetchAnalyticsTraffic(client: ApiClient) {
  const response = await client.analytics.traffic.$get();
  if (response.status === 403) throw new Error("Only an Admin can view Workspace analytics.");
  if (!response.ok) throw new Error("Failed to load analytics.");
  return (await response.json()) as { analytics: AnalyticsTraffic };
}

export type WorkspaceUser = {
  createdAt: string;
  email: string;
  id: string;
  name: string;
  role: "ADMIN" | "HUMAN_AGENT";
  updatedAt: string;
};

export type CreateHumanAgentInput = {
  email: string;
  name: string;
  password: string;
};

export type TicketPriority = "LOW" | "NORMAL" | "HIGH";
export type TicketStatus = "AI_HANDLING" | "ESCALATED" | "HUMAN_HANDLING" | "RESOLVED";
/** A Workspace-configured category key. The label to show a human lives on `TicketCategoryOption`. */
export type TicketCategory = string;

export type TicketCategoryOption = {
  id: string;
  key: string;
  label: string;
  description: string;
  isFallback: boolean;
  sortOrder: number;
};

export type TicketCategoryInput = { label: string; description: string };
export type TicketMessage = {
  content: string;
  createdAt: string;
  deliveryFailureReason?: string | null;
  deliveryStatus: "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";
  position: number;
  senderType: "CUSTOMER" | "AI_AGENT" | "HUMAN_AGENT" | "SYSTEM";
};

export type SupportTicket = {
  assignedHumanAgent: { id: string; name: string } | null;
  category: TicketCategory;
  createdAt: string;
  escalatedAt: string | null;
  escalationSummary: string | null;
  escalationSummaryStatus: "PENDING" | "READY" | "FAILED";
  id: string;
  priority: TicketPriority;
  status: TicketStatus;
  title: string;
  customerIdentity: { name: string };
  messages: TicketMessage[];
  unreadCount: number;
};

export type TicketListItem = {
  assignedHumanAgent: { id: string; name: string } | null;
  category: TicketCategory;
  channel: { name: string; type: "WEB" | "WHATSAPP" };
  createdAt: string;
  customerIdentity: { email: string | null; id: string; name: string; phoneE164: string | null };
  id: string;
  priority: TicketPriority;
  resolvedAt: string | null;
  status: TicketStatus;
  title: string;
  unreadCount: number;
  updatedAt: string;
};

export type TicketAttachment = {
  failureReason: string | null;
  fileName: string;
  id: string;
  mimeType: string;
  processingStatus: "PROCESSING" | "READY" | "FAILED";
  sizeBytes: number;
};

export type TicketDetailMessage = TicketMessage & {
  attachments: TicketAttachment[];
  id: string;
  senderUserId: string | null;
};

export type TicketActivity = {
  createdAt: string;
  eventType: string;
  id: string;
  metadata: Record<string, unknown>;
};

export type TicketDetail = TicketListItem & {
  aiActivities: TicketActivity[];
  escalationReason: string | null;
  escalationSummary: string | null;
  escalationSummaryStatus: "PENDING" | "READY" | "FAILED";
  messages: TicketDetailMessage[];
  session: { createdAt: string };
  resolutionReason: string | null;
  resolvedBy: string | null;
};

export type ListTicketsFilters = {
  assigneeId?: string;
  category?: TicketCategory[];
  cursor?: string;
  limit?: number;
  priority?: TicketPriority[];
  search?: string;
  status?: TicketStatus[];
};

export class TicketAlreadyClaimedApiError extends Error {}

export async function listTickets(client: ApiClient, filters: ListTicketsFilters = {}) {
  const response = await client.tickets.$get({
    query: {
      ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
      ...(filters.category?.length ? { category: filters.category.join(",") } : {}),
      ...(filters.cursor ? { cursor: filters.cursor } : {}),
      ...(filters.limit ? { limit: String(filters.limit) } : {}),
      ...(filters.priority?.length ? { priority: filters.priority.join(",") } : {}),
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.status?.length ? { status: filters.status.join(",") } : {}),
    },
  });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (!response.ok) throw new Error("Failed to load Tickets.");
  return (await response.json()) as { nextCursor: string | null; tickets: TicketListItem[] };
}

export class TicketNotFoundApiError extends Error {
  constructor() {
    super("This Ticket no longer exists.");
    this.name = "TicketNotFoundApiError";
  }
}

export async function getTicketDetail(client: ApiClient, id: string) {
  const response = await client.tickets[":id"].$get({ param: { id } });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (response.status === 404) throw new TicketNotFoundApiError();
  if (!response.ok) throw new Error("Failed to load the Ticket.");
  return (await response.json()) as { ticket: TicketDetail };
}

export async function markTicketRead(client: ApiClient, id: string, position: number) {
  const response = await client.tickets[":id"].read.$post({ param: { id }, json: { position } });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (response.status === 404) throw new TicketNotFoundApiError();
  if (!response.ok) throw new Error("Failed to update read state.");
  return (await response.json()) as { lastReadPosition: number };
}

/** Streams realtime updates for one Ticket (new Messages, delivery and
 * status changes). The event name matches the payload's `type`, so
 * `addEventListener` handlers stay untyped and generic. */
export function subscribeToTicketEvents(baseUrl: string, ticketId: string, onEvent: () => void) {
  const events = new EventSource(`${baseUrl}/tickets/${ticketId}/events`, {
    withCredentials: true,
  });
  for (const type of [
    "message.created",
    "message.updated",
    "message.delta",
    "ticket.status",
    "attachment.updated",
  ])
    events.addEventListener(type, onEvent);
  return events;
}

/** Attachments open through the signed download URL, never through the raw
 * storage key. */
export async function getAttachmentUrl(
  client: ApiClient,
  id: string,
  mode: "download" | "preview",
) {
  const response = await client.attachments[":id"][":mode"].$get({ param: { id, mode } });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (!response.ok) throw new Error("Failed to open the attachment.");
  return (await response.json()) as { url: string };
}

export const getAttachmentDownloadUrl = (client: ApiClient, id: string) =>
  getAttachmentUrl(client, id, "download");

export async function listSharedHumanQueue(client: ApiClient) {
  const response = await client.tickets.queue.$get();
  if (response.status === 401) throw new UnauthorizedApiError();
  if (!response.ok) throw new Error("Failed to load the Shared Human Queue.");
  return (await response.json()) as { tickets: SupportTicket[] };
}

export async function listMyTickets(client: ApiClient) {
  const response = await client.tickets.mine.$get();
  if (response.status === 401) throw new UnauthorizedApiError();
  if (!response.ok) throw new Error("Failed to load your Tickets.");
  return (await response.json()) as { tickets: SupportTicket[] };
}

export async function listLiveAiTickets(client: ApiClient) {
  const response = await client.tickets.live.$get();

  if (response.status === 403) throw new Error("Only an Admin can view live AI-handled Tickets.");
  if (!response.ok) throw new Error("Failed to load live Tickets.");
  return (await response.json()) as { tickets: SupportTicket[] };
}

export async function takeOverTicket(client: ApiClient, id: string) {
  const response = await client.tickets[":id"].takeover.$post({ param: { id } });

  if (response.status === 403) throw new Error("Only an Admin can take over Tickets.");
  if (response.status === 409) throw new Error("This Ticket is no longer handled by the AI Agent.");
  if (!response.ok) throw new Error("Failed to take over the Ticket.");
  return (await response.json()) as { ticket: SupportTicket };
}

export async function claimTicket(client: ApiClient, id: string) {
  const response = await client.tickets[":id"].claim.$post({ param: { id } });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (response.status === 403) throw new Error("Only Human Agents can claim Tickets.");
  if (response.status === 409) {
    const data = (await response.json()) as { message: string };
    throw new TicketAlreadyClaimedApiError(data.message);
  }
  if (!response.ok) throw new Error("Failed to claim the Ticket.");
  return (await response.json()) as { ticket: SupportTicket };
}

export async function reassignTicket(client: ApiClient, id: string, humanAgentId: string) {
  const response = await client.tickets[":id"].assignee.$patch({
    param: { id },
    json: { humanAgentId },
  });

  if (response.status === 403) throw new Error("Only an Admin can reassign Tickets.");
  if (response.status === 422) throw new Error("Choose an active Human Agent in this Workspace.");
  if (response.status === 409) throw new Error("This Ticket can no longer be assigned.");
  if (!response.ok) throw new Error("Failed to reassign the Ticket.");
  return (await response.json()) as { ticket: SupportTicket };
}

export async function sendHumanReply(
  client: ApiClient,
  id: string,
  content: string,
  idempotencyKey: string,
) {
  const response = await client.tickets[":id"].messages.$post({
    param: { id },
    json: { content, idempotencyKey },
  });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (response.status === 403) throw new Error("Only the assigned Human Agent can reply.");
  if (response.status === 409) throw new Error("This Ticket is no longer open for replies.");
  if (!response.ok) throw new Error("Failed to send the reply.");
  return response.json();
}

export async function sendHumanAttachments(
  client: ApiClient,
  id: string,
  content: string,
  files: File[],
  idempotencyKey: string,
) {
  const response = await client.tickets[":id"].attachments.$post({
    form: { content, files, idempotencyKey } as never,
    param: { id },
  });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (response.status === 403) throw new Error("Only the assigned Human Agent can reply.");
  if (response.status === 409) throw new Error("This Ticket is no longer open for replies.");
  if (response.status === 422)
    throw new Error("Attachments must be PDF, TXT, JPG, or PNG and no larger than 10 MB.");
  if (!response.ok) throw new Error("Failed to send the reply.");
  return response.json();
}

export async function retryHumanReply(client: ApiClient, id: string, messageId: string) {
  const response = await client.tickets[":id"].messages[":messageId"].retry.$post({
    param: { id, messageId },
  });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (response.status === 403) throw new Error("Only the assigned Human Agent can retry a reply.");
  if (response.status === 409) throw new Error("This reply can no longer be retried.");
  if (!response.ok) throw new Error("Failed to retry the reply.");
  return response.json();
}

export async function generateSuggestedReply(client: ApiClient, id: string) {
  const response = await client.tickets[":id"]["suggested-reply"].$post({ param: { id } });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (response.status === 403)
    throw new Error("Only the assigned Human Agent can request a Suggested Reply.");
  if (response.status === 409) throw new Error("This Ticket is no longer open for replies.");
  if (response.status === 503)
    throw new Error("Configure OPENROUTER_API_KEY to use the AI Copilot.");
  if (!response.ok) throw new Error("Failed to generate the Suggested Reply.");
  return (await response.json()) as { suggestedReply: { content: string } };
}

export async function resolveHumanTicket(client: ApiClient, id: string) {
  const response = await client.tickets[":id"].resolve.$post({
    param: { id },
    json: { resolutionReason: "HUMAN_RESOLVED" },
  });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (response.status === 403) throw new Error("Only the Ticket owner can resolve this Ticket.");
  if (response.status === 409)
    throw new Error("Finish or retry the pending reply before resolving this Ticket.");
  if (!response.ok) throw new Error("Failed to resolve the Ticket.");
  return response.json();
}

export class UnauthorizedApiError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedApiError";
  }
}

export async function fetchSessionUser(client: ApiClient) {
  const response = await client.session.$get();

  if (response.status === 401) {
    throw new UnauthorizedApiError();
  }

  if (!response.ok) {
    throw new Error("Failed to load current user.");
  }

  const data = await response.json();

  return data.user;
}

export async function updateCurrentUserProfile(client: ApiClient, input: UpdateProfileInput) {
  const response = await client.profile.$patch({
    json: input,
  });

  if (response.status === 401) {
    throw new UnauthorizedApiError();
  }

  if (!response.ok) {
    throw new Error("Failed to update profile.");
  }

  const data = await response.json();

  return data.user;
}

export async function listWorkspaceUsers(client: ApiClient) {
  const response = await client.users.$get({ query: {} });

  if (response.status === 403) {
    throw new Error("You do not have permission to view Human Agents.");
  }

  if (!response.ok) {
    throw new Error("Failed to load Human Agents.");
  }

  return (await response.json()) as { nextCursor: string | null; users: WorkspaceUser[] };
}

export async function createWorkspaceHumanAgent(client: ApiClient, input: CreateHumanAgentInput) {
  const response = await client.users.$post({ json: input });

  if (response.status === 403) {
    throw new Error("You do not have permission to create Human Agents.");
  }

  if (response.status === 409) {
    const data = (await response.json()) as { message: string };
    throw new EmailAlreadyInUseApiError(data.message);
  }

  if (!response.ok) {
    throw new Error("Failed to create Human Agent.");
  }

  return (await response.json()) as { user: WorkspaceUser };
}

export type WebWidgetConfig = {
  id: string;
  widgetKey: string;
  botName: string;
  welcomeMessage: string;
  primaryColor: string;
  allowedDomains: string[];
  logoKey: string | null;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpdateWebWidgetConfigInput = {
  botName: string;
  welcomeMessage: string;
  primaryColor: string;
  closingMessage: string | null;
  allowedDomains: string[];
  logoKey?: string | null;
};

export type WebWidgetConfigResult = {
  webWidgetConfig: WebWidgetConfig;
  closingMessage: string | null;
};

export async function fetchWebWidgetConfig(client: ApiClient) {
  const response = await client["widget-config"].$get();

  if (response.status === 403) {
    throw new Error("You do not have permission to view the Web Widget configuration.");
  }

  if (!response.ok) {
    throw new Error("Failed to load the Web Widget configuration.");
  }

  return (await response.json()) as WebWidgetConfigResult;
}

export async function updateWebWidgetConfig(client: ApiClient, input: UpdateWebWidgetConfigInput) {
  const response = await client["widget-config"].$patch({ json: input });

  if (response.status === 403) {
    throw new Error("You do not have permission to update the Web Widget configuration.");
  }

  if (!response.ok) {
    throw new Error("Failed to save the Web Widget configuration.");
  }

  return (await response.json()) as WebWidgetConfigResult;
}

export async function uploadWebWidgetLogo(client: ApiClient, file: File) {
  const response = await client["widget-config"].logo.$post({ form: { file } });

  if (response.status === 403) {
    throw new Error("You do not have permission to update the Web Widget configuration.");
  }

  if (!response.ok) {
    const data = (await response.json()) as { message?: string };
    throw new Error(data.message ?? "Failed to upload the logo.");
  }

  return (await response.json()) as WebWidgetConfigResult;
}

export type WhatsAppConfig = {
  accessTokenLastFour: string;
  businessAccountId: string;
  callbackUrl: string;
  displayPhoneNumber: string;
  enabled: boolean;
  health: "AWAITING_WEBHOOK" | "HEALTHY" | "DISABLED" | "TOKEN_INVALID";
  phoneNumberId: string;
  verifiedAt: string;
  verifiedName: string | null;
  verifyToken: string;
};

export type VerifyWhatsAppConfigInput = {
  accessToken: string;
  appSecret: string;
  businessAccountId: string;
  phoneNumberId: string;
};

export async function fetchWhatsAppConfig(client: ApiClient) {
  const response = await client["whatsapp-config"].$get();
  if (response.status === 403) throw new Error("Only an Admin can manage WhatsApp.");
  if (!response.ok) throw new Error("Failed to load the WhatsApp configuration.");
  return (await response.json()) as { whatsAppConfig: WhatsAppConfig | null };
}

export async function verifyWhatsAppConfig(
  client: ApiClient,
  input: VerifyWhatsAppConfigInput,
) {
  const response = await client["whatsapp-config"].verify.$post({ json: input });
  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? "Failed to verify the WhatsApp credentials.");
  }
  return (await response.json()) as { whatsAppConfig: WhatsAppConfig };
}

export async function updateWhatsAppConfig(client: ApiClient, enabled: boolean) {
  const response = await client["whatsapp-config"].$patch({ json: { enabled } });
  if (!response.ok) throw new Error("Failed to update the WhatsApp Channel.");
  return (await response.json()) as { whatsAppConfig: WhatsAppConfig };
}

export type RegisterWorkspaceAdminInput = {
  email: string;
  name: string;
  password: string;
};

export class EmailAlreadyInUseApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailAlreadyInUseApiError";
  }
}

export async function registerWorkspaceAdmin(
  client: ApiClient,
  input: RegisterWorkspaceAdminInput,
) {
  const response = await client.register.$post({
    json: input,
  });

  if (response.status === 409) {
    const data = (await response.json()) as { error: string; message: string };
    throw new EmailAlreadyInUseApiError(data.message);
  }

  if (!response.ok) {
    throw new Error("Registration failed.");
  }
}

export type KnowledgeSourceType = "MANUAL_FAQ" | "PDF" | "URL" | "HELP_CENTER" | "INTERNAL_SOP";
export type KnowledgeVisibility = "CUSTOMER_SAFE" | "INTERNAL_ONLY";
export type KnowledgeStatus = "DRAFT" | "PROCESSING" | "READY" | "PUBLISHED" | "FAILED";
export type KnowledgeIngestStage =
  | "UPLOADING"
  | "EXTRACTING"
  | "CHUNKING"
  | "EMBEDDING"
  | "INDEXING"
  | "PUBLISHED";

export type KnowledgeSource = {
  id: string;
  sourceType: KnowledgeSourceType;
  title: string;
  content: string | null;
  parentId: string | null;
  sourceUrl: string | null;
  visibility: KnowledgeVisibility;
  status: KnowledgeStatus;
  stage: KnowledgeIngestStage | null;
  failedStage: KnowledgeIngestStage | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type ManualFaqInput = {
  title: string;
  content: string;
  visibility: KnowledgeVisibility;
};

export type DocumentationUrlInput = { url: string; visibility: KnowledgeVisibility };

export type RetrievalTestResult = {
  knowledgeSourceId: string;
  title: string;
  chunkContent: string;
  similarity: number;
};

export class KnowledgeSourceNotFoundApiError extends Error {
  constructor() {
    super("This Knowledge Source no longer exists.");
    this.name = "KnowledgeSourceNotFoundApiError";
  }
}

export class KnowledgeSourceProcessingApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgeSourceProcessingApiError";
  }
}

export class EmbeddingNotConfiguredApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingNotConfiguredApiError";
  }
}

export async function listKnowledgeSources(client: ApiClient) {
  const response = await client.knowledge.$get();

  if (response.status === 403) {
    throw new Error("You do not have permission to view Knowledge Sources.");
  }

  if (!response.ok) {
    throw new Error("Failed to load Knowledge Sources.");
  }

  return (await response.json()) as { knowledgeSources: KnowledgeSource[] };
}

export async function createManualFaq(client: ApiClient, input: ManualFaqInput) {
  const response = await client.knowledge.$post({ json: input });

  if (!response.ok) {
    throw new Error("Failed to create the Knowledge Source.");
  }

  return (await response.json()) as { knowledgeSource: KnowledgeSource };
}

export async function createDocumentationUrl(client: ApiClient, input: DocumentationUrlInput) {
  const response = await client.knowledge.url.$post({ json: input });
  if (!response.ok) throw new Error("Failed to start documentation crawl.");
  return (await response.json()) as { knowledgeSource: KnowledgeSource };
}

export async function createPdfKnowledgeSource(
  client: ApiClient,
  file: File,
  visibility: KnowledgeVisibility,
) {
  const response = await client.knowledge.pdf.$post({ form: { file, visibility } });
  if (!response.ok) {
    const data = (await response.json()) as { message?: string };
    throw new Error(data.message ?? "Failed to upload PDF.");
  }
  return (await response.json()) as { knowledgeSource: KnowledgeSource };
}

export async function updateKnowledgeSource(client: ApiClient, id: string, input: ManualFaqInput) {
  const response = await client.knowledge[":id"].$patch({ json: input, param: { id } });

  if (response.status === 404) {
    throw new KnowledgeSourceNotFoundApiError();
  }

  if (response.status === 409) {
    const data = (await response.json()) as { message: string };
    throw new KnowledgeSourceProcessingApiError(data.message);
  }

  if (!response.ok) {
    throw new Error("Failed to save the Knowledge Source.");
  }

  return (await response.json()) as { knowledgeSource: KnowledgeSource };
}

export async function refreshKnowledgeSource(client: ApiClient, id: string) {
  const response = await client.knowledge[":id"].refresh.$post({ param: { id } });

  if (response.status === 404) {
    throw new KnowledgeSourceNotFoundApiError();
  }

  if (response.status === 409 || response.status === 422) {
    const data = (await response.json()) as { message: string };
    throw new KnowledgeSourceProcessingApiError(data.message);
  }

  if (!response.ok) {
    throw new Error("Failed to update the source.");
  }

  return (await response.json()) as { knowledgeSource: KnowledgeSource };
}

export async function publishKnowledgeSource(client: ApiClient, id: string) {
  const response = await client.knowledge[":id"].publish.$post({ param: { id } });

  if (response.status === 404) {
    throw new KnowledgeSourceNotFoundApiError();
  }

  if (response.status === 409 || response.status === 422) {
    const data = (await response.json()) as { message: string };
    throw new KnowledgeSourceProcessingApiError(data.message);
  }

  if (!response.ok) {
    throw new Error("Failed to publish the Knowledge Source.");
  }

  return (await response.json()) as { knowledgeSource: KnowledgeSource };
}

export async function deleteKnowledgeSource(client: ApiClient, id: string) {
  const response = await client.knowledge[":id"].$delete({ param: { id } });

  if (response.status === 404) {
    throw new KnowledgeSourceNotFoundApiError();
  }

  if (!response.ok) {
    throw new Error("Failed to delete the Knowledge Source.");
  }
}
export async function testKnowledgeRetrieval(client: ApiClient, query: string) {
  const response = await client.knowledge["retrieval-test"].$post({ json: { query } });

  if (response.status === 503) {
    const data = (await response.json()) as { message: string };
    throw new EmbeddingNotConfiguredApiError(data.message);
  }

  if (!response.ok) {
    throw new Error("Retrieval test failed.");
  }

  return (await response.json()) as { results: RetrievalTestResult[] };
}

export type ToolOrigin = "BUILT_IN" | "HTTP" | "MCP";
export type ToolRisk = "READ_ONLY" | "MUTATING";
export type ToolAvailability = "AVAILABLE" | "UNAVAILABLE";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type McpDiscoveryStatus = "CURRENT" | "CHANGED" | "UNAVAILABLE";

export type HttpTool = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  inputSchema: unknown;
  risk: ToolRisk;
  method: HttpMethod;
  url: string;
  hasBearerToken: boolean;
  hasSecretHeaders: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CatalogTool = {
  id: string;
  origin: ToolOrigin;
  name: string;
  description: string;
  enabled: boolean;
  inputSchema: unknown;
  risk: ToolRisk;
  createdAt: string;
  updatedAt: string;
  assigned: boolean;
  availability: ToolAvailability;
  lastCall: { at: string; succeeded: boolean } | null;
  usageInstruction: string | null;
};

export type HttpToolTestResult =
  | { ok: true; body: string; latencyMs: number; status: number }
  | { ok: false; code: "DENIED" | "HTTP" | "NETWORK" | "OVERSIZED_RESULT" | "TIMEOUT" | "VALIDATION" };

export type ToolCall = {
  at: string;
  latencyMs: number;
  succeeded: boolean;
  ticketId: string;
};

export type ToolCallLog = {
  calls: ToolCall[];
  stats: { avgLatencyMs: number; failed: number; total: number };
};

export type HttpToolInput = {
  name: string;
  description: string;
  enabled: boolean;
  inputSchema: Record<string, unknown>;
  method: HttpMethod;
  url: string;
  risk: ToolRisk;
  bearerToken?: string | null;
  secretHeaders?: Record<string, string> | null;
};

export class ToolApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ToolApiError";
  }
}

async function readToolError(response: Response, fallback: string) {
  if (response.status === 404) return new ToolApiError("not_found", "This Tool no longer exists.");
  if (response.status === 409) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    if (data?.error === "tool_unavailable")
      return new ToolApiError(
        data?.error ?? "tool_unavailable",
        "This Tool is not available to assign.",
      );
    if (data?.error === "tool_not_assigned")
      return new ToolApiError(
        data?.error ?? "tool_not_assigned",
        "Switch this Tool on for the AI Agent first.",
      );
  }
  if (response.status === 422) {
    const data = (await response.json().catch(() => null)) as { message?: string } | null;
    return new ToolApiError("invalid_schema", data?.message ?? "The input schema is invalid.");
  }
  return new Error(fallback);
}

export async function listHttpTools(client: ApiClient) {
  const response = await client.tools.$get({ query: {} });
  if (response.status === 403) throw new Error("Only an Admin can manage Tools.");
  if (!response.ok) throw new Error("Failed to load Tools.");
  return (await response.json()) as { tools: HttpTool[] };
}

export async function listCatalogTools(client: ApiClient, aiAgentId: string) {
  const response = await client.tools.$get({ query: { aiAgentId } });
  if (response.status === 403) throw new Error("Only an Admin can manage Tools.");
  if (!response.ok) throw new Error("Failed to load Tools.");
  return (await response.json()) as { tools: CatalogTool[] };
}

export async function getHttpTool(client: ApiClient, id: string) {
  const response = await client.tools[":id"].$get({ param: { id } });
  if (!response.ok) throw await readToolError(response, "Failed to load the HTTP Tool.");
  return (await response.json()) as { tool: HttpTool };
}

export async function createHttpTool(client: ApiClient, input: HttpToolInput) {
  const response = await client.tools.$post({ json: input });
  if (!response.ok) throw await readToolError(response, "Failed to create the HTTP Tool.");
  return (await response.json()) as { tool: HttpTool };
}

export async function updateHttpTool(client: ApiClient, id: string, input: HttpToolInput) {
  const response = await client.tools[":id"].$put({ json: input, param: { id } });
  if (!response.ok) throw await readToolError(response, "Failed to save the HTTP Tool.");
  return (await response.json()) as { tool: HttpTool };
}

export async function listToolCalls(client: ApiClient, id: string) {
  const response = await client.tools[":id"].logs.$get({ param: { id } });
  if (!response.ok) throw await readToolError(response, "Failed to load the tool logs.");
  return (await response.json()) as ToolCallLog;
}

export async function testHttpTool(
  client: ApiClient,
  id: string,
  input: Record<string, unknown>,
) {
  const response = await client.tools[":id"].test.$post({ json: { input }, param: { id } });
  if (!response.ok) throw await readToolError(response, "Failed to test the Webhook.");
  return (await response.json()) as { result: HttpToolTestResult };
}

export async function deleteHttpTool(client: ApiClient, id: string) {
  const response = await client.tools[":id"].$delete({ param: { id } });
  if (!response.ok) throw await readToolError(response, "Failed to delete the HTTP Tool.");
}

export async function setToolEnabled(client: ApiClient, toolId: string, enabled: boolean) {
  const response = await client.tools[":toolId"].$patch({
    json: { enabled },
    param: { toolId },
  });
  if (!response.ok) throw await readToolError(response, "Failed to update the Tool.");
  return (await response.json()) as { tool: CatalogTool };
}

export async function setToolAssignment(
  client: ApiClient,
  toolId: string,
  aiAgentId: string,
  assigned: boolean,
) {
  const response = await client.tools[":toolId"].assignments[":aiAgentId"].$put({
    json: { assigned },
    param: { aiAgentId, toolId },
  });
  if (!response.ok) throw await readToolError(response, "Failed to update the Tool assignment.");
}

export async function setToolUsageInstruction(
  client: ApiClient,
  toolId: string,
  aiAgentId: string,
  usageInstruction: string | null,
) {
  const response = await client.tools[":toolId"].instructions[":aiAgentId"].$put({
    json: { usageInstruction },
    param: { aiAgentId, toolId },
  });
  if (!response.ok) throw await readToolError(response, "Failed to save when to use this Tool.");
}

export type McpServer = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type McpServerInput = {
  name: string;
  url: string;
  enabled?: boolean;
  bearerToken?: string | null;
  secretHeaders?: Record<string, string> | null;
};

export type McpTool = {
  toolId: string;
  mcpServerId: string;
  remoteName: string;
  discoveredSchema: unknown;
  discoveredDescription: string;
  discoveryStatus: McpDiscoveryStatus;
  discoveredAt: string;
  tool: CatalogTool;
};

export class McpApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "McpApiError";
  }
}

async function readMcpError(response: Response, fallback: string) {
  if (response.status === 404)
    return new McpApiError("not_found", "This MCP Server no longer exists.");
  if (response.status === 409) {
    const data = (await response.json().catch(() => null)) as { message?: string } | null;
    return new McpApiError(
      "tool_denied",
      data?.message ?? "This MCP Tool can no longer be enabled.",
    );
  }
  return new Error(fallback);
}

export async function listMcpServers(client: ApiClient) {
  const response = await client["mcp-servers"].$get();
  if (response.status === 403) throw new Error("Only an Admin can manage MCP Servers.");
  if (!response.ok) throw new Error("Failed to load MCP Servers.");
  return (await response.json()) as { servers: McpServer[] };
}

export async function createMcpServer(client: ApiClient, input: McpServerInput) {
  const response = await client["mcp-servers"].$post({ json: input as never });
  if (!response.ok) throw new Error("Failed to add the MCP Server.");
  return (await response.json()) as { server: McpServer };
}

export async function updateMcpServer(
  client: ApiClient,
  id: string,
  input: Partial<McpServerInput>,
) {
  const response = await client["mcp-servers"][":id"].$patch({ json: input, param: { id } });
  if (!response.ok) throw await readMcpError(response, "Failed to save the MCP Server.");
  return (await response.json()) as { data: McpServer };
}

export async function deleteMcpServer(client: ApiClient, id: string) {
  const response = await client["mcp-servers"][":id"].$delete({ param: { id } });
  if (!response.ok) throw await readMcpError(response, "Failed to delete the MCP Server.");
}

export async function testMcpConnection(client: ApiClient, id: string) {
  const response = await client["mcp-servers"][":id"].test.$post({ param: { id } });
  if (!response.ok) throw await readMcpError(response, "Failed to test the MCP Server.");
  return (await response.json()) as {
    data: { ok: true; server: unknown } | { ok: false; error: string };
  };
}

export async function discoverMcpTools(client: ApiClient, id: string) {
  const response = await client["mcp-servers"][":id"].discover.$post({ param: { id } });
  if (!response.ok) throw await readMcpError(response, "Failed to discover Tools.");
  return (await response.json()) as { data: McpTool[] };
}

export async function reviewMcpTool(
  client: ApiClient,
  toolId: string,
  input: { enabled: boolean; risk: ToolRisk },
) {
  const response = await client["mcp-servers"].tools[":toolId"].review.$post({
    json: input,
    param: { toolId },
  });
  if (!response.ok) throw await readMcpError(response, "Failed to review the MCP Tool.");
  return (await response.json()) as { data: McpTool };
}

export async function listTicketCategories(client: ApiClient) {
  const response = await client["ticket-categories"].$get();
  if (!response.ok) throw new Error("Failed to load ticket categories.");
  return (await response.json()) as { categories: TicketCategoryOption[] };
}

export async function createTicketCategory(client: ApiClient, input: TicketCategoryInput) {
  const response = await client["ticket-categories"].$post({ json: input });
  if (response.status === 409)
    throw new Error("A category with a matching name already exists.");
  if (!response.ok) throw new Error("Failed to create the category.");
  return (await response.json()) as { category: TicketCategoryOption };
}

export async function updateTicketCategory(
  client: ApiClient,
  id: string,
  input: TicketCategoryInput,
) {
  const response = await client["ticket-categories"][":id"].$put({ json: input, param: { id } });
  if (!response.ok) throw new Error("Failed to save the category.");
  return (await response.json()) as { category: TicketCategoryOption };
}

export async function deleteTicketCategory(client: ApiClient, id: string) {
  const response = await client["ticket-categories"][":id"].$delete({ param: { id } });
  if (response.status === 409)
    throw new Error("The fallback category cannot be deleted — every ticket needs somewhere to land.");
  if (!response.ok) throw new Error("Failed to delete the category.");
}
