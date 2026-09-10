import { randomUUID } from "node:crypto";
import { createStorage } from "@repo/storage";
import { storageConfig } from "../../config";
import { prisma } from "../../utils/prisma";
import { requireWorkspaceId } from "../../utils/workspace-context";
import type { UpdateWebWidgetConfigInput } from "./schema";
import type { WebWidgetConfigDto, WebWidgetConfigResponse } from "./types";

export class WebWidgetConfigNotFoundError extends Error {
  constructor() {
    super("This Workspace has no Web Widget configuration.");
    this.name = "WebWidgetConfigNotFoundError";
  }
}

export async function getWebWidgetConfig(): Promise<WebWidgetConfigResponse> {
  const [webWidgetConfig, workspace] = await Promise.all([
    prisma.webWidgetConfig.findFirst(),
    prisma.workspace.findUnique({
      where: { id: requireWorkspaceId() },
      select: { closingMessage: true },
    }),
  ]);

  if (!webWidgetConfig) {
    throw new WebWidgetConfigNotFoundError();
  }

  return {
    webWidgetConfig: toDto(webWidgetConfig),
    closingMessage: workspace?.closingMessage ?? null,
  };
}

export async function updateWebWidgetConfig(
  input: UpdateWebWidgetConfigInput,
): Promise<WebWidgetConfigResponse> {
  const existing = await prisma.webWidgetConfig.findFirst({ select: { id: true } });

  if (!existing) {
    throw new WebWidgetConfigNotFoundError();
  }

  const [webWidgetConfig, workspace] = await prisma.$transaction([
    prisma.webWidgetConfig.update({
      where: { id: existing.id },
      data: {
        allowedDomains: input.allowedDomains,
        botName: input.botName,
        primaryColor: input.primaryColor,
        welcomeMessage: input.welcomeMessage,
        ...(input.logoKey !== undefined ? { logoKey: input.logoKey } : {}),
      },
    }),
    prisma.workspace.update({
      where: { id: requireWorkspaceId() },
      data: { closingMessage: input.closingMessage },
      select: { closingMessage: true },
    }),
  ]);

  return { webWidgetConfig: toDto(webWidgetConfig), closingMessage: workspace.closingMessage };
}

const allowedLogoTypes = new Set(["image/png", "image/jpeg", "image/svg+xml"]);
const maxLogoSizeBytes = 2 * 1024 * 1024;
const logoExtensionByType: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
};

export async function uploadWebWidgetLogo(file: File): Promise<WebWidgetConfigResponse> {
  if (!allowedLogoTypes.has(file.type)) {
    throw new Error("Upload a PNG, JPG, or SVG image.");
  }
  if (file.size === 0 || file.size > maxLogoSizeBytes) {
    throw new Error("Logo must be between 1 byte and 2MB.");
  }

  const existing = await prisma.webWidgetConfig.findFirst({ select: { id: true } });

  if (!existing) {
    throw new WebWidgetConfigNotFoundError();
  }

  const workspaceId = requireWorkspaceId();
  const extension = logoExtensionByType[file.type];
  const storageKey = `web-widget-logos/${workspaceId}/${randomUUID()}.${extension}`;

  await createStorage(storageConfig).putObject({
    body: Buffer.from(await file.arrayBuffer()),
    contentType: file.type,
    key: storageKey,
  });

  const [webWidgetConfig, workspace] = await prisma.$transaction([
    prisma.webWidgetConfig.update({
      where: { id: existing.id },
      data: { logoKey: storageKey },
    }),
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { closingMessage: true },
    }),
  ]);

  return {
    webWidgetConfig: toDto(webWidgetConfig),
    closingMessage: workspace?.closingMessage ?? null,
  };
}

function toDto(webWidgetConfig: {
  id: string;
  widgetKey: string;
  botName: string;
  welcomeMessage: string;
  primaryColor: string;
  allowedDomains: string[];
  logoKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}): WebWidgetConfigDto {
  return {
    id: webWidgetConfig.id,
    widgetKey: webWidgetConfig.widgetKey,
    botName: webWidgetConfig.botName,
    welcomeMessage: webWidgetConfig.welcomeMessage,
    primaryColor: webWidgetConfig.primaryColor,
    allowedDomains: webWidgetConfig.allowedDomains,
    logoKey: webWidgetConfig.logoKey,
    logoUrl: webWidgetConfig.logoKey
      ? createStorage(storageConfig).getObjectUrl(webWidgetConfig.logoKey)
      : null,
    createdAt: webWidgetConfig.createdAt,
    updatedAt: webWidgetConfig.updatedAt,
  };
}
