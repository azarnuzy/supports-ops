import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { toolEncryptionConfig } from "../../config";
import { prisma } from "../../utils/prisma";
import { requireWorkspaceId } from "../../utils/workspace-context";
import { decryptToolSecret } from "../tools/secrets";
import { encryptToolSecret } from "../tools/secrets";
import { withMcpClient, type McpCredentials } from "./client";
import type { CreateMcpServerInput, ReviewMcpToolInput, UpdateMcpServerInput } from "./schema";

const maxResultBytes = 64 * 1024;
const publicServerSelect = {
  createdAt: true,
  enabled: true,
  id: true,
  name: true,
  updatedAt: true,
  url: true,
} as const;

export class McpNotFoundError extends Error {}
export class McpToolDeniedError extends Error {}

export async function listMcpServers() {
  return prisma.mcpServer.findMany({ orderBy: { createdAt: "desc" }, select: publicServerSelect });
}

export async function createMcpServer(input: CreateMcpServerInput) {
  return prisma.mcpServer.create({
    data: {
      id: randomUUID(),
      name: input.name,
      url: input.url,
      ...encryptedCredentials(input),
    },
    select: publicServerSelect,
  });
}

export async function updateMcpServer(id: string, input: UpdateMcpServerInput) {
  await getServer(id);
  return prisma.mcpServer.update({
    data: {
      enabled: input.enabled,
      name: input.name,
      url: input.url,
      ...encryptedCredentials(input),
    },
    select: publicServerSelect,
    where: { id },
  });
}

export async function deleteMcpServer(id: string) {
  await getServer(id);
  const tools = await prisma.mcpTool.findMany({ select: { toolId: true }, where: { mcpServerId: id } });
  const toolIds = tools.map(({ toolId }) => toolId);
  await prisma.$transaction([
    prisma.toolPolicy.deleteMany({ where: { toolId: { in: toolIds } } }),
    prisma.toolAssignment.deleteMany({ where: { toolId: { in: toolIds } } }),
    prisma.tool.deleteMany({ where: { id: { in: toolIds } } }),
  ]);
  await prisma.mcpServer.delete({ where: { id } });
}

export async function testMcpConnection(id: string) {
  const server = await getServer(id);
  try {
    return await withMcpClient(server.url, credentials(server), async (client) => ({
      ok: true as const,
      server: client.getServerVersion() ?? null,
    }));
  } catch {
    return { error: "MCP connection failed.", ok: false as const };
  }
}

export async function discoverMcpTools(id: string) {
  const server = await getServer(id);
  const workspaceId = requireWorkspaceId();
  const remote = await withMcpClient(server.url, credentials(server), (client) => client.listTools());
  const seen: string[] = [];

  for (const discovered of remote.tools) {
    seen.push(discovered.name);
    const existing = await prisma.mcpTool.findFirst({
      include: { tool: true },
      where: { mcpServerId: id, remoteName: discovered.name },
    });
    const description = discovered.description ?? "";
    const schema = discovered.inputSchema as Prisma.InputJsonValue;

    if (!existing) {
      const toolId = randomUUID();
      await prisma.tool.create({
        data: {
          description,
          enabled: false,
          id: toolId,
          inputSchema: schema,
          mcpTool: {
            create: {
              discoveredDescription: description,
              discoveredSchema: schema,
              mcpServerId: id,
              remoteName: discovered.name,
              workspaceId,
            },
          },
          name: `${server.name}/${discovered.name}`,
          origin: "MCP",
        },
      });
    } else {
      const changed =
        existing.tool.description !== description ||
        JSON.stringify(existing.tool.inputSchema) !== JSON.stringify(discovered.inputSchema);
      await prisma.mcpTool.update({
        data: {
          discoveredAt: new Date(),
          discoveredDescription: description,
          discoveredSchema: schema,
          discoveryStatus: changed ? "CHANGED" : "CURRENT",
        },
        where: { toolId: existing.toolId },
      });
      if (changed) {
        await prisma.tool.update({ data: { enabled: false }, where: { id: existing.toolId } });
      }
    }
  }

  await prisma.mcpTool.updateMany({
    data: { discoveryStatus: "UNAVAILABLE" },
    where: { mcpServerId: id, remoteName: { notIn: seen } },
  });
  return prisma.mcpTool.findMany({ include: { tool: true }, where: { mcpServerId: id } });
}

export async function reviewMcpTool(toolId: string, input: ReviewMcpToolInput) {
  const discovered = await prisma.mcpTool.findFirst({ where: { toolId } });
  if (!discovered) throw new McpNotFoundError();
  if (discovered.discoveryStatus === "UNAVAILABLE") throw new McpToolDeniedError();
  await prisma.tool.update({
    data: {
      description: discovered.discoveredDescription,
      enabled: input.enabled,
      inputSchema: discovered.discoveredSchema as Prisma.InputJsonValue,
      risk: input.risk,
    },
    where: { id: toolId },
  });
  return prisma.mcpTool.update({
    data: { discoveryStatus: "CURRENT" },
    include: { tool: true },
    where: { toolId },
  });
}

export async function executeMcpTool(
  toolId: string,
  aiAgentId: string,
  args: Record<string, unknown>,
) {
  const record = await prisma.mcpTool.findFirst({
    include: { mcpServer: true, tool: { include: { assignments: { where: { aiAgentId } } } } },
    where: { toolId },
  });
  if (
    !record ||
    !record.mcpServer.enabled ||
    !record.tool.enabled ||
    record.discoveryStatus !== "CURRENT" ||
    record.tool.assignments.length === 0
  ) {
    throw new McpToolDeniedError();
  }

  const secrets = credentials(record.mcpServer);
  const result = await withMcpClient(record.mcpServer.url, secrets, (client) =>
    client.callTool({ arguments: args, name: record.remoteName }),
  );
  const serialized = JSON.stringify(result);
  if (Buffer.byteLength(serialized) > maxResultBytes) {
    throw new McpToolDeniedError("MCP result exceeds 64 KB.");
  }
  return JSON.parse(redact(serialized, secrets));
}

async function getServer(id: string) {
  const server = await prisma.mcpServer.findFirst({ where: { id } });
  if (!server) throw new McpNotFoundError();
  return server;
}

function encryptedCredentials(input: Pick<UpdateMcpServerInput, "bearerToken" | "secretHeaders">) {
  return {
    ...(input.bearerToken !== undefined && {
      bearerTokenEncrypted: input.bearerToken
        ? encryptToolSecret(input.bearerToken, toolEncryptionConfig.masterKey)
        : null,
    }),
    ...(input.secretHeaders !== undefined && {
      secretHeadersEncrypted: input.secretHeaders
        ? encryptToolSecret(JSON.stringify(input.secretHeaders), toolEncryptionConfig.masterKey)
        : null,
    }),
  };
}

function credentials(server: {
  bearerTokenEncrypted: string | null;
  secretHeadersEncrypted: string | null;
}) {
  return {
    bearerToken: server.bearerTokenEncrypted
      ? decryptToolSecret(server.bearerTokenEncrypted, toolEncryptionConfig.masterKey)
      : undefined,
    secretHeaders: server.secretHeadersEncrypted
      ? JSON.parse(
          decryptToolSecret(server.secretHeadersEncrypted, toolEncryptionConfig.masterKey),
        )
      : undefined,
  } satisfies McpCredentials;
}

function redact(value: string, secrets: McpCredentials) {
  return [secrets.bearerToken, ...Object.values(secrets.secretHeaders ?? {})]
    .filter(Boolean)
    .reduce((result, secret) => result.replaceAll(secret!, "[REDACTED]"), value);
}
