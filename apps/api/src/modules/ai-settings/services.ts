import { randomUUID } from "node:crypto";
import { prisma } from "../../utils/prisma";
import { requireWorkspaceId } from "../../utils/workspace-context";
import type { UpdateAiSettingsInput } from "./schema";

const defaults = { autoResolveAfterSeconds: 3600, autoResolveEnabled: true, followUpAfterSeconds: 900 };

export async function getAiSettings() {
  const workspaceId = requireWorkspaceId();
  return (await prisma.aiSettings.findFirst()) ?? { ...defaults, workspaceId };
}

export async function updateAiSettings(input: UpdateAiSettingsInput) {
  const workspaceId = requireWorkspaceId();
  return prisma.aiSettings.upsert({
    create: { ...input, id: randomUUID(), workspaceId },
    update: input,
    where: { workspaceId },
  });
}
