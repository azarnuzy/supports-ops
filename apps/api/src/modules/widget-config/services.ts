import { prisma } from "../../utils/prisma";
import type { UpdateWebWidgetConfigInput } from "./schema";
import type { WebWidgetConfigDto, WebWidgetConfigResponse } from "./types";

export class WebWidgetConfigNotFoundError extends Error {
  constructor() {
    super("This Workspace has no Web Widget configuration.");
    this.name = "WebWidgetConfigNotFoundError";
  }
}

export async function getWebWidgetConfig(): Promise<WebWidgetConfigResponse> {
  const webWidgetConfig = await prisma.webWidgetConfig.findFirst();

  if (!webWidgetConfig) {
    throw new WebWidgetConfigNotFoundError();
  }

  return { webWidgetConfig: toDto(webWidgetConfig) };
}

export async function updateWebWidgetConfig(
  input: UpdateWebWidgetConfigInput,
): Promise<WebWidgetConfigResponse> {
  const existing = await prisma.webWidgetConfig.findFirst({ select: { id: true } });

  if (!existing) {
    throw new WebWidgetConfigNotFoundError();
  }

  const webWidgetConfig = await prisma.webWidgetConfig.update({
    where: { id: existing.id },
    data: {
      allowedDomains: input.allowedDomains,
      botName: input.botName,
      primaryColor: input.primaryColor,
      welcomeMessage: input.welcomeMessage,
    },
  });

  return { webWidgetConfig: toDto(webWidgetConfig) };
}

function toDto(webWidgetConfig: {
  id: string;
  widgetKey: string;
  botName: string;
  welcomeMessage: string;
  primaryColor: string;
  allowedDomains: string[];
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
    createdAt: webWidgetConfig.createdAt,
    updatedAt: webWidgetConfig.updatedAt,
  };
}
