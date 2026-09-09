import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../app";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  subscribeToTicketQueueEvents: vi.fn(),
}));

vi.mock("../../modules/auth/instance", () => ({
  auth: {
    api: {
      getSession: mocks.getSession,
      signInEmail: vi.fn(),
    },
    handler: vi.fn(),
  },
}));

vi.mock("../../modules/widget/realtime", () => ({
  publishWidgetEvent: vi.fn(),
  publishTicketQueueEvent: vi.fn(),
  publishKnowledgeSourceEvent: vi.fn(),
  subscribeToWidgetEvents: vi.fn(),
  subscribeToTicketQueueEvents: mocks.subscribeToTicketQueueEvents,
  isTicketGenerating: vi.fn(),
  setTicketGenerating: vi.fn(),
}));

vi.mock("../../utils/prisma", () => ({
  prisma: new Proxy({}, { get: () => ({ findFirst: vi.fn(), findUnique: vi.fn() }) }),
}));

const sessionUser = {
  email: "agent@demo.supportops.dev",
  id: "user-1",
  name: "Rian Wibowo",
  role: "HUMAN_AGENT",
  workspaceId: "ws-1",
};

describe("GET /tickets/queue/events", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.subscribeToTicketQueueEvents.mockReset();
    mocks.getSession.mockResolvedValue({ session: { id: "session-1" }, user: sessionUser });
    mocks.subscribeToTicketQueueEvents.mockResolvedValue(() => undefined);
  });

  // Regression: this route used to be registered after GET /:id/events, so
  // Hono matched "queue" as a ticket id and answered 404 ticket_not_found —
  // the dashboard queue then never received live updates.
  it("streams the Shared Human Queue SSE for an authenticated workspace user", async () => {
    const res = await app.request("/tickets/queue/events");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });

  it("requires a signed-in workspace user", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await app.request("/tickets/queue/events");

    expect(res.status).toBe(401);
  });
});
