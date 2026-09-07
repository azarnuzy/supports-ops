import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "./app";

const mocks = vi.hoisted(() => ({
  authHandler: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  getSession: vi.fn(),
  registerAdminWorkspace: vi.fn(),
  signInEmail: vi.fn(),
  update: vi.fn(),
}));

vi.mock("./modules/auth/instance", () => ({
  auth: {
    api: {
      getSession: mocks.getSession,
      signInEmail: mocks.signInEmail,
    },
    handler: mocks.authHandler,
  },
}));

vi.mock("./modules/registration/services", async () => {
  const actual = await vi.importActual<typeof import("./modules/registration/services")>(
    "./modules/registration/services",
  );

  return {
    ...actual,
    registerAdminWorkspace: mocks.registerAdminWorkspace,
  };
});

vi.mock("./utils/prisma", () => ({
  prisma: {
    user: {
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}));

const baseDate = new Date("2026-07-03T00:00:00.000Z");

describe("api app", () => {
  beforeEach(() => {
    mocks.authHandler.mockReset();
    mocks.findMany.mockReset();
    mocks.findUnique.mockReset();
    mocks.getSession.mockReset();
    mocks.registerAdminWorkspace.mockReset();
    mocks.signInEmail.mockReset();
    mocks.update.mockReset();

    mocks.authHandler.mockResolvedValue(new Response(null, { status: 404 }));
    mocks.findMany.mockResolvedValue([]);
    mocks.findUnique.mockResolvedValue(null);
    mocks.getSession.mockResolvedValue(null);
    mocks.signInEmail.mockResolvedValue(
      new Response(JSON.stringify({ token: "session-token", user: { id: "new-admin" } }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    mocks.update.mockImplementation(({ data, where }) =>
      Promise.resolve({
        createdAt: baseDate,
        email: `${where.id}@example.com`,
        emailVerified: true,
        id: where.id,
        image: data.image ?? "https://example.com/avatar.png",
        name: data.name,
        role: "HUMAN_AGENT",
        updatedAt: baseDate,
      }),
    );
  });

  it("returns health status", async () => {
    const response = await app.request("/health");

    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "api",
    });
    expect(response.status).toBe(200);
  });

  it("returns unauthorized when a session is missing", async () => {
    const response = await app.request("/session");

    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
    expect(response.status).toBe(401);
  });

  it("forbids users access without an admin session", async () => {
    const response = await app.request("/users");

    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
    expect(response.status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("validates users list limits", async () => {
    mocks.getSession.mockResolvedValue(createAuthSession("ADMIN"));

    const response = await app.request("/users?limit=0");

    expect(response.status).toBe(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("returns paginated users for admins", async () => {
    mocks.getSession.mockResolvedValue(createAuthSession("ADMIN"));
    mocks.findMany.mockResolvedValue([
      createUser({ id: "user-2", role: "HUMAN_AGENT" }),
      createUser({ id: "user-1", role: "ADMIN" }),
    ]);

    const response = await app.request("/users?limit=1");

    await expect(response.json()).resolves.toEqual({
      nextCursor: "user-2",
      users: [
        {
          createdAt: baseDate.toISOString(),
          email: "user-2@example.com",
          id: "user-2",
          name: "User user-2",
          role: "HUMAN_AGENT",
          updatedAt: baseDate.toISOString(),
        },
      ],
    });
    expect(response.status).toBe(200);

    const query = mocks.findMany.mock.calls[0]?.[0];
    expect(query.take).toBe(2);
    expect(query.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  });

  it("returns invalid_cursor for missing user cursors", async () => {
    mocks.getSession.mockResolvedValue(createAuthSession("ADMIN"));
    mocks.findUnique.mockResolvedValue(null);

    const response = await app.request("/users?cursor=missing");

    await expect(response.json()).resolves.toEqual({ error: "invalid_cursor" });
    expect(response.status).toBe(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("requires a session to update profile", async () => {
    const response = await app.request("/profile", {
      body: JSON.stringify({ name: "Updated User" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });

    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("updates the current user's profile", async () => {
    mocks.getSession.mockResolvedValue(createAuthSession("HUMAN_AGENT"));

    const response = await app.request("/profile", {
      body: JSON.stringify({
        image: "https://example.com/new-avatar.png",
        name: "  Updated User  ",
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });

    await expect(response.json()).resolves.toEqual({
      user: {
        createdAt: baseDate.toISOString(),
        email: "auth-user-id@example.com",
        emailVerified: true,
        id: "auth-user-id",
        image: "https://example.com/new-avatar.png",
        name: "Updated User",
        role: "HUMAN_AGENT",
        updatedAt: baseDate.toISOString(),
      },
    });
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      data: {
        image: "https://example.com/new-avatar.png",
        name: "Updated User",
      },
      select: {
        createdAt: true,
        email: true,
        emailVerified: true,
        id: true,
        image: true,
        name: true,
        role: true,
        updatedAt: true,
      },
      where: { id: "auth-user-id" },
    });
  });

  it("converts an empty profile image to null", async () => {
    mocks.getSession.mockResolvedValue(createAuthSession("HUMAN_AGENT"));

    const response = await app.request("/profile", {
      body: JSON.stringify({
        image: " ",
        name: "Updated User",
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });

    expect(response.status).toBe(200);
    expect(mocks.update.mock.calls[0]?.[0].data).toEqual({
      image: null,
      name: "Updated User",
    });
  });

  it("rejects invalid profile input", async () => {
    mocks.getSession.mockResolvedValue(createAuthSession("HUMAN_AGENT"));

    const response = await app.request("/profile", {
      body: JSON.stringify({
        image: "ftp://example.com/avatar.png",
        name: "",
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("ignores profile fields users are not allowed to change", async () => {
    mocks.getSession.mockResolvedValue(createAuthSession("HUMAN_AGENT"));

    const response = await app.request("/profile", {
      body: JSON.stringify({
        email: "takeover@example.com",
        image: null,
        name: "Updated User",
        role: "ADMIN",
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });

    expect(response.status).toBe(200);
    expect(mocks.update.mock.calls[0]?.[0].data).toEqual({
      image: null,
      name: "Updated User",
    });
  });

  it("registers a Workspace Admin and signs them in", async () => {
    mocks.registerAdminWorkspace.mockResolvedValue({
      user: { id: "new-admin", role: "ADMIN", workspaceId: "workspace-1" },
      workspace: { id: "workspace-1", name: "Ada's Workspace", slug: "ada-abc123" },
    });

    const response = await app.request("/register", {
      body: JSON.stringify({
        email: "ada@example.com",
        name: "Ada",
        password: "password123",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(mocks.registerAdminWorkspace).toHaveBeenCalledWith({
      email: "ada@example.com",
      name: "Ada",
      password: "password123",
    });
    expect(mocks.signInEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        asResponse: true,
        body: { email: "ada@example.com", password: "password123" },
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      token: "session-token",
      user: { id: "new-admin" },
    });
  });

  it("rejects registration with an email already in use", async () => {
    const { EmailAlreadyInUseError } = await import("./modules/registration/services");
    mocks.registerAdminWorkspace.mockRejectedValue(new EmailAlreadyInUseError());

    const response = await app.request("/register", {
      body: JSON.stringify({
        email: "ada@example.com",
        name: "Ada",
        password: "password123",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "email_in_use",
      message: "An account with this email already exists.",
    });
    expect(mocks.signInEmail).not.toHaveBeenCalled();
  });

  it("rejects registration with invalid input", async () => {
    const response = await app.request("/register", {
      body: JSON.stringify({
        email: "not-an-email",
        name: "",
        password: "short",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(mocks.registerAdminWorkspace).not.toHaveBeenCalled();
  });
});

function createAuthSession(role: "ADMIN" | "HUMAN_AGENT") {
  return {
    session: {
      createdAt: baseDate,
      expiresAt: baseDate,
      id: "session-id",
      token: "session-token",
      updatedAt: baseDate,
      userId: "auth-user-id",
    },
    user: {
      createdAt: baseDate,
      email: "admin@example.com",
      emailVerified: true,
      id: "auth-user-id",
      image: null,
      name: "Admin User",
      role,
      updatedAt: baseDate,
      workspaceId: "workspace-1",
    },
  };
}

function createUser({
  id,
  image = null,
  name = `User ${id}`,
  role,
}: {
  id: string;
  image?: string | null;
  name?: string;
  role: "ADMIN" | "HUMAN_AGENT";
}) {
  return {
    createdAt: baseDate,
    email: `${id}@example.com`,
    emailVerified: true,
    id,
    image,
    name,
    role,
    updatedAt: baseDate,
  };
}
