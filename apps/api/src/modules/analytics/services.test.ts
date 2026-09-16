import { randomUUID } from "node:crypto";
import type { AuthSession, User } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../../app";
import { unscopedPrisma } from "../../utils/prisma";
const getSession = vi.hoisted(() => vi.fn());
vi.mock("../auth/instance", () => ({
  auth: {
    api: { getSession },
    handler: vi.fn(),
  },
}));

type WorkspaceUser = Pick<User, "id" | "name" | "email" | "workspaceId" | "role">;

type Seeded = {
  workspaceId: string;
  otherWorkspaceId: string;
  emptyWorkspaceId: string;
  admin: WorkspaceUser;
  humanAgent: WorkspaceUser;
  otherAdmin: WorkspaceUser;
  emptyAdmin: WorkspaceUser;
  emptyChannelId: string;
  run: string;
};

const slugPrefix = "analytics-test-";

let seeded: Seeded;

async function databaseIsReachable() {
  try {
    await unscopedPrisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** UTC midnight of a day — the base for day buckets and UTC calendar
 * windows in every fixture. */
function dayStartUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Hand-counted fixture. The Workspace under test holds 14 Tickets, one of
 * them soft-deleted, spread over two Channels and two Human Agents. "now" is
 * the moment the seed runs, so every "now" Ticket falls inside the default
 * trailing-7-day window while the 10-day-old Tickets stay outside it:
 *
 * | Ticket | Status         | Resolution reason | Resolved by | Escalated | Created   | Channel | Assignee   | Human reply
 * | T1     | RESOLVED       | CUSTOMER_CONFIRMED | AI_AGENT   | no        | now       | web     | —          | —
 * | T2     | RESOLVED       | CUSTOMER_INACTIVE  | AI_AGENT   | no        | now       | web     | —          | —
 * | T3     | RESOLVED       | CUSTOMER_INACTIVE  | AI_AGENT   | no        | now       | wa      | —          | —
 * | T4     | RESOLVED       | HUMAN_RESOLVED     | agent      | yes       | now       | web     | agent      | none (resolvedAt now)
 * | T5     | ESCALATED      | —                  | —          | yes       | now       | web     | —          | —
 * | T6     | ESCALATED      | —                  | —          | yes       | now       | wa      | —          | —
 * | T7     | HUMAN_HANDLING | —                  | —          | yes       | now − 2h  | web     | agent      | +1h
 * | T8     | RESOLVED       | CUSTOMER_INACTIVE_HUMAN_HANDLING | PLATFORM | yes | now | web    | agent      | —
 * | T9     | RESOLVED       | CUSTOMER_INACTIVE_SHARED_QUEUE | PLATFORM | yes | now  | wa      | —          | —
 * | T10    | AI_HANDLING    | —                  | —          | no        | now       | web     | —          | —
 * | T11    | RESOLVED       | CUSTOMER_CONFIRMED | AI_AGENT   | no        | now       | web     | —          | —  soft-deleted
 * | T12    | RESOLVED       | HUMAN_RESOLVED     | otherAgent | no        | now       | web     | otherAgent | —
 * | T13    | AI_HANDLING    | —                  | —          | no        | now − 10d | web     | agent      | +30m
 * | T14    | RESOLVED       | HUMAN_RESOLVED     | otherAgent | yes       | now − 10d | wa      | otherAgent | —
 *
 * The other Workspace holds 3 Tickets (2 AI-confirmed, 1 AI_HANDLING) that
 * must never leak in. The empty Workspace holds a Channel and no Tickets.
 */
async function seedWorkspaces(): Promise<Seeded> {
  const run = randomUUID();
  const workspaceId = `ws-${run}`;
  const otherWorkspaceId = `ws-other-${run}`;
  const emptyWorkspaceId = `ws-empty-${run}`;
  await unscopedPrisma.workspace.createMany({
    data: [
      { id: workspaceId, name: "Analytics Test", slug: `${slugPrefix}${run}` },
      { id: otherWorkspaceId, name: "Analytics Other", slug: `${slugPrefix}other-${run}` },
      { id: emptyWorkspaceId, name: "Analytics Empty", slug: `${slugPrefix}empty-${run}` },
    ],
  });

  const agent: WorkspaceUser = {
    id: `agent-${run}`,
    workspaceId,
    name: "Dana Solusi",
    role: "HUMAN_AGENT",
    email: "",
  };
  const otherAgent: WorkspaceUser = {
    id: `other-agent-${run}`,
    workspaceId,
    name: "Rian Tugas",
    role: "HUMAN_AGENT",
    email: "",
  };
  const admin: WorkspaceUser = {
    id: `admin-${run}`,
    workspaceId,
    name: "Adi Admin",
    role: "ADMIN",
    email: "",
  };
  const otherAdmin: WorkspaceUser = {
    id: `other-admin-${run}`,
    workspaceId: otherWorkspaceId,
    name: "Ati Admin",
    role: "ADMIN",
    email: "",
  };
  const humanAgent: WorkspaceUser = {
    id: `human-${run}`,
    workspaceId,
    name: "Hana Agen",
    role: "HUMAN_AGENT",
    email: "",
  };
  const emptyAdmin: WorkspaceUser = {
    id: `empty-admin-${run}`,
    workspaceId: emptyWorkspaceId,
    name: "Eni Admin",
    role: "ADMIN",
    email: "",
  };
  await unscopedPrisma.user.createMany({
    data: [agent, otherAgent, admin, otherAdmin, humanAgent, emptyAdmin].map((user) => ({
      ...user,
      email: `${user.id}@analytics.test`,
      emailVerified: true,
    })),
  });
  const webChannel = {
    id: `channel-web-${run}`,
    workspaceId,
    aiAgentId: `aiagent-${run}`,
    name: "Web Widget",
    type: "WEB" as const,
  };
  const waChannel = {
    id: `channel-wa-${run}`,
    workspaceId,
    aiAgentId: `aiagent-${run}`,
    name: "WhatsApp",
    type: "WHATSAPP" as const,
  };
  const otherChannel = {
    id: `channel-other-${run}`,
    workspaceId: otherWorkspaceId,
    aiAgentId: `aiagent-other-${run}`,
    name: "Web Widget",
    type: "WEB" as const,
  };
  const emptyChannelId = `channel-empty-${run}`;
  await unscopedPrisma.aiAgent.createMany({
    data: [
      { id: `aiagent-${run}`, workspaceId, name: "AI Agent" },
      { id: `aiagent-other-${run}`, workspaceId: otherWorkspaceId, name: "AI Agent" },
      { id: `aiagent-empty-${run}`, workspaceId: emptyWorkspaceId, name: "AI Agent" },
    ],
  });
  await unscopedPrisma.channel.createMany({
    data: [
      webChannel,
      waChannel,
      otherChannel,
      {
        id: emptyChannelId,
        workspaceId: emptyWorkspaceId,
        aiAgentId: `aiagent-empty-${run}`,
        name: "Web Widget",
        type: "WEB" as const,
      },
    ],
  });

  const identity = {
    id: `identity-${run}`,
    workspaceId,
    name: "Citra",
    email: "citra@example.com",
    channelType: "WEB" as const,
    canonicalId: "citra@example.com",
  };
  const waIdentity = {
    id: `identity-wa-${run}`,
    workspaceId,
    name: "Bima",
    email: "bima@example.com",
    channelType: "WHATSAPP" as const,
    canonicalId: "bima@example.com",
  };
  const otherIdentity = {
    id: `identity-other-${run}`,
    workspaceId: otherWorkspaceId,
    name: "Citra",
    email: "citra@example.com",
    channelType: "WEB" as const,
    canonicalId: "citra@example.com",
  };
  const emptyIdentity = {
    id: `identity-empty-${run}`,
    workspaceId: emptyWorkspaceId,
    name: "Citra",
    email: "citra@example.com",
    channelType: "WEB" as const,
    canonicalId: "citra@example.com",
  };
  await unscopedPrisma.customerIdentity.createMany({
    data: [identity, waIdentity, otherIdentity, emptyIdentity],
  });

  const escalated = new Date("2026-09-01T10:00:00.000Z");
  const now = new Date();
  const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
  const t7Created = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  type TicketSeed = {
    key: string;
    status: "AI_HANDLING" | "ESCALATED" | "HUMAN_HANDLING" | "RESOLVED";
    resolutionReason?:
      | "CUSTOMER_CONFIRMED"
      | "CUSTOMER_INACTIVE"
      | "CUSTOMER_INACTIVE_HUMAN_HANDLING"
      | "CUSTOMER_INACTIVE_SHARED_QUEUE"
      | "HUMAN_RESOLVED";
    resolvedBy?: string;
    escalatedAt?: Date;
    createdAt?: Date;
    resolvedAt?: Date;
    channelId: string;
    customerIdentityId: string;
    assignedHumanAgentId?: string;
    deletedAt?: Date;
  };

  const tickets: TicketSeed[] = [
    {
      key: "t1",
      status: "RESOLVED",
      resolutionReason: "CUSTOMER_CONFIRMED",
      resolvedBy: "AI_AGENT",
      channelId: webChannel.id,
      customerIdentityId: identity.id,
    },
    {
      key: "t2",
      status: "RESOLVED",
      resolutionReason: "CUSTOMER_INACTIVE",
      resolvedBy: "AI_AGENT",
      channelId: webChannel.id,
      customerIdentityId: identity.id,
    },
    {
      key: "t3",
      status: "RESOLVED",
      resolutionReason: "CUSTOMER_INACTIVE",
      resolvedBy: "AI_AGENT",
      channelId: waChannel.id,
      customerIdentityId: waIdentity.id,
    },
    {
      key: "t4",
      status: "RESOLVED",
      resolutionReason: "HUMAN_RESOLVED",
      resolvedBy: agent.id,
      escalatedAt: escalated,
      resolvedAt: now,
      channelId: webChannel.id,
      customerIdentityId: identity.id,
      assignedHumanAgentId: agent.id,
    },
    {
      key: "t5",
      status: "ESCALATED",
      escalatedAt: escalated,
      channelId: webChannel.id,
      customerIdentityId: identity.id,
    },
    {
      key: "t6",
      status: "ESCALATED",
      escalatedAt: escalated,
      channelId: waChannel.id,
      customerIdentityId: waIdentity.id,
    },
    {
      key: "t7",
      status: "HUMAN_HANDLING",
      escalatedAt: escalated,
      createdAt: t7Created,
      channelId: webChannel.id,
      customerIdentityId: identity.id,
      assignedHumanAgentId: agent.id,
    },
    {
      key: "t8",
      status: "RESOLVED",
      resolutionReason: "CUSTOMER_INACTIVE_HUMAN_HANDLING",
      resolvedBy: "PLATFORM",
      escalatedAt: escalated,
      channelId: webChannel.id,
      customerIdentityId: identity.id,
      assignedHumanAgentId: agent.id,
    },
    {
      key: "t9",
      status: "RESOLVED",
      resolutionReason: "CUSTOMER_INACTIVE_SHARED_QUEUE",
      resolvedBy: "PLATFORM",
      escalatedAt: escalated,
      channelId: waChannel.id,
      customerIdentityId: waIdentity.id,
    },
    {
      key: "t10",
      status: "AI_HANDLING",
      channelId: webChannel.id,
      customerIdentityId: identity.id,
    },
    {
      key: "t11",
      status: "RESOLVED",
      resolutionReason: "CUSTOMER_CONFIRMED",
      resolvedBy: "AI_AGENT",
      channelId: webChannel.id,
      customerIdentityId: identity.id,
      deletedAt: escalated,
    },
    {
      key: "t12",
      status: "RESOLVED",
      resolutionReason: "HUMAN_RESOLVED",
      resolvedBy: otherAgent.id,
      resolvedAt: now,
      channelId: webChannel.id,
      customerIdentityId: identity.id,
      assignedHumanAgentId: otherAgent.id,
    },
    {
      key: "t13",
      status: "AI_HANDLING",
      createdAt: tenDaysAgo,
      channelId: webChannel.id,
      customerIdentityId: identity.id,
      assignedHumanAgentId: agent.id,
    },
    {
      key: "t14",
      status: "RESOLVED",
      resolutionReason: "HUMAN_RESOLVED",
      resolvedBy: otherAgent.id,
      resolvedAt: tenDaysAgo,
      createdAt: tenDaysAgo,
      escalatedAt: tenDaysAgo,
      channelId: waChannel.id,
      customerIdentityId: waIdentity.id,
      assignedHumanAgentId: otherAgent.id,
    },
  ];

  const sessions = tickets.map((ticket, index) => ({
    id: `session-${ticket.key}-${run}`,
    workspaceId,
    channelId: ticket.channelId,
    customerIdentityId: ticket.customerIdentityId,
    accessToken: `token-${run}-${index}`,
  }));
  await unscopedPrisma.session.createMany({ data: sessions });

  await unscopedPrisma.ticket.createMany({
    data: tickets.map((ticket, index) => ({
      id: `ticket-${ticket.key}-${run}`,
      workspaceId,
      aiAgentId: `aiagent-${run}`,
      channelId: ticket.channelId,
      sessionId: sessions[index].id,
      customerIdentityId: ticket.customerIdentityId,
      title: `Ticket ${ticket.key}`,
      status: ticket.status,
      resolutionReason: ticket.resolutionReason,
      resolvedBy: ticket.resolvedBy,
      escalatedAt: ticket.escalatedAt,
      assignedHumanAgentId: ticket.assignedHumanAgentId,
      deletedAt: ticket.deletedAt,
      createdAt: ticket.createdAt,
      resolvedAt: ticket.resolvedAt,
    })),
  });

  // Human replies feeding avgFirstResponseSeconds: T7 is answered one hour
  // after creation, T13 half an hour after. T4 carries no reply at all, so
  // an assigned Ticket without a human answer never joins the average.
  await unscopedPrisma.conversation.createMany({
    data: [
      {
        id: `conversation-t7-${run}`,
        scopeKey: `scope-t7-${run}`,
        sessionId: `session-t7-${run}`,
        userId: admin.id,
        metadata: {},
        workspaceId,
      },
      {
        id: `conversation-t13-${run}`,
        scopeKey: `scope-t13-${run}`,
        sessionId: `session-t13-${run}`,
        userId: admin.id,
        metadata: {},
        workspaceId,
      },
    ],
  });
  await unscopedPrisma.message.createMany({
    data: [
      {
        id: `message-t7-${run}`,
        memorySessionId: `conversation-t7-${run}`,
        runId: `run-t7-${run}`,
        turn: 2,
        position: 2,
        role: "assistant",
        message: { content: "Looking into it." },
        createdAt: new Date(t7Created.getTime() + 60 * 60 * 1000),
        workspaceId,
        ticketId: `ticket-t7-${run}`,
        sessionId: `session-t7-${run}`,
        senderType: "HUMAN_AGENT",
        senderUserId: agent.id,
        content: "Looking into it.",
        externalMessageId: `external-t7-${run}`,
      },
      {
        id: `message-t13-${run}`,
        memorySessionId: `conversation-t13-${run}`,
        runId: `run-t13-${run}`,
        turn: 2,
        position: 2,
        role: "assistant",
        message: { content: "On it." },
        createdAt: new Date(tenDaysAgo.getTime() + 30 * 60 * 1000),
        workspaceId,
        ticketId: `ticket-t13-${run}`,
        sessionId: `session-t13-${run}`,
        senderType: "HUMAN_AGENT",
        senderUserId: agent.id,
        content: "On it.",
        externalMessageId: `external-t13-${run}`,
      },
    ],
  });

  const otherSessions = [1, 2, 3].map((index) => ({
    id: `session-other-${index}-${run}`,
    workspaceId: otherWorkspaceId,
    channelId: otherChannel.id,
    customerIdentityId: otherIdentity.id,
    accessToken: `token-other-${index}-${run}`,
  }));
  await unscopedPrisma.session.createMany({ data: otherSessions });
  await unscopedPrisma.ticket.createMany({
    data: otherSessions.map((session, index) => ({
      id: `ticket-other-${index}-${run}`,
      workspaceId: otherWorkspaceId,
      aiAgentId: `aiagent-other-${run}`,
      channelId: otherChannel.id,
      sessionId: session.id,
      customerIdentityId: otherIdentity.id,
      title: `Other ticket ${index}`,
      status: index === 2 ? "AI_HANDLING" : "RESOLVED",
      resolutionReason: index === 2 ? null : "CUSTOMER_CONFIRMED",
      resolvedBy: index === 2 ? null : "AI_AGENT",
    })),
  });

  return {
    workspaceId,
    otherWorkspaceId,
    emptyWorkspaceId,
    admin,
    humanAgent,
    otherAdmin,
    emptyAdmin,
    emptyChannelId,
    run,
  };
}

async function deleteSeededWorkspaces() {
  const workspaces = await unscopedPrisma.workspace.findMany({
    where: { slug: { startsWith: slugPrefix } },
    select: { id: true },
  });
  const workspaceIds = workspaces.map((workspace) => workspace.id);

  await unscopedPrisma.ticket.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await unscopedPrisma.message.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await unscopedPrisma.conversation.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await unscopedPrisma.session.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await unscopedPrisma.customerIdentity.deleteMany({
    where: { workspaceId: { in: workspaceIds } },
  });
  await unscopedPrisma.channel.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await unscopedPrisma.aiAgent.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await unscopedPrisma.aiSettings.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await unscopedPrisma.user.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await unscopedPrisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
}

function sessionFor(user: WorkspaceUser): { session: Partial<AuthSession>; user: Partial<User> } {
  return { session: { id: `session-${user.id}`, userId: user.id }, user };
}

function requestOverview(query?: string) {
  return app.request(`/analytics/overview${query ? `?${query}` : ""}`, {
    headers: { cookie: "better-auth.session_token=unused" },
  });
}

type OverviewResponse = {
  analytics: {
    totalTickets: number;
    aiResolution: {
      customerConfirmed: { count: number; rate: number | null };
      customerInactive: { count: number; rate: number | null };
    };
    humanIdleClosure: {
      handled: { count: number; rate: number | null };
      sharedQueue: { count: number; rate: number | null };
    };
    humanEscalation: { count: number; rate: number | null };
    statusCounts: { status: string; count: number }[];
    channelCounts: {
      channelId: string;
      channelName: string;
      channelType: string;
      ticketCount: number;
    }[];
    range: { from: string; to: string };
    agentStats: {
      humanAgentId: string;
      humanAgentName: string;
      openTicketCount: number;
      resolvedCount: number;
      avgFirstResponseSeconds: number | null;
    }[];
  };
};

const databaseReachable = await databaseIsReachable();
if (!databaseReachable) {
  console.warn("Skipping analytics overview tests: development database is not reachable.");
}

describe.skipIf(!databaseReachable)("GET /analytics/overview", () => {
  beforeAll(async () => {
    await deleteSeededWorkspaces();
    seeded = await seedWorkspaces();
  });

  afterEach(() => {
    getSession.mockReset();
  });

  it("returns figures matching the hand-counted fixture", async () => {
    getSession.mockResolvedValue(sessionFor(seeded.admin));

    const response = await requestOverview();

    expect(response.status).toBe(200);
    const body = (await response.json()) as OverviewResponse;

    expect(body.analytics.range).toEqual({
      from: utcDayKey(daysAgoAt(6, 0)),
      to: utcDayKey(new Date()),
    });
    expect(body.analytics.totalTickets).toBe(11);
    expect(body.analytics.aiResolution.customerConfirmed.count).toBe(1);
    expect(body.analytics.aiResolution.customerConfirmed.rate).toBeCloseTo(1 / 11);
    expect(body.analytics.aiResolution.customerInactive.count).toBe(2);
    expect(body.analytics.aiResolution.customerInactive.rate).toBeCloseTo(2 / 11);
    expect(body.analytics.humanEscalation.count).toBe(6);
    expect(body.analytics.humanEscalation.rate).toBeCloseTo(6 / 11);
    expect(body.analytics.humanIdleClosure.handled.count).toBe(1);
    expect(body.analytics.humanIdleClosure.handled.rate).toBeCloseTo(1 / 11);
    expect(body.analytics.humanIdleClosure.sharedQueue.count).toBe(1);
    expect(body.analytics.humanIdleClosure.sharedQueue.rate).toBeCloseTo(1 / 11);

    expect(body.analytics.statusCounts).toEqual([
      { status: "AI_HANDLING", count: 1 },
      { status: "ESCALATED", count: 2 },
      { status: "HUMAN_HANDLING", count: 1 },
      { status: "RESOLVED", count: 7 },
    ]);

    const channelCounts = [...body.analytics.channelCounts].sort((a, b) =>
      a.channelName.localeCompare(b.channelName),
    );
    expect(channelCounts).toEqual([
      {
        channelId: `channel-web-${seeded.run}`,
        channelName: "Web Widget",
        channelType: "WEB",
        ticketCount: 8,
      },
      {
        channelId: `channel-wa-${seeded.run}`,
        channelName: "WhatsApp",
        channelType: "WHATSAPP",
        ticketCount: 3,
      },
    ]);

    // Dana leads on open Tickets; Rian rides along on the strength of a
    // resolution, and T12's missing reply keeps his average null.
    expect(body.analytics.agentStats).toEqual([
      {
        humanAgentId: `agent-${seeded.run}`,
        humanAgentName: "Dana Solusi",
        openTicketCount: 1,
        resolvedCount: 1,
        avgFirstResponseSeconds: 3600,
      },
      {
        humanAgentId: `other-agent-${seeded.run}`,
        humanAgentName: "Rian Tugas",
        openTicketCount: 0,
        resolvedCount: 1,
        avgFirstResponseSeconds: null,
      },
    ]);
  });

  it("never counts another Workspace's Tickets", async () => {
    getSession.mockResolvedValue(sessionFor(seeded.otherAdmin));

    const response = await requestOverview();

    expect(response.status).toBe(200);
    const body = (await response.json()) as OverviewResponse;

    expect(body.analytics.totalTickets).toBe(3);
    expect(body.analytics.aiResolution.customerConfirmed.count).toBe(2);
  });

  it("scopes every figure to the requested date range", async () => {
    getSession.mockResolvedValue(sessionFor(seeded.admin));

    const from = utcDayKey(daysAgoAt(12, 0));
    const to = utcDayKey(new Date());
    const response = await requestOverview(`from=${from}&to=${to}`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as OverviewResponse;

    expect(body.analytics.range).toEqual({ from, to });
    // T13 and T14, created 10 days ago, only join inside this window.
    expect(body.analytics.totalTickets).toBe(13);
    expect(body.analytics.aiResolution.customerConfirmed.count).toBe(1);
    expect(body.analytics.humanEscalation.count).toBe(7);
    expect(body.analytics.statusCounts).toEqual([
      { status: "AI_HANDLING", count: 2 },
      { status: "ESCALATED", count: 2 },
      { status: "HUMAN_HANDLING", count: 1 },
      // T14 resolves inside this window on top of the seven "now" resolves.
      { status: "RESOLVED", count: 8 },
    ]);
    const channelCounts = [...body.analytics.channelCounts].sort((a, b) =>
      a.channelName.localeCompare(b.channelName),
    );
    expect(channelCounts.map((count) => count.ticketCount)).toEqual([9, 4]);
    // T13's half-hour reply averages against T7's hour; T14 hands Rian a
    // second in-range resolution.
    expect(body.analytics.agentStats).toEqual([
      {
        humanAgentId: `agent-${seeded.run}`,
        humanAgentName: "Dana Solusi",
        openTicketCount: 1,
        resolvedCount: 1,
        avgFirstResponseSeconds: 2700,
      },
      {
        humanAgentId: `other-agent-${seeded.run}`,
        humanAgentName: "Rian Tugas",
        openTicketCount: 0,
        resolvedCount: 2,
        avgFirstResponseSeconds: null,
      },
    ]);
  });

  it("returns null rates and zeroed spreads for a Workspace without Tickets", async () => {
    getSession.mockResolvedValue(sessionFor(seeded.emptyAdmin));

    const response = await requestOverview();

    expect(response.status).toBe(200);
    const body = (await response.json()) as OverviewResponse;

    expect(body.analytics.totalTickets).toBe(0);
    expect(body.analytics.aiResolution).toEqual({
      customerConfirmed: { count: 0, rate: null },
      customerInactive: { count: 0, rate: null },
    });
    expect(body.analytics.humanEscalation).toEqual({ count: 0, rate: null });
    expect(body.analytics.humanIdleClosure).toEqual({
      handled: { count: 0, rate: null },
      sharedQueue: { count: 0, rate: null },
    });
    expect(body.analytics.statusCounts).toEqual([
      { status: "AI_HANDLING", count: 0 },
      { status: "ESCALATED", count: 0 },
      { status: "HUMAN_HANDLING", count: 0 },
      { status: "RESOLVED", count: 0 },
    ]);
    expect(body.analytics.channelCounts).toEqual([
      {
        channelId: seeded.emptyChannelId,
        channelName: "Web Widget",
        channelType: "WEB",
        ticketCount: 0,
      },
    ]);
    expect(body.analytics.range).toEqual({
      from: utcDayKey(daysAgoAt(6, 0)),
      to: utcDayKey(new Date()),
    });
    expect(body.analytics.agentStats).toEqual([]);
  });

  it("forbids a Human Agent", async () => {
    getSession.mockResolvedValue(sessionFor(seeded.humanAgent));

    const response = await requestOverview();

    expect(response.status).toBe(403);
  });

  afterAll(async () => {
    await deleteSeededWorkspaces();
  });
});

describe("analytics range validation", () => {
  afterEach(() => {
    getSession.mockReset();
  });

  const today = utcDayKey(new Date());

  it.each([
    ["a lone from", "from=2026-01-01"],
    ["a lone to", `to=${today}`],
    ["an inverted order", `from=${today}&to=2026-01-01`],
    ["a 93-day span", `from=${utcDayKey(daysAgoAt(92, 0))}&to=${today}`],
    ["a compact date", "from=2026-1-1&to=2026-01-05"],
    ["an impossible date", "from=2026-02-30&to=2026-03-02"],
  ])("rejects overview %s with invalid_range", async (_label, query) => {
    const response = await requestOverview(query);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_range" });
  });

  it.each([
    ["a lone from", "from=2026-01-01"],
    ["a 93-day span", `from=${utcDayKey(daysAgoAt(92, 0))}&to=${today}`],
  ])("rejects traffic %s with invalid_range", async (_label, query) => {
    const response = await requestTraffic(query);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_range" });
  });

  it("accepts the 92-day inclusive span", async () => {
    const response = await requestOverview(`from=${utcDayKey(daysAgoAt(91, 0))}&to=${today}`);

    // Passing validation reaches the Admin check, which a sessionless
    // request fails — 403 here proves the range itself was accepted.
    expect(response.status).toBe(403);
  });
});

const trafficSlugPrefix = "analytics-traffic-test-";

function hourStartUtc(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours()),
  );
}

function hoursBefore(date: Date, hours: number): Date {
  return new Date(date.getTime() - hours * 60 * 60 * 1000);
}

type TrafficSeeded = {
  workspaceId: string;
  otherWorkspaceId: string;
  admin: WorkspaceUser;
  otherAdmin: WorkspaceUser;
  oldestBucketStart: Date;
};

async function deleteTrafficWorkspaces() {
  const workspaces = await unscopedPrisma.workspace.findMany({
    where: { slug: { startsWith: trafficSlugPrefix } },
    select: { id: true },
  });
  const workspaceIds = workspaces.map((workspace) => workspace.id);

  await unscopedPrisma.ticket.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await unscopedPrisma.session.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await unscopedPrisma.customerIdentity.deleteMany({
    where: { workspaceId: { in: workspaceIds } },
  });
  await unscopedPrisma.channel.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await unscopedPrisma.aiAgent.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await unscopedPrisma.user.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await unscopedPrisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
}

/**
 * Hand-counted fixture, timestamps relative to the current UTC day so the
 * default trailing-7-calendar-day window always covers them the same way
 * regardless of when the suite runs:
 *
 * | Ticket          | createdAt          | resolvedAt   | deletedAt | Workspace |
 * | recent-a        | current hour       | —            | —         | main      |
 * | recent-b        | current hour + 5m  | current hour | —         | main      |
 * | oldest-in-window| range start (day)  | —            | —         | main      |
 * | before-window   | 1h before range start | —         | —         | main      | excluded (outside window)
 * | soft-deleted    | current hour       | —            | now       | main      | excluded (deletedAt set)
 * | other-workspace | current hour       | current hour | —         | other     | excluded (Workspace isolation)
 */
async function seedTrafficWorkspace(): Promise<TrafficSeeded> {
  const run = randomUUID();
  const workspaceId = `ws-traffic-${run}`;
  const otherWorkspaceId = `ws-traffic-other-${run}`;
  await unscopedPrisma.workspace.createMany({
    data: [
      { id: workspaceId, name: "Traffic Test", slug: `${trafficSlugPrefix}${run}` },
      { id: otherWorkspaceId, name: "Traffic Other", slug: `${trafficSlugPrefix}other-${run}` },
    ],
  });

  const admin: WorkspaceUser = {
    id: `traffic-admin-${run}`,
    workspaceId,
    name: "Adi Admin",
    role: "ADMIN",
    email: "",
  };
  const otherAdmin: WorkspaceUser = {
    id: `traffic-other-admin-${run}`,
    workspaceId: otherWorkspaceId,
    name: "Ati Admin",
    role: "ADMIN",
    email: "",
  };
  await unscopedPrisma.user.createMany({
    data: [admin, otherAdmin].map((user) => ({
      ...user,
      email: `${user.id}@analytics.test`,
      emailVerified: true,
    })),
  });

  const aiAgentId = `traffic-aiagent-${run}`;
  const otherAiAgentId = `traffic-other-aiagent-${run}`;
  await unscopedPrisma.aiAgent.createMany({
    data: [
      { id: aiAgentId, workspaceId, name: "AI Agent" },
      { id: otherAiAgentId, workspaceId: otherWorkspaceId, name: "AI Agent" },
    ],
  });

  const channelId = `traffic-channel-${run}`;
  const otherChannelId = `traffic-other-channel-${run}`;
  await unscopedPrisma.channel.createMany({
    data: [
      { id: channelId, workspaceId, aiAgentId, name: "Web Widget", type: "WEB" },
      {
        id: otherChannelId,
        workspaceId: otherWorkspaceId,
        aiAgentId: otherAiAgentId,
        name: "Web Widget",
        type: "WEB",
      },
    ],
  });

  const identityId = `traffic-identity-${run}`;
  const otherIdentityId = `traffic-other-identity-${run}`;
  await unscopedPrisma.customerIdentity.createMany({
    data: [
      {
        id: identityId,
        workspaceId,
        name: "Citra",
        email: "citra@example.com",
        channelType: "WEB",
        canonicalId: "citra@example.com",
      },
      {
        id: otherIdentityId,
        workspaceId: otherWorkspaceId,
        name: "Citra",
        email: "citra@example.com",
        channelType: "WEB",
        canonicalId: "citra@example.com",
      },
    ],
  });

  const now = new Date();
  const currentHourStart = hourStartUtc(now);
  const oldestBucketStart = new Date(dayStartUtc(now).getTime() - 6 * 24 * 60 * 60 * 1000);

  type TicketSeed = {
    key: string;
    workspaceId: string;
    channelId: string;
    customerIdentityId: string;
    createdAt: Date;
    resolvedAt?: Date;
    deletedAt?: Date;
  };

  const tickets: TicketSeed[] = [
    {
      key: "recent-a",
      workspaceId,
      channelId,
      customerIdentityId: identityId,
      createdAt: currentHourStart,
    },
    {
      key: "recent-b",
      workspaceId,
      channelId,
      customerIdentityId: identityId,
      createdAt: new Date(currentHourStart.getTime() + 5 * 60 * 1000),
      resolvedAt: currentHourStart,
    },
    {
      key: "oldest-in-window",
      workspaceId,
      channelId,
      customerIdentityId: identityId,
      createdAt: oldestBucketStart,
    },
    {
      key: "before-window",
      workspaceId,
      channelId,
      customerIdentityId: identityId,
      createdAt: hoursBefore(oldestBucketStart, 1),
    },
    {
      key: "soft-deleted",
      workspaceId,
      channelId,
      customerIdentityId: identityId,
      createdAt: currentHourStart,
      deletedAt: now,
    },
    {
      key: "other-workspace",
      workspaceId: otherWorkspaceId,
      channelId: otherChannelId,
      customerIdentityId: otherIdentityId,
      createdAt: currentHourStart,
      resolvedAt: currentHourStart,
    },
  ];

  const sessions = tickets.map((ticket, index) => ({
    id: `traffic-session-${ticket.key}-${run}`,
    workspaceId: ticket.workspaceId,
    channelId: ticket.channelId,
    customerIdentityId: ticket.customerIdentityId,
    accessToken: `traffic-token-${run}-${index}`,
  }));
  await unscopedPrisma.session.createMany({ data: sessions });

  await unscopedPrisma.ticket.createMany({
    data: tickets.map((ticket, index) => ({
      id: `traffic-ticket-${ticket.key}-${run}`,
      workspaceId: ticket.workspaceId,
      aiAgentId: ticket.workspaceId === workspaceId ? aiAgentId : otherAiAgentId,
      channelId: ticket.channelId,
      sessionId: sessions[index].id,
      customerIdentityId: ticket.customerIdentityId,
      title: `Ticket ${ticket.key}`,
      status: "RESOLVED" as const,
      createdAt: ticket.createdAt,
      resolvedAt: ticket.resolvedAt,
      deletedAt: ticket.deletedAt,
    })),
  });

  return { workspaceId, otherWorkspaceId, admin, otherAdmin, oldestBucketStart };
}

function requestTraffic(query?: string) {
  return app.request(`/analytics/traffic${query ? `?${query}` : ""}`, {
    headers: { cookie: "better-auth.session_token=unused" },
  });
}

type TrafficResponse = {
  analytics: {
    range: { from: string; to: string };
    traffic: { hourStart: string; count: number }[];
    resolutions: { hourStart: string; count: number }[];
  };
};

describe.skipIf(!databaseReachable)("GET /analytics/traffic", () => {
  let trafficSeed: TrafficSeeded;

  beforeAll(async () => {
    await deleteTrafficWorkspaces();
    trafficSeed = await seedTrafficWorkspace();
  });

  afterEach(() => {
    getSession.mockReset();
  });

  it("buckets Tickets into hourly traffic and resolutions across the default 7-day window", async () => {
    getSession.mockResolvedValue(sessionFor(trafficSeed.admin));

    const response = await requestTraffic();

    expect(response.status).toBe(200);
    const body = (await response.json()) as TrafficResponse;

    expect(body.analytics.range).toEqual({
      from: utcDayKey(daysAgoAt(6, 0)),
      to: utcDayKey(new Date()),
    });
    expect(body.analytics.traffic).toHaveLength(168);
    expect(body.analytics.resolutions).toHaveLength(168);
    expect(body.analytics.traffic[0].hourStart).toBe(trafficSeed.oldestBucketStart.toISOString());

    const totalTraffic = body.analytics.traffic.reduce((sum, bucket) => sum + bucket.count, 0);
    const totalResolutions = body.analytics.resolutions.reduce(
      (sum, bucket) => sum + bucket.count,
      0,
    );
    expect(totalTraffic).toBe(3);
    expect(totalResolutions).toBe(1);

    expect(body.analytics.traffic[0].count).toBe(1);
    const currentHour = hourStartUtc(new Date()).toISOString();
    expect(body.analytics.traffic.find((bucket) => bucket.hourStart === currentHour)?.count).toBe(
      2,
    );
    expect(
      body.analytics.resolutions.find((bucket) => bucket.hourStart === currentHour)?.count,
    ).toBe(1);
  });

  it("never counts another Workspace's Tickets", async () => {
    getSession.mockResolvedValue(sessionFor(trafficSeed.otherAdmin));

    const response = await requestTraffic();

    expect(response.status).toBe(200);
    const body = (await response.json()) as TrafficResponse;

    const totalTraffic = body.analytics.traffic.reduce((sum, bucket) => sum + bucket.count, 0);
    const totalResolutions = body.analytics.resolutions.reduce(
      (sum, bucket) => sum + bucket.count,
      0,
    );
    expect(totalTraffic).toBe(1);
    expect(totalResolutions).toBe(1);
  });

  it("buckets only Tickets inside an explicit date range", async () => {
    getSession.mockResolvedValue(sessionFor(trafficSeed.admin));

    const from = utcDayKey(daysAgoAt(1, 0));
    const to = utcDayKey(new Date());
    const response = await requestTraffic(`from=${from}&to=${to}`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as TrafficResponse;

    expect(body.analytics.range).toEqual({ from, to });
    expect(body.analytics.traffic).toHaveLength(48);
    expect(body.analytics.resolutions).toHaveLength(48);
    // oldest-in-window, created at the default window's start, stays out.
    const totalTraffic = body.analytics.traffic.reduce((sum, bucket) => sum + bucket.count, 0);
    const totalResolutions = body.analytics.resolutions.reduce(
      (sum, bucket) => sum + bucket.count,
      0,
    );
    expect(totalTraffic).toBe(2);
    expect(totalResolutions).toBe(1);
  });

  it("forbids a non-Admin request", async () => {
    getSession.mockResolvedValue(sessionFor(seeded.humanAgent));

    const response = await requestTraffic();

    expect(response.status).toBe(403);
  });

  afterAll(async () => {
    await deleteTrafficWorkspaces();
    await unscopedPrisma.$disconnect();
  });
});

const trendsSlugPrefix = "analytics-trends-test-";

function daysAgoAt(daysBack: number, hourUtc: number): Date {
  return new Date(
    dayStartUtc(new Date()).getTime() - daysBack * 24 * 60 * 60 * 1000 + hourUtc * 60 * 60 * 1000,
  );
}

function utcDayKey(date: Date): string {
  return dayStartUtc(date).toISOString().slice(0, 10);
}

type TrendsSeeded = {
  workspaceId: string;
  otherWorkspaceId: string;
  admin: WorkspaceUser;
  otherAdmin: WorkspaceUser;
};

async function deleteTrendsWorkspaces() {
  const workspaces = await unscopedPrisma.workspace.findMany({
    where: { slug: { startsWith: trendsSlugPrefix } },
    select: { id: true },
  });
  const workspaceIds = workspaces.map((workspace) => workspace.id);

  await unscopedPrisma.ticket.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await unscopedPrisma.session.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await unscopedPrisma.customerIdentity.deleteMany({
    where: { workspaceId: { in: workspaceIds } },
  });
  await unscopedPrisma.channel.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await unscopedPrisma.aiAgent.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await unscopedPrisma.user.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await unscopedPrisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
}

/**
 * Hand-counted fixture, dates relative to the current UTC day so the trailing
 * 14-day window always covers them the same way regardless of when the suite
 * runs:
 *
 * | Ticket  | createdAt       | escalatedAt     | resolvedAt   | reason            | resolvedBy | Workspace | Note
 * | older   | 1 day ago 01:00 | —               | today 01:00  | CUSTOMER_CONFIRMED| AI_AGENT   | main      |
 * | first   | 1 day ago 02:00 | —               | —            | —                 | —          | main      |
 * | queue   | 1 day ago 03:00 | 1 day ago 04:00 | —            | —                 | —          | main      |
 * | fresh   | today 01:00     | —               | —            | —                 | —          | main      |
 * | deleted | today 02:00     | —               | —            | —                 | —          | main      | soft-deleted
 * | ancient | 15 days ago     | —               | —            | —                 | —          | main      | outside the default window, inside an explicit one
 * | foreign | today 01:00     | —               | —            | —                 | —          | other     | Workspace isolation
 */
async function seedTrendsWorkspace(): Promise<TrendsSeeded> {
  const run = randomUUID();
  const workspaceId = `ws-trends-${run}`;
  const otherWorkspaceId = `ws-trends-other-${run}`;
  await unscopedPrisma.workspace.createMany({
    data: [
      { id: workspaceId, name: "Trends Test", slug: `${trendsSlugPrefix}${run}` },
      { id: otherWorkspaceId, name: "Trends Other", slug: `${trendsSlugPrefix}other-${run}` },
    ],
  });

  const admin: WorkspaceUser = {
    id: `trends-admin-${run}`,
    workspaceId,
    name: "Tari Admin",
    role: "ADMIN",
    email: "",
  };
  const otherAdmin: WorkspaceUser = {
    id: `trends-other-admin-${run}`,
    workspaceId: otherWorkspaceId,
    name: "Tio Admin",
    role: "ADMIN",
    email: "",
  };
  await unscopedPrisma.user.createMany({
    data: [admin, otherAdmin].map((user) => ({
      ...user,
      email: `${user.id}@analytics.test`,
      emailVerified: true,
    })),
  });

  const aiAgentId = `trends-aiagent-${run}`;
  const otherAiAgentId = `trends-other-aiagent-${run}`;
  await unscopedPrisma.aiAgent.createMany({
    data: [
      { id: aiAgentId, workspaceId, name: "AI Agent" },
      { id: otherAiAgentId, workspaceId: otherWorkspaceId, name: "AI Agent" },
    ],
  });

  const channelId = `trends-channel-${run}`;
  const otherChannelId = `trends-other-channel-${run}`;
  await unscopedPrisma.channel.createMany({
    data: [
      { id: channelId, workspaceId, aiAgentId, name: "Web Widget", type: "WEB" },
      {
        id: otherChannelId,
        workspaceId: otherWorkspaceId,
        aiAgentId: otherAiAgentId,
        name: "Web Widget",
        type: "WEB",
      },
    ],
  });

  const identityId = `trends-identity-${run}`;
  const otherIdentityId = `trends-other-identity-${run}`;
  await unscopedPrisma.customerIdentity.createMany({
    data: [
      {
        id: identityId,
        workspaceId,
        name: "Budi",
        email: "budi@example.com",
        channelType: "WEB",
        canonicalId: "budi@example.com",
      },
      {
        id: otherIdentityId,
        workspaceId: otherWorkspaceId,
        name: "Budi",
        email: "budi@example.com",
        channelType: "WEB",
        canonicalId: "budi@example.com",
      },
    ],
  });

  type TicketSeed = {
    key: string;
    workspaceId: string;
    channelId: string;
    customerIdentityId: string;
    createdAt: Date;
    status: "AI_HANDLING" | "ESCALATED" | "RESOLVED";
    escalatedAt?: Date;
    resolvedAt?: Date;
    resolvedBy?: string;
    resolutionReason?: "CUSTOMER_CONFIRMED";
    deletedAt?: Date;
  };

  const tickets: TicketSeed[] = [
    {
      key: "older",
      workspaceId,
      channelId,
      customerIdentityId: identityId,
      createdAt: daysAgoAt(1, 1),
      status: "RESOLVED",
      resolvedAt: daysAgoAt(0, 1),
      resolvedBy: "AI_AGENT",
      resolutionReason: "CUSTOMER_CONFIRMED",
    },
    {
      key: "first",
      workspaceId,
      channelId,
      customerIdentityId: identityId,
      createdAt: daysAgoAt(1, 2),
      status: "AI_HANDLING",
    },
    {
      key: "queue",
      workspaceId,
      channelId,
      customerIdentityId: identityId,
      createdAt: daysAgoAt(1, 3),
      status: "ESCALATED",
      escalatedAt: daysAgoAt(1, 4),
    },
    {
      key: "fresh",
      workspaceId,
      channelId,
      customerIdentityId: identityId,
      createdAt: daysAgoAt(0, 1),
      status: "AI_HANDLING",
    },
    {
      key: "deleted",
      workspaceId,
      channelId,
      customerIdentityId: identityId,
      createdAt: daysAgoAt(0, 2),
      status: "AI_HANDLING",
      deletedAt: new Date(),
    },
    {
      key: "ancient",
      workspaceId,
      channelId,
      customerIdentityId: identityId,
      createdAt: daysAgoAt(15, 1),
      status: "AI_HANDLING",
    },
    {
      key: "foreign",
      workspaceId: otherWorkspaceId,
      channelId: otherChannelId,
      customerIdentityId: otherIdentityId,
      createdAt: daysAgoAt(0, 1),
      status: "AI_HANDLING",
    },
  ];

  const sessions = tickets.map((ticket, index) => ({
    id: `trends-session-${ticket.key}-${run}`,
    workspaceId: ticket.workspaceId,
    channelId: ticket.channelId,
    customerIdentityId: ticket.customerIdentityId,
    accessToken: `trends-token-${run}-${index}`,
  }));
  await unscopedPrisma.session.createMany({ data: sessions });

  await unscopedPrisma.ticket.createMany({
    data: tickets.map((ticket, index) => ({
      id: `trends-ticket-${ticket.key}-${run}`,
      workspaceId: ticket.workspaceId,
      aiAgentId: ticket.workspaceId === workspaceId ? aiAgentId : otherAiAgentId,
      channelId: ticket.channelId,
      sessionId: sessions[index].id,
      customerIdentityId: ticket.customerIdentityId,
      title: `Ticket ${ticket.key}`,
      status: ticket.status,
      createdAt: ticket.createdAt,
      escalatedAt: ticket.escalatedAt,
      resolvedAt: ticket.resolvedAt,
      resolvedBy: ticket.resolvedBy,
      resolutionReason: ticket.resolutionReason,
      deletedAt: ticket.deletedAt,
    })),
  });

  return { workspaceId, otherWorkspaceId, admin, otherAdmin };
}
type TrendsResponse = {
  analytics: {
    range: { from: string; to: string };
    trends: { date: string; created: number; aiResolved: number; escalated: number }[];
  };
};

describe.skipIf(!databaseReachable)("GET /analytics/overview trends", () => {
  let trendsSeed: TrendsSeeded;

  beforeAll(async () => {
    await deleteTrendsWorkspaces();
    trendsSeed = await seedTrendsWorkspace();
  });

  afterEach(() => {
    getSession.mockReset();
  });

  it("buckets daily created, AI-confirmed resolutions, and escalations across the requested range", async () => {
    getSession.mockResolvedValue(sessionFor(trendsSeed.admin));

    const from = utcDayKey(daysAgoAt(16, 0));
    const to = utcDayKey(new Date());
    const response = await requestOverview(`from=${from}&to=${to}`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as TrendsResponse;

    expect(body.analytics.range).toEqual({ from, to });
    const trends = body.analytics.trends;
    expect(trends).toHaveLength(17);
    expect(trends[0].date).toBe(from);
    expect(trends[16].date).toBe(to);

    const yesterday = body.analytics.trends.find(
      (trend) => trend.date === utcDayKey(daysAgoAt(1, 0)),
    );
    expect(yesterday?.created).toBe(3);
    expect(yesterday?.aiResolved).toBe(0);
    expect(yesterday?.escalated).toBe(1);

    const today = trends[16];
    expect(today.created).toBe(1);
    expect(today.aiResolved).toBe(1);
    expect(today.escalated).toBe(0);

    // The 15-day-old Ticket only counts inside an explicit window this wide.
    expect(trends.find((trend) => trend.date === utcDayKey(daysAgoAt(15, 0)))?.created).toBe(1);
    expect(trends.reduce((sum, trend) => sum + trend.created, 0)).toBe(5);
    expect(trends.reduce((sum, trend) => sum + trend.aiResolved, 0)).toBe(1);
    expect(trends.reduce((sum, trend) => sum + trend.escalated, 0)).toBe(1);
  });

  it("falls back to the trailing 7 days and never counts another Workspace's Tickets", async () => {
    getSession.mockResolvedValue(sessionFor(trendsSeed.otherAdmin));

    const response = await requestOverview();

    expect(response.status).toBe(200);
    const body = (await response.json()) as TrendsResponse;

    expect(body.analytics.range).toEqual({
      from: utcDayKey(daysAgoAt(6, 0)),
      to: utcDayKey(new Date()),
    });
    expect(body.analytics.trends).toHaveLength(7);
    expect(body.analytics.trends[0].date).toBe(utcDayKey(daysAgoAt(6, 0)));
    expect(body.analytics.trends.reduce((sum, trend) => sum + trend.created, 0)).toBe(1);
    expect(body.analytics.trends.reduce((sum, trend) => sum + trend.aiResolved, 0)).toBe(0);
    expect(body.analytics.trends.reduce((sum, trend) => sum + trend.escalated, 0)).toBe(0);
  });

  afterAll(async () => {
    await deleteTrendsWorkspaces();
    await unscopedPrisma.$disconnect();
  });
});
