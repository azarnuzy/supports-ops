import { randomUUID } from "node:crypto";
import Ajv from "ajv";
import { searchChunks, searchTicketChunks } from "@repo/knowledge";
import { toolEncryptionConfig } from "../../config";
import { prisma } from "../../utils/prisma";
import { requireWorkspaceId } from "../../utils/workspace-context";
import type { CreateHttpToolInput, UpdateHttpToolInput } from "./schema";
import { encryptToolSecret } from "./secrets";

export class HttpToolNotFoundError extends Error {}
export class InvalidToolSchemaError extends Error {}
export class ToolNotFoundError extends Error {}
export class AiAgentNotFoundError extends Error {}
export class ToolUnavailableError extends Error {}
export class ToolNotAssignedError extends Error {}
export class TicketNotFoundError extends Error {}

const builtInNames = ["searchKnowledge", "searchCustomerTicketHistory"] as const;
type BuiltInName = (typeof builtInNames)[number];

const includeHttpConfig = { httpConfig: true } as const;

export async function listHttpTools() {
  return (await prisma.tool.findMany({ include: includeHttpConfig, where: { origin: "HTTP" } })).map(
    toDto,
  );
}

/** Last call per Tool, read from the AI Activity log so no new table is needed.
 * ponytail: scans the most recent tool events rather than aggregating in SQL, because
 * `metadata.toolId` is unindexed JSON. Move to a GROUP BY on a real column if the log grows
 * past the point where the newest 500 events still cover every Tool. */
async function lastToolCalls() {
  const events = await prisma.aiActivity.findMany({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, eventType: true, metadata: true },
    take: 500,
    where: { eventType: { in: ["TOOL_CALLED", "TOOL_FAILED"] } },
  });
  const lastCallByToolId = new Map<string, { at: Date; succeeded: boolean }>();
  for (const event of events) {
    const toolId = (event.metadata as { toolId?: unknown } | null)?.toolId;
    if (typeof toolId !== "string" || lastCallByToolId.has(toolId)) continue;
    lastCallByToolId.set(toolId, {
      at: event.createdAt,
      succeeded: event.eventType === "TOOL_CALLED",
    });
  }
  return lastCallByToolId;
}

/** Recent calls for one Tool, read straight from the AI Activity log. Capped because the panel
 * shows a list, not an archive; the summary is explicitly "of these calls", never all-time. */
export async function listToolCalls(toolId: string) {
  const events = await prisma.aiActivity.findMany({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, eventType: true, metadata: true, ticketId: true },
    take: 50,
    where: {
      eventType: { in: ["TOOL_CALLED", "TOOL_FAILED"] },
      metadata: { path: ["toolId"], equals: toolId },
    },
  });
  const calls = events.map((event) => ({
    at: event.createdAt.toISOString(),
    latencyMs: Number((event.metadata as { latencyMs?: unknown } | null)?.latencyMs ?? 0),
    succeeded: event.eventType === "TOOL_CALLED",
    ticketId: event.ticketId,
  }));
  const failed = calls.filter((call) => !call.succeeded).length;
  return {
    calls,
    stats: {
      avgLatencyMs: calls.length
        ? Math.round(calls.reduce((total, call) => total + call.latencyMs, 0) / calls.length)
        : 0,
      failed,
      total: calls.length,
    },
  };
}

export async function listTools(aiAgentId: string) {
  await requireAiAgent(aiAgentId);
  const lastCallByToolId = await lastToolCalls();
  const tools = await prisma.tool.findMany({
    include: {
      assignments: { select: { id: true, usageInstruction: true }, where: { aiAgentId } },
      httpConfig: { select: { toolId: true } },
      mcpTool: { include: { mcpServer: { select: { enabled: true } } } },
    },
    orderBy: { name: "asc" },
  });

  return tools.map(({ assignments, httpConfig, mcpTool, ...tool }) => ({
    ...tool,
    assigned: assignments.length > 0,
    availability: isAvailable({ ...tool, httpConfig, mcpTool }) ? "AVAILABLE" : "UNAVAILABLE",
    lastCall: lastCallByToolId.get(tool.id)
      ? {
          at: lastCallByToolId.get(tool.id)!.at.toISOString(),
          succeeded: lastCallByToolId.get(tool.id)!.succeeded,
        }
      : null,
    usageInstruction: assignments[0]?.usageInstruction ?? null,
  }));
}

export async function setToolEnabled(toolId: string, enabled: boolean) {
  const tool = await findTool(toolId);
  return prisma.tool.update({ data: { enabled }, where: { id: tool.id } });
}

export async function setToolAssignment(toolId: string, aiAgentId: string, assigned: boolean) {
  const [tool] = await Promise.all([findAssignableTool(toolId), requireAiAgent(aiAgentId)]);
  if (assigned) {
    if (!tool.enabled || !isAvailable(tool)) throw new ToolUnavailableError();
    const workspaceId = requireWorkspaceId();
    return prisma.toolAssignment.upsert({
      create: { aiAgentId, id: randomUUID(), toolId, workspaceId },
      update: {},
      where: { workspaceId_aiAgentId_toolId: { aiAgentId, toolId, workspaceId } },
    });
  }
  await prisma.toolAssignment.deleteMany({ where: { aiAgentId, toolId } });
}

/** Free-text guidance appended to the Tool description the model sees, so an Admin can say
 * when a Tool should be used without any category rule. */
export async function setToolUsageInstruction(
  aiAgentId: string,
  toolId: string,
  usageInstruction: string | null,
) {
  await Promise.all([findAssignableTool(toolId), requireAiAgent(aiAgentId)]);
  const assignment = await prisma.toolAssignment.findFirst({ where: { aiAgentId, toolId } });
  if (!assignment) throw new ToolNotAssignedError();
  await prisma.toolAssignment.update({
    data: { usageInstruction },
    where: { id: assignment.id },
  });
}

/** The single runtime authorization seam for every AI Agent Tool call. */
export async function resolveTools(aiAgentId: string) {
  await requireAiAgent(aiAgentId);
  const tools = await prisma.tool.findMany({
    include: {
      assignments: { select: { usageInstruction: true }, where: { aiAgentId } },
      httpConfig: { select: { toolId: true } },
      mcpTool: { include: { mcpServer: { select: { enabled: true } } } },
    },
    where: { assignments: { some: { aiAgentId } }, enabled: true },
  });
  return tools.filter(isAvailable).map(({ assignments, ...tool }) => ({
    ...tool,
    usageInstruction: assignments[0]?.usageInstruction ?? null,
  }));
}

/** Ticket context is loaded server-side; model/customer-provided identities never scope retrieval. */
export async function executeBuiltInTool(input: {
  aiAgentId: string;
  embedding: number[];
  ticketId: string;
  toolName: BuiltInName;
}) {
  const workspaceId = requireWorkspaceId();
  const [tool, ticket] = await Promise.all([
    resolveTools(input.aiAgentId).then((tools) => tools.find((item) => item.name === input.toolName)),
    prisma.ticket.findFirst({
      select: { channel: { select: { type: true } }, customerIdentityId: true },
      where: { aiAgentId: input.aiAgentId, id: input.ticketId },
    }),
  ]);
  if (!tool || tool.origin !== "BUILT_IN") throw new ToolNotAssignedError();
  if (!ticket) throw new TicketNotFoundError();

  return input.toolName === "searchKnowledge"
    ? searchChunks(prisma, { embedding: input.embedding, retrievalMode: "CUSTOMER", workspaceId })
    : searchTicketChunks(prisma, {
        channelType: ticket.channel.type,
        customerIdentityId: ticket.customerIdentityId,
        embedding: input.embedding,
        excludeTicketId: input.ticketId,
        workspaceId,
      });
}

function isAvailable(tool: {
  origin: "BUILT_IN" | "HTTP" | "MCP";
  name: string;
  httpConfig: unknown;
  mcpTool: null | { discoveryStatus: string; mcpServer: { enabled: boolean } };
}) {
  if (tool.origin === "BUILT_IN") return builtInNames.includes(tool.name as BuiltInName);
  if (tool.origin === "HTTP") return Boolean(tool.httpConfig);
  return tool.mcpTool?.discoveryStatus === "CURRENT" && tool.mcpTool.mcpServer.enabled;
}

async function findTool(toolId: string) {
  const tool = await prisma.tool.findFirst({ where: { id: toolId } });
  if (!tool) throw new ToolNotFoundError();
  return tool;
}

async function findAssignableTool(toolId: string) {
  const tool = await prisma.tool.findFirst({
    include: {
      httpConfig: { select: { toolId: true } },
      mcpTool: { include: { mcpServer: { select: { enabled: true } } } },
    },
    where: { id: toolId },
  });
  if (!tool) throw new ToolNotFoundError();
  return tool;
}

async function requireAiAgent(aiAgentId: string) {
  const aiAgent = await prisma.aiAgent.findFirst({ select: { id: true }, where: { id: aiAgentId } });
  if (!aiAgent) throw new AiAgentNotFoundError();
  return aiAgent;
}

export async function getHttpTool(id: string) {
  const tool = await prisma.tool.findFirst({ include: includeHttpConfig, where: { id, origin: "HTTP" } });
  if (!tool) throw new HttpToolNotFoundError();
  return toDto(tool);
}

export async function createHttpTool(input: CreateHttpToolInput) {
  validateSchema(input.inputSchema);
  const workspaceId = requireWorkspaceId();
  const id = randomUUID();
  const tool = await prisma.tool.create({
    data: {
      description: input.description,
      enabled: input.enabled,
      httpConfig: {
        create: secretConfig(input),
      },
      id,
      inputSchema: input.inputSchema,
      name: input.name,
      origin: "HTTP",
      risk: input.risk,
      workspaceId,
    },
    include: includeHttpConfig,
  });
  /** A Webhook Tool an Admin just configured is meant to be used, so it starts switched on for
   * the Workspace's AI Agents. MCP discovery deliberately does not do this: one server can
   * import dozens of Tools at once. */
  if (input.enabled) {
    const aiAgents = await prisma.aiAgent.findMany({ select: { id: true } });
    await prisma.toolAssignment.createMany({
      data: aiAgents.map((aiAgent) => ({
        aiAgentId: aiAgent.id,
        id: randomUUID(),
        toolId: id,
        workspaceId,
      })),
      skipDuplicates: true,
    });
  }
  return toDto(tool);
}

export async function updateHttpTool(id: string, input: UpdateHttpToolInput) {
  validateSchema(input.inputSchema);
  const existing = await prisma.tool.findFirst({ include: includeHttpConfig, where: { id, origin: "HTTP" } });
  if (!existing?.httpConfig) throw new HttpToolNotFoundError();
  const secrets = secretConfig(input, existing.httpConfig);
  const tool = await prisma.tool.update({
    data: {
      description: input.description,
      enabled: input.enabled,
      httpConfig: { update: secrets },
      inputSchema: input.inputSchema,
      name: input.name,
      risk: input.risk,
    },
    include: includeHttpConfig,
    where: { id },
  });
  return toDto(tool);
}

export async function deleteHttpTool(id: string) {
  const tool = await prisma.tool.findFirst({ select: { id: true }, where: { id, origin: "HTTP" } });
  if (!tool) throw new HttpToolNotFoundError();
  await prisma.$transaction([
    prisma.toolAssignment.deleteMany({ where: { toolId: id } }),
    prisma.tool.delete({ where: { id } }),
  ]);
}

function validateSchema(schema: Record<string, unknown>) {
  try {
    new Ajv({ strict: true }).compile(schema);
  } catch (error) {
    throw new InvalidToolSchemaError(error instanceof Error ? error.message : "Invalid JSON Schema.");
  }
}

function secretConfig(
  input: Pick<CreateHttpToolInput, "bearerToken" | "method" | "secretHeaders" | "url">,
  existing?: { bearerTokenEncrypted: string | null; secretHeadersEncrypted: string | null },
) {
  const encrypt = (value: string) => encryptToolSecret(value, toolEncryptionConfig.masterKey);
  return {
    bearerTokenEncrypted:
      input.bearerToken === undefined
        ? (existing?.bearerTokenEncrypted ?? null)
        : input.bearerToken
          ? encrypt(input.bearerToken)
          : null,
    method: input.method,
    secretHeadersEncrypted:
      input.secretHeaders === undefined
        ? (existing?.secretHeadersEncrypted ?? null)
        : input.secretHeaders
          ? encrypt(JSON.stringify(input.secretHeaders))
          : null,
    url: input.url,
  };
}

function toDto(tool: {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  inputSchema: unknown;
  risk: "READ_ONLY" | "MUTATING";
  createdAt: Date;
  updatedAt: Date;
  httpConfig: null | {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    url: string;
    bearerTokenEncrypted: string | null;
    secretHeadersEncrypted: string | null;
  };
}) {
  const config = tool.httpConfig;
  if (!config) throw new HttpToolNotFoundError();
  return {
    createdAt: tool.createdAt,
    description: tool.description,
    enabled: tool.enabled,
    hasBearerToken: Boolean(config.bearerTokenEncrypted),
    hasSecretHeaders: Boolean(config.secretHeadersEncrypted),
    id: tool.id,
    inputSchema: tool.inputSchema,
    method: config.method,
    name: tool.name,
    risk: tool.risk,
    updatedAt: tool.updatedAt,
    url: config.url,
  };
}
