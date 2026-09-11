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

/**
 * Hand-counted fixture. The Workspace under test holds 11 Tickets, one of
 * them soft-deleted, spread over two Channels and two Human Agents:
 *
 * | Ticket | Status         | Resolution reason  | Resolved by | Escalated | Channel | Assignee   |
 * | T1     | RESOLVED       | CUSTOMER_CONFIRMED | AI_AGENT    | no        | web     | —          |
 * | T2     | RESOLVED       | CUSTOMER_INACTIVE  | AI_AGENT    | no        | web     | —          |
 * | T3     | RESOLVED       | CUSTOMER_INACTIVE  | AI_AGENT    | no        | wa      | —          |
 * | T4     | RESOLVED       | HUMAN_RESOLVED     | agent       | yes       | web     | agent      |
 * | T5     | ESCALATED      | —                  | —           | yes       | web     | —          |
 * | T6     | ESCALATED      | —                  | —           | yes       | wa      | —          |
 * | T7     | HUMAN_HANDLING | —                  | —           | yes       | web     | agent      |
 * | T8     | HUMAN_HANDLING | —                  | —           | yes       | web     | agent      |
 * | T9     | HUMAN_HANDLING | —                  | —           | yes       | wa      | otherAgent |
 * | T10    | AI_HANDLING    | —                  | —           | no        | web     | —          |
 * | T11    | RESOLVED       | CUSTOMER_CONFIRMED | AI_AGENT    | no        | web     | —          | soft-deleted
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
  type TicketSeed = {
    key: string;
    status: "AI_HANDLING" | "ESCALATED" | "HUMAN_HANDLING" | "RESOLVED";
    resolutionReason?: "CUSTOMER_CONFIRMED" | "CUSTOMER_INACTIVE" | "HUMAN_RESOLVED";
    resolvedBy?: string;
    escalatedAt?: Date;
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
      channelId: webChannel.id,
      customerIdentityId: identity.id,
      assignedHumanAgentId: agent.id,
    },
    {
      key: "t8",
      status: "HUMAN_HANDLING",
      escalatedAt: escalated,
      channelId: webChannel.id,
      customerIdentityId: identity.id,
      assignedHumanAgentId: agent.id,
    },
    {
      key: "t9",
      status: "HUMAN_HANDLING",
      escalatedAt: escalated,
      channelId: waChannel.id,
      customerIdentityId: waIdentity.id,
      assignedHumanAgentId: otherAgent.id,
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
    })),
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

function requestOverview() {
  return app.request("/analytics/overview", {
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
    humanEscalation: { count: number; rate: number | null };
    statusCounts: { status: string; count: number }[];
    channelCounts: {
      channelId: string;
      channelName: string;
      channelType: string;
      ticketCount: number;
    }[];
    activeTicketsPerHumanAgent: {
      humanAgentId: string;
      humanAgentName: string;
      activeTicketCount: number;
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

    expect(body.analytics.totalTickets).toBe(10);
    expect(body.analytics.aiResolution.customerConfirmed.count).toBe(1);
    expect(body.analytics.aiResolution.customerConfirmed.rate).toBeCloseTo(0.1);
    expect(body.analytics.aiResolution.customerInactive.count).toBe(2);
    expect(body.analytics.aiResolution.customerInactive.rate).toBeCloseTo(0.2);
    expect(body.analytics.humanEscalation.count).toBe(6);
    expect(body.analytics.humanEscalation.rate).toBeCloseTo(0.6);

    expect(body.analytics.statusCounts).toEqual([
      { status: "AI_HANDLING", count: 1 },
      { status: "ESCALATED", count: 2 },
      { status: "HUMAN_HANDLING", count: 3 },
      { status: "RESOLVED", count: 4 },
    ]);

    const channelCounts = [...body.analytics.channelCounts].sort((a, b) =>
      a.channelName.localeCompare(b.channelName),
    );
    expect(channelCounts).toEqual([
      {
        channelId: `channel-web-${seeded.run}`,
        channelName: "Web Widget",
        channelType: "WEB",
        ticketCount: 7,
      },
      {
        channelId: `channel-wa-${seeded.run}`,
        channelName: "WhatsApp",
        channelType: "WHATSAPP",
        ticketCount: 3,
      },
    ]);

    const agentLoads = [...body.analytics.activeTicketsPerHumanAgent].sort((a, b) =>
      a.humanAgentName.localeCompare(b.humanAgentName),
    );
    expect(agentLoads).toEqual([
      { humanAgentId: `agent-${seeded.run}`, humanAgentName: "Dana Solusi", activeTicketCount: 2 },
      {
        humanAgentId: `other-agent-${seeded.run}`,
        humanAgentName: "Rian Tugas",
        activeTicketCount: 1,
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
    expect(body.analytics.activeTicketsPerHumanAgent).toEqual([]);
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
 * Hand-counted fixture, timestamps relative to the current UTC hour so the
 * trailing 7x24 window always covers them the same way regardless of when
 * the suite runs:
 *
 * | Ticket          | createdAt          | resolvedAt   | deletedAt | Workspace |
 * | recent-a        | current hour       | —            | —         | main      |
 * | recent-b        | current hour + 5m  | current hour | —         | main      |
 * | oldest-in-window| oldest bucket      | —            | —         | main      |
 * | before-window   | 1h before oldest   | —            | —         | main      | excluded (outside window)
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
  const oldestBucketStart = hoursBefore(currentHourStart, 167);

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

function requestTraffic() {
  return app.request("/analytics/traffic", {
    headers: { cookie: "better-auth.session_token=unused" },
  });
}

type TrafficResponse = {
  analytics: {
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

  it("buckets Tickets into hourly traffic and resolutions across the trailing 7x24 window", async () => {
    getSession.mockResolvedValue(sessionFor(trafficSeed.admin));

    const response = await requestTraffic();

    expect(response.status).toBe(200);
    const body = (await response.json()) as TrafficResponse;

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
    expect(body.analytics.traffic[167].count).toBe(2);
    expect(body.analytics.resolutions[167].count).toBe(1);
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
