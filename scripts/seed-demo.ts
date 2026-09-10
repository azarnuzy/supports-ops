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
  setToolPolicy,
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

const demoWidgetDomains = ["localhost:3001", "localhost:4000"];

const demoAiInstructions =
  "Always verify the Customer's subscription status with the Business Tool before answering a " +
  "subscription question. Use the invoice lookup Tool when a Customer asks about a specific " +
  "invoice or billing charge.";
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
 * Seeds the #94 demonstration: a required HTTP Tool for subscription status and an
 * optional MCP Tool for invoice status, both assigned to the Workspace's AI Agent
 * through the same application services Admin flows use.
 */
async function ensureBusinessTools() {
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
        "Look up the demo Business System's linked subscription (customerId cus_102). The " +
        "required-Tool Policy runtime calls this with no arguments, so customerId is optional here.",
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
  await setToolPolicy(settings.aiAgentId, "SUBSCRIPTION", subscriptionTool.id);
  console.log("Tools assigned to the AI Agent; SUBSCRIPTION Tool Policy set to getSubscriptionStatus.");
}

async function main() {
  const { workspace, admin } = await ensureAdminWorkspace();
  await ensureHumanAgent(workspace.id);

  await withWorkspaceContext(workspace.id, async () => {
    await ensureWidgetConfig();
    await ensureKnowledgeSources(workspace.id);
    await ensureBusinessTools();
  });

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

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
