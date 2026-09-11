import { randomUUID } from "node:crypto";
import { prisma } from "../../utils/prisma";
import { requireWorkspaceId } from "../../utils/workspace-context";
import type { UpdateAiSettingsInput } from "./schema";
import { rescheduleIdleClosures } from "../follow-up/queue";

const defaults = {
  autoResolveAfterSeconds: 3600,
  autoResolveEnabled: true,
  followUpAfterSeconds: 900,
  idleCloseAfterSeconds: 28_800,
};

export const defaultAiAgentMessages = {
  handoffMessage: "Hello, I’m {humanAgentName} from the support team. I’ll continue helping you.",
  resolutionMessage: "This conversation has been resolved.",
};

export async function getAiSettings() {
  const workspaceId = requireWorkspaceId();
  const [settings, aiAgent] = await Promise.all([
    prisma.aiSettings.findFirst(),
    prisma.aiAgent.findFirst({ orderBy: { createdAt: "asc" } }),
  ]);
  if (!aiAgent) throw new Error("Workspace AI Agent not found.");
  return {
    ...(settings ?? { ...defaults, workspaceId }),
    aiAgentId: aiAgent.id,
    handoffMessage: aiAgent.handoffMessage ?? defaultAiAgentMessages.handoffMessage,
    instructions: aiAgent.instructions ?? "",
    resolutionMessage: aiAgent.resolutionMessage ?? defaultAiAgentMessages.resolutionMessage,
  };
}

export async function updateAiSettings(input: UpdateAiSettingsInput) {
  const workspaceId = requireWorkspaceId();
  const { aiAgentId, handoffMessage, instructions, resolutionMessage, ...timers } = input;
  const settings = await prisma.$transaction(async (tx) => {
    await tx.aiAgent.update({
      data: { handoffMessage, instructions, resolutionMessage },
      where: { workspaceId_id: { id: aiAgentId, workspaceId } },
    });
    const settings = await tx.aiSettings.upsert({
      create: { ...timers, id: randomUUID(), workspaceId },
      update: timers,
      where: { workspaceId },
    });
    return { ...settings, aiAgentId, handoffMessage, instructions, resolutionMessage };
  });
  await rescheduleIdleClosures(workspaceId);
  return settings;
}
