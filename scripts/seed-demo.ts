import { randomUUID } from "node:crypto";
import {
  createOpenAiEmbeddingClient,
  chunkText,
  replaceChunks,
} from "../packages/knowledge/src/index";
import { apiConfig, embeddingConfig } from "../apps/api/src/config";
import { getAiSettings, updateAiSettings } from "../apps/api/src/modules/ai-settings/services";
import {
  createMcpServer,
  discoverMcpTools,
  listMcpServers,
  reviewMcpTool,
  testMcpConnection,
} from "../apps/api/src/modules/mcp/services";
import {
  EmailAlreadyInUseError,
  registerAdminWorkspace,
} from "../apps/api/src/modules/registration/services";
import {
  createHttpTool,
  listHttpTools,
  setToolAssignment,
  setToolUsageInstruction,
} from "../apps/api/src/modules/tools/services";
import {
  HumanAgentEmailAlreadyInUseError,
  createHumanAgent,
} from "../apps/api/src/modules/users/services";
import { updateWebWidgetConfig } from "../apps/api/src/modules/widget-config/services";
import { unscopedPrisma as prisma } from "../apps/api/src/utils/prisma";
import { withWorkspaceContext } from "../apps/api/src/utils/workspace-context";
import type { KnowledgeVisibility } from "../apps/api/src/utils/prisma";

const demoAdminEmail = "admin@demo.supportops.dev";
const demoAdminPassword = "DemoAdmin123!";
const demoAdminName = "Dana Pratama";

const demoHumanAgentEmail = "agent@demo.supportops.dev";
const demoHumanAgentPassword = "DemoAgent123!";
const demoHumanAgentName = "Rian Wibowo";

const demoWidgetDomains = ["localhost:3002", "localhost:4000"];

const demoAiInstructions =
  "You are the support assistant for the SupportOps demo company. Answer from the Knowledge Base, " +
  "keep replies to two short paragraphs, and hand off to a Human Agent for refunds, cancellations, " +
  "or anything that changes the Customer's account.";
const demoHandoffMessage =
  "Hello, I'm {humanAgentName} from the support team. I'll continue helping you from here.";
const demoResolutionMessage = "Glad that's sorted — this conversation is now resolved.";

const demoSubscriptionToolName = "getSubscriptionStatus";
const demoMcpServerName = "Business System Demo";
const demoInvoiceToolRemoteName = "getInvoiceStatus";

type DemoKnowledgeSource = {
  title: string;
  visibility: KnowledgeVisibility;
  content: string;
};

const demoKnowledgeSources: DemoKnowledgeSource[] = [
  {
    title: "Our subscription plans",
    visibility: "CUSTOMER_SAFE",
    content:
      "We offer two plans: Starter, at $19/month, covers a single workspace with email support. " +
      "Pro, at $49/month, adds priority support, unlimited seats, and API access. " +
      "You can see your current plan and its status (ACTIVE, PAST_DUE, or CANCELLED) from the " +
      "billing tool the AI Agent uses to check your account.",
  },
  {
    title: "Resetting your password",
    visibility: "CUSTOMER_SAFE",
    content:
      "To reset your password, open the login page and select 'Forgot password'. Enter the email " +
      "on your account and we send a reset link that expires after 30 minutes. If the email does " +
      "not arrive within a few minutes, check spam before requesting a new one. We never ask for " +
      "your password over chat or email.",
  },
  {
    title: "What an overdue invoice means",
    visibility: "CUSTOMER_SAFE",
    content:
      "An invoice marked OVERDUE means payment did not go through by its due date. Your subscription " +
      "stays active for a short grace period while we retry the charge. To avoid interruption, update " +
      "your payment method from account settings. If a payment method update does not resolve an " +
      "overdue invoice within 48 hours, a Human Agent can help.",
  },
  {
    title: "Cancelling your subscription",
    visibility: "CUSTOMER_SAFE",
    content:
      "You can cancel from account settings at any time; access continues until the end of the " +
      "current billing period and no further invoices are issued after that. We do not offer partial " +
      "refunds for the remainder of a billing period. If you cancelled by mistake, contact support " +
      "before the period ends to restore your subscription.",
  },
  {
    title: "Refund policy",
    visibility: "CUSTOMER_SAFE",
    content:
      "Refunds are available within 14 days of a charge if you have not made significant use of the " +
      "plan you were charged for. Refunds outside that window, or for accounts with significant usage, " +
      "are decided case by case and need a Human Agent's review — the AI Agent cannot approve or issue " +
      "a refund itself.",
  },
  {
    title: "Escalation playbook: refund and billing disputes",
    visibility: "INTERNAL_ONLY",
    content:
      "When a Customer disputes a charge or asks for a refund outside the standard 14-day window, do " +
      "not promise an outcome in chat. Confirm the invoice and subscription status with the Business " +
      "Tools first. Refunds above $100 need Admin sign-off before you action them. Always record the " +
      "reason the Customer gave for the dispute in the Handoff so the next Human Agent does not have " +
      "to ask again.",
  },
  {
    title: "Internal SOP: verifying suspicious cancellation requests",
    visibility: "INTERNAL_ONLY",
    content:
      "A cancellation request is suspicious when the requester cannot confirm the name or email on the " +
      "account, or asks to cancel immediately after a large invoice was charged. In that case, do not " +
      "cancel the subscription from chat. Ask the Customer to confirm their account email, cross-check " +
      "it against the Business System record, and if it does not match, keep the Ticket with a human " +
      "rather than closing it.",
  },
];

/**
 * Seeds the Tools the demo AI Agent can call: a Webhook Tool for subscription status and an
 * MCP Tool for invoice status, both switched on for the Workspace's AI Agent through the same
 * application services the Admin UI uses. The AI Agent chooses between them at runtime; the
 * "when to use" guidance on each assignment is the only steering.
 */
async function ensureTools() {
  const settings = await getAiSettings();
  await updateAiSettings({
    aiAgentId: settings.aiAgentId,
    autoResolveAfterSeconds: settings.autoResolveAfterSeconds,
    autoResolveEnabled: settings.autoResolveEnabled,
    followUpAfterSeconds: settings.followUpAfterSeconds,
    handoffMessage: demoHandoffMessage,
    instructions: demoAiInstructions,
    resolutionMessage: demoResolutionMessage,
  });
  console.log("AI Agent instructions and lifecycle messages configured.");

  const subscriptionTool =
    (await listHttpTools()).find((tool) => tool.name === demoSubscriptionToolName) ??
    (await createHttpTool({
      description:
        "Look up the demo Business System's linked subscription (customerId cus_102): plan, " +
        "status, and renewal date. Call with no arguments to read the linked account.",
      enabled: true,
      inputSchema: {
        properties: { customerId: { type: "string" } },
        required: [],
        type: "object",
      },
      method: "GET",
      name: demoSubscriptionToolName,
      risk: "READ_ONLY",
      url: new URL("/subscription-status", apiConfig.businessSystemUrl).toString(),
    }));
  console.log(`HTTP Tool ready: ${subscriptionTool.name}`);

  const mcpServer =
    (await listMcpServers()).find((server) => server.name === demoMcpServerName) ??
    (await createMcpServer({
      name: demoMcpServerName,
      url: new URL("/mcp", apiConfig.businessSystemUrl).toString(),
    }));

  const connection = await testMcpConnection(mcpServer.id);
  if (!connection.ok) {
    console.warn(
      `MCP Server "${demoMcpServerName}" is not reachable at ${mcpServer.url} — start ` +
        "the Business System, then re-run this seed to discover and enable getInvoiceStatus.",
    );
    return;
  }

  const discovered = await discoverMcpTools(mcpServer.id);
  const invoiceMcpTool = discovered.find((tool) => tool.remoteName === demoInvoiceToolRemoteName);
  if (!invoiceMcpTool) {
    console.warn(`MCP Server "${demoMcpServerName}" did not report a ${demoInvoiceToolRemoteName} Tool.`);
    return;
  }
  if (invoiceMcpTool.discoveryStatus !== "CURRENT" || !invoiceMcpTool.tool.enabled) {
    await reviewMcpTool(invoiceMcpTool.toolId, { enabled: true, risk: "READ_ONLY" });
  }
  console.log(`MCP Tool ready: ${mcpServer.name}/${demoInvoiceToolRemoteName}`);

  await setToolAssignment(subscriptionTool.id, settings.aiAgentId, true);
  await setToolAssignment(invoiceMcpTool.toolId, settings.aiAgentId, true);
  await setToolUsageInstruction(
    settings.aiAgentId,
    subscriptionTool.id,
    "Use when the Customer asks whether their subscription is active, which plan they are on, or when it renews.",
  );
  await setToolUsageInstruction(
    settings.aiAgentId,
    invoiceMcpTool.toolId,
    "Use when the Customer asks about an invoice, a charge, or an overdue payment.",
  );
  console.log("Tools switched on for the AI Agent, each with its own when-to-use guidance.");
}

async function main() {
  if (process.argv.includes("--reset")) await resetDemoWorkspace();

  const { workspace, admin } = await ensureAdminWorkspace();
  const humanAgent = await ensureHumanAgent(workspace.id);

  await withWorkspaceContext(workspace.id, async () => {
    await ensureWidgetConfig();
    await ensureKnowledgeSources(workspace.id);
    await ensureTools();
  });
  await ensureDemoConversations(workspace.id, humanAgent.id);

  console.log("\nDemo Workspace ready.");
  console.log(`  Workspace: ${workspace.name} (${workspace.slug})`);
  console.log(`  Admin:        ${admin.email} / ${demoAdminPassword}`);
  console.log(`  Human Agent:  ${demoHumanAgentEmail} / ${demoHumanAgentPassword}`);
}

async function ensureAdminWorkspace() {
  const existingAdmin = await prisma.user.findUnique({
    where: { email: demoAdminEmail },
    include: { workspace: true },
  });

  if (existingAdmin) {
    console.log(`Admin already exists: ${existingAdmin.email} (unchanged).`);
    return { workspace: existingAdmin.workspace, admin: existingAdmin };
  }

  try {
    const { user, workspace } = await registerAdminWorkspace({
      email: demoAdminEmail,
      name: demoAdminName,
      password: demoAdminPassword,
    });
    console.log(`Created Admin ${user.email} and Workspace ${workspace.slug}.`);
    return { workspace, admin: user };
  } catch (error) {
    if (error instanceof EmailAlreadyInUseError) {
      const admin = await prisma.user.findUniqueOrThrow({
        where: { email: demoAdminEmail },
        include: { workspace: true },
      });
      return { workspace: admin.workspace, admin };
    }
    throw error;
  }
}

async function ensureHumanAgent(workspaceId: string) {
  const existing = await prisma.user.findUnique({ where: { email: demoHumanAgentEmail } });

  if (existing) {
    console.log(`Human Agent already exists: ${existing.email} (unchanged).`);
    return existing;
  }

  try {
    const { user } = await createHumanAgent(workspaceId, {
      email: demoHumanAgentEmail,
      name: demoHumanAgentName,
      password: demoHumanAgentPassword,
    });
    console.log(`Created Human Agent ${user.email}.`);
    return user;
  } catch (error) {
    if (error instanceof HumanAgentEmailAlreadyInUseError) {
      return await prisma.user.findUniqueOrThrow({ where: { email: demoHumanAgentEmail } });
    }
    throw error;
  }
}

async function ensureWidgetConfig() {
  await updateWebWidgetConfig({
    allowedDomains: demoWidgetDomains,
    botName: "SupportOps Demo Bot",
    closingMessage: "Thanks for chatting with us today — we hope this helped!",
    primaryColor: "#2563eb",
    welcomeMessage: "Hi! I'm the SupportOps demo assistant. How can I help you today?",
  });
  console.log("Web Widget configured.");
}

async function ensureKnowledgeSources(workspaceId: string) {
  if (!embeddingConfig.apiKey) {
    console.warn(
      "OPENROUTER_API_KEY is not set — Knowledge Sources will be created but left unpublished. " +
        "Set the key and re-run this seed to publish them.",
    );
  }

  const embeddingClient = embeddingConfig.apiKey
    ? createOpenAiEmbeddingClient({
        apiKey: embeddingConfig.apiKey,
        baseUrl: embeddingConfig.baseUrl,
        modelId: embeddingConfig.modelId,
      })
    : null;

  for (const source of demoKnowledgeSources) {
    const existing = await prisma.knowledgeSource.findFirst({
      where: { deletedAt: null, title: source.title, workspaceId },
    });

    if (existing?.status === "PUBLISHED") {
      console.log(`Knowledge Source already published: ${source.title}`);
      continue;
    }

    const knowledgeSource = existing
      ? await prisma.knowledgeSource.update({
          data: { content: source.content, status: "PROCESSING", visibility: source.visibility },
          where: { id: existing.id },
        })
      : await prisma.knowledgeSource.create({
          data: {
            content: source.content,
            id: randomUUID(),
            sourceType: "MANUAL_FAQ",
            status: "PROCESSING",
            title: source.title,
            visibility: source.visibility,
            workspaceId,
          },
        });

    if (!embeddingClient) {
      await prisma.knowledgeSource.update({
        data: { status: "DRAFT" },
        where: { id: knowledgeSource.id },
      });
      console.log(`Knowledge Source drafted (unpublished): ${source.title}`);
      continue;
    }

    const chunks = chunkText(source.content);
    const vectors = chunks.length ? await embeddingClient.embed(chunks.map((c) => c.content)) : [];

    await prisma.$transaction(async (tx) => {
      await replaceChunks(tx, {
        chunks: chunks.map((chunk, index) => ({
          content: chunk.content,
          embedding: vectors[index] ?? [],
          position: chunk.position,
        })),
        isPublished: true,
        knowledgeSourceId: knowledgeSource.id,
        visibility: source.visibility,
        workspaceId,
      });

      await tx.knowledgeSource.update({
        data: { failureReason: null, publishedAt: new Date(), status: "PUBLISHED" },
        where: { id: knowledgeSource.id },
      });
    });

    console.log(`Published Knowledge Source: ${source.title} (${source.visibility})`);
  }
}


type DemoTurn = {
  senderType: "AI_AGENT" | "CUSTOMER" | "HUMAN_AGENT";
  content: string;
  /** AI Activity recorded right after this Message, so the Activity Timeline reads in order. */
  activity?: Array<{ eventType: DemoActivityType; metadata: Record<string, unknown> }>;
};

type DemoActivityType =
  | "AI_REPLIED"
  | "CLAIMED"
  | "ESCALATED"
  | "HANDOFF_SENT"
  | "KNOWLEDGE_RETRIEVED"
  | "RESOLVED"
  | "TOOL_CALLED";

type DemoConversation = {
  category: string;
  customer: { email: string; name: string };
  /** Stable key: re-running the seed finds this Ticket instead of creating a second one. */
  key: string;
  outcome:
    | { status: "AI_HANDLING" }
    | { status: "ESCALATED"; reason: "INTERNAL_ACTION_REQUIRED"; claimed: boolean }
    | { status: "RESOLVED"; by: "AI_AGENT" | "HUMAN_AGENT" };
  title: string;
  turns: DemoTurn[];
};

const knowledgeRetrieved = { chunkIds: [], knowledgeSourceIds: [] };

/**
 * Four Tickets that show the whole product in the inbox without needing an API key: a Tool call
 * the AI Agent chose itself, an Escalation a Human Agent picked up, a live conversation, and a
 * Ticket a Human Agent resolved. Transcripts are written directly rather than generated, so the
 * demo Workspace looks the same on every machine.
 */
const demoConversations: DemoConversation[] = [
  {
    category: "SUBSCRIPTION",
    customer: { email: "budi@example.com", name: "Budi Santoso" },
    key: "subscription-status",
    outcome: { status: "RESOLVED", by: "AI_AGENT" },
    title: "Is my subscription still active?",
    turns: [
      { senderType: "CUSTOMER", content: "Hi, is my subscription still active? I want to make sure before the team starts onboarding." },
      {
        senderType: "AI_AGENT",
        content:
          "Yes — your account is on the Pro plan and the subscription is active, renewing on 1 November 2026. " +
          "Pro includes priority support, unlimited seats, and API access, so your team can start onboarding right away.",
        activity: [
          { eventType: "KNOWLEDGE_RETRIEVED", metadata: knowledgeRetrieved },
          {
            eventType: "TOOL_CALLED",
            metadata: {
              latencyMs: 214,
              origin: "HTTP",
              outcome: "SUCCESS",
              risk: "READ_ONLY",
              tool: demoSubscriptionToolName,
            },
          },
          { eventType: "AI_REPLIED", metadata: {} },
        ],
      },
      { senderType: "CUSTOMER", content: "That's what I needed, thanks!" },
      {
        senderType: "AI_AGENT",
        content: demoResolutionMessage,
        activity: [{ eventType: "RESOLVED", metadata: { resolvedBy: "AI_AGENT" } }],
      },
    ],
  },
  {
    category: "BILLING",
    customer: { email: "siti@example.com", name: "Siti Aminah" },
    key: "invoice-refund",
    outcome: { status: "ESCALATED", reason: "INTERNAL_ACTION_REQUIRED", claimed: true },
    title: "Refund for an invoice charged last month",
    turns: [
      { senderType: "CUSTOMER", content: "I was charged for INV-2091 last month but we had already cancelled. Can you refund it?" },
      {
        senderType: "AI_AGENT",
        content: "Let me check that invoice for you.",
        activity: [
          { eventType: "KNOWLEDGE_RETRIEVED", metadata: knowledgeRetrieved },
          {
            eventType: "TOOL_CALLED",
            metadata: {
              latencyMs: 388,
              origin: "MCP",
              outcome: "SUCCESS",
              risk: "READ_ONLY",
              tool: demoInvoiceToolRemoteName,
            },
          },
          {
            eventType: "ESCALATED",
            metadata: { reason: "INTERNAL_ACTION_REQUIRED" },
          },
        ],
      },
      {
        senderType: "HUMAN_AGENT",
        content: demoHandoffMessage.replace("{humanAgentName}", demoHumanAgentName),
        activity: [
          { eventType: "CLAIMED", metadata: {} },
          { eventType: "HANDOFF_SENT", metadata: {} },
        ],
      },
    ],
  },
  {
    category: "ACCOUNT",
    customer: { email: "andi@example.com", name: "Andi Kurniawan" },
    key: "password-reset",
    outcome: { status: "AI_HANDLING" },
    title: "Password reset email never arrives",
    turns: [
      { senderType: "CUSTOMER", content: "I keep asking for a password reset link but nothing shows up in my inbox." },
      {
        senderType: "AI_AGENT",
        content:
          "Reset links are sent straight away and expire after 30 minutes, so the usual cause is the message landing in spam. " +
          "Could you check your spam folder, then request one more link and tell me whether it arrives?",
        activity: [
          { eventType: "KNOWLEDGE_RETRIEVED", metadata: knowledgeRetrieved },
          { eventType: "AI_REPLIED", metadata: {} },
        ],
      },
    ],
  },
  {
    category: "TECHNICAL",
    customer: { email: "maya@example.com", name: "Maya Larasati" },
    key: "api-timeout",
    outcome: { status: "RESOLVED", by: "HUMAN_AGENT" },
    title: "API requests timing out since this morning",
    turns: [
      { senderType: "CUSTOMER", content: "Every API call from our backend has been timing out since around 09:00." },
      {
        senderType: "AI_AGENT",
        content: "I don't have anything published that covers this, so I'm bringing in a teammate.",
        activity: [{ eventType: "ESCALATED", metadata: { reason: "NO_RELEVANT_KNOWLEDGE" } }],
      },
      {
        senderType: "HUMAN_AGENT",
        content:
          "Your API key was rotated this morning and the old one is still in your backend config. " +
          "Swapping in the new key clears the timeouts — I've confirmed the last five calls went through.",
        activity: [
          { eventType: "CLAIMED", metadata: {} },
          { eventType: "RESOLVED", metadata: { resolvedBy: "HUMAN_AGENT" } },
        ],
      },
    ],
  },
];

/** Writes each demo transcript straight to the tables the Widget flow writes, so the inbox,
 * Activity Timeline, and analytics all have something to show without an AI run. */
async function ensureDemoConversations(workspaceId: string, humanAgentId: string) {
  const channel = await prisma.channel.findFirst({
    select: { aiAgentId: true, id: true },
    where: { type: "WEB", workspaceId },
  });
  if (!channel) {
    console.warn("No Web Channel on the demo Workspace — skipping example conversations.");
    return;
  }

  for (const conversation of demoConversations) {
    const accessToken = `demo-session-${conversation.key}`;
    if (await prisma.session.findUnique({ select: { id: true }, where: { accessToken } })) {
      console.log(`Example conversation already seeded: ${conversation.title}`);
      continue;
    }

    const customerIdentity =
      (await prisma.customerIdentity.findFirst({
        where: { channelType: "WEB", email: conversation.customer.email, workspaceId },
      })) ??
      (await prisma.customerIdentity.create({
        data: {
          canonicalId: conversation.customer.email.toLowerCase(),
          channelType: "WEB",
          email: conversation.customer.email,
          id: randomUUID(),
          name: conversation.customer.name,
          workspaceId,
        },
      }));

    const sessionId = randomUUID();
    await prisma.session.create({
      data: {
        accessToken,
        channelId: channel.id,
        customerIdentityId: customerIdentity.id,
        id: sessionId,
        messageSeq: conversation.turns.length,
        status: conversation.outcome.status === "AI_HANDLING" ? "ACTIVE" : "CLOSED",
        workspaceId,
      },
    });

    const memory = await prisma.conversation.create({
      data: {
        id: randomUUID(),
        metadata: {},
        scopeKey: `session:${sessionId}`,
        sessionId,
        userId: customerIdentity.id,
        workspaceId,
      },
    });

    const ticketId = randomUUID();
    const resolved = conversation.outcome.status === "RESOLVED" ? conversation.outcome : null;
    const escalated = conversation.outcome.status === "ESCALATED" ? conversation.outcome : null;
    await prisma.ticket.create({
      data: {
        aiAgentId: channel.aiAgentId,
        assignedHumanAgentId: escalated?.claimed || resolved?.by === "HUMAN_AGENT" ? humanAgentId : null,
        category: conversation.category,
        channelId: channel.id,
        customerIdentityId: customerIdentity.id,
        escalatedAt: escalated ? new Date() : null,
        escalationReason: escalated?.reason ?? null,
        id: ticketId,
        resolutionReason: resolved
          ? resolved.by === "AI_AGENT"
            ? "CUSTOMER_CONFIRMED"
            : "HUMAN_RESOLVED"
          : null,
        resolvedAt: resolved ? new Date() : null,
        resolvedBy: resolved?.by ?? null,
        sessionId,
        status: conversation.outcome.status,
        title: conversation.title,
        workspaceId,
      },
    });

    await prisma.aiActivity.create({
      data: {
        eventType: "TICKET_CREATED",
        id: randomUUID(),
        metadata: { category: conversation.category, title: conversation.title },
        ticketId,
        workspaceId,
      },
    });

    for (const [index, turn] of conversation.turns.entries()) {
      await prisma.message.create({
        data: {
          content: turn.content,
          externalMessageId: `${accessToken}-${index + 1}`,
          id: randomUUID(),
          memorySessionId: memory.id,
          message: { content: turn.content },
          position: index + 1,
          role: turn.senderType === "CUSTOMER" ? "user" : "assistant",
          runId: randomUUID(),
          senderType: turn.senderType,
          senderUserId: turn.senderType === "HUMAN_AGENT" ? humanAgentId : null,
          ticketId,
          sessionId,
          turn: index + 1,
          workspaceId,
        },
      });
      for (const activity of turn.activity ?? []) {
        await prisma.aiActivity.create({
          data: {
            eventType: activity.eventType,
            id: randomUUID(),
            metadata: { ...activity.metadata, ticketId },
            ticketId,
            workspaceId,
          },
        });
      }
    }

    console.log(`Seeded example conversation: ${conversation.title} (${conversation.outcome.status})`);
  }
}

/** Deletes the demo Workspace outright so `--reset` gives a first-run state. Order follows the
 * foreign keys; Session and Account cascade from User. */
async function resetDemoWorkspace() {
  const admin = await prisma.user.findUnique({
    select: { workspaceId: true },
    where: { email: demoAdminEmail },
  });
  if (!admin) {
    console.log("No demo Workspace to reset.");
    return;
  }
  const workspaceId = admin.workspaceId;
  const where = { where: { workspaceId } };

  await prisma.$transaction([
    prisma.aiActivity.deleteMany({ where: { ticket: { workspaceId } } }),
    prisma.ticketReadState.deleteMany(where),
    prisma.attachment.deleteMany(where),
    prisma.message.deleteMany(where),
    prisma.conversation.deleteMany(where),
    prisma.ticket.deleteMany(where),
    prisma.session.deleteMany(where),
    prisma.customerIdentity.deleteMany(where),
    prisma.chunk.deleteMany(where),
    prisma.knowledgeSource.deleteMany(where),
    prisma.toolAssignment.deleteMany(where),
    prisma.httpToolConfig.deleteMany(where),
    prisma.mcpTool.deleteMany(where),
    prisma.tool.deleteMany(where),
    prisma.mcpServer.deleteMany(where),
    prisma.webWidgetConfig.deleteMany(where),
    prisma.channel.deleteMany(where),
    prisma.ticketCategory.deleteMany(where),
    prisma.aiSettings.deleteMany(where),
    prisma.user.deleteMany(where),
    prisma.aiAgent.deleteMany(where),
    prisma.workspace.delete({ where: { id: workspaceId } }),
  ]);
  console.log("Demo Workspace deleted — seeding from scratch.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
