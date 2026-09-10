import { randomUUID } from "node:crypto";
import Ajv from "ajv";
import { toolEncryptionConfig } from "../../config";
import { prisma } from "../../utils/prisma";
import { requireWorkspaceId } from "../../utils/workspace-context";
import type { CreateHttpToolInput, UpdateHttpToolInput } from "./schema";
import { encryptToolSecret } from "./secrets";

export class HttpToolNotFoundError extends Error {}
export class InvalidToolSchemaError extends Error {}

const includeHttpConfig = { httpConfig: true } as const;

export async function listHttpTools() {
  return (await prisma.tool.findMany({ include: includeHttpConfig, where: { origin: "HTTP" } })).map(
    toDto,
  );
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
        create: { ...secretConfig(input), workspaceId },
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
    prisma.toolPolicy.deleteMany({ where: { toolId: id } }),
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
