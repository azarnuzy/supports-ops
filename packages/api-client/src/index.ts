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

export type SupportTicket = {
  assignedHumanAgent: { id: string; name: string } | null;
  createdAt: string;
  escalatedAt: string | null;
  id: string;
  priority: TicketPriority;
  title: string;
  customerIdentity: { name: string };
};

export class TicketAlreadyClaimedApiError extends Error {
  constructor(message: string) {
    super(message);
  }
}

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
  const response = await client.tickets[":id"].assignee.$patch({ param: { id }, json: { humanAgentId } });
  if (response.status === 401) throw new UnauthorizedApiError();
  if (response.status === 403) throw new Error("Only an Admin can reassign Tickets.");
  if (response.status === 422) throw new Error("Choose an active Human Agent in this Workspace.");
  if (!response.ok) throw new Error("Failed to reassign the Ticket.");
  return (await response.json()) as { ticket: SupportTicket };
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

  if (response.status === 401) {
    throw new UnauthorizedApiError();
  }

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

  if (response.status === 401) {
    throw new UnauthorizedApiError();
  }

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
  createdAt: string;
  updatedAt: string;
};

export type UpdateWebWidgetConfigInput = {
  botName: string;
  welcomeMessage: string;
  primaryColor: string;
  closingMessage: string | null;
  allowedDomains: string[];
};

export type WebWidgetConfigResult = {
  webWidgetConfig: WebWidgetConfig;
  closingMessage: string | null;
};

export async function fetchWebWidgetConfig(client: ApiClient) {
  const response = await client["widget-config"].$get();

  if (response.status === 401) {
    throw new UnauthorizedApiError();
  }

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

  if (response.status === 401) {
    throw new UnauthorizedApiError();
  }

  if (response.status === 403) {
    throw new Error("You do not have permission to update the Web Widget configuration.");
  }

  if (!response.ok) {
    throw new Error("Failed to save the Web Widget configuration.");
  }

  return (await response.json()) as WebWidgetConfigResult;
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

export type KnowledgeSource = {
  id: string;
  sourceType: KnowledgeSourceType;
  title: string;
  content: string | null;
  parentId: string | null;
  sourceUrl: string | null;
  visibility: KnowledgeVisibility;
  status: KnowledgeStatus;
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

  if (response.status === 401) {
    throw new UnauthorizedApiError();
  }

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

  if (response.status === 401) {
    throw new UnauthorizedApiError();
  }

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

export async function createPdfKnowledgeSource(client: ApiClient, file: File, visibility: KnowledgeVisibility) {
  const response = await client.knowledge.pdf.$post({ form: { file, visibility } });
  if (!response.ok) {
    const data = (await response.json()) as { message?: string };
    throw new Error(data.message ?? "Failed to upload PDF.");
  }
  return (await response.json()) as { knowledgeSource: KnowledgeSource };
}

export async function updateManualFaq(client: ApiClient, id: string, input: ManualFaqInput) {
  const response = await client.knowledge[":id"].$patch({ json: input, param: { id } });

  if (response.status === 401) {
    throw new UnauthorizedApiError();
  }

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

export async function publishKnowledgeSource(client: ApiClient, id: string) {
  const response = await client.knowledge[":id"].publish.$post({ param: { id } });

  if (response.status === 401) {
    throw new UnauthorizedApiError();
  }

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

  if (response.status === 401) {
    throw new UnauthorizedApiError();
  }

  if (response.status === 404) {
    throw new KnowledgeSourceNotFoundApiError();
  }

  if (!response.ok) {
    throw new Error("Failed to delete the Knowledge Source.");
  }
}

export async function testKnowledgeRetrieval(client: ApiClient, query: string) {
  const response = await client.knowledge["retrieval-test"].$post({ json: { query } });

  if (response.status === 401) {
    throw new UnauthorizedApiError();
  }

  if (response.status === 503) {
    const data = (await response.json()) as { message: string };
    throw new EmbeddingNotConfiguredApiError(data.message);
  }

  if (!response.ok) {
    throw new Error("Retrieval test failed.");
  }

  return (await response.json()) as { results: RetrievalTestResult[] };
}
