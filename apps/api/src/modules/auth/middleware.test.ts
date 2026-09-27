import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireWorkspaceId } from "../../utils/workspace-context";
import { executeWorkspaceQuery } from "../../utils/workspace-isolation";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("../../utils/prisma", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/prisma")>()),
  unscopedPrisma: { workspace: { findUnique: mocks.findUnique } },
}));

const { loadWorkspaceContext } = await import("./middleware");

function fakeContext({
  header,
  user,
}: {
  header?: string;
  user: { isOrganizationAdmin?: boolean; organizationId?: string; workspaceId: string } | null;
}) {
  const json = vi.fn((body: unknown, status: number) => ({ body, status }));
  let currentUser = user;
  return {
    get: (key: string) => (key === "user" ? currentUser : null),
    json,
    req: { header: (name: string) => (name === "x-workspace-id" ? header : undefined) },
    set: (key: string, value: typeof user) => {
      if (key === "user") currentUser = value;
    },
  } as never;
}

describe("loadWorkspaceContext", () => {
  it("filters another Workspace's records when context comes from the authenticated user", async () => {
    const get = vi.fn((key: string) => (key === "user" ? { workspaceId: "workspace-user" } : null));

    await loadWorkspaceContext({ get } as never, async () => {
      expect(requireWorkspaceId()).toBe("workspace-user");

      for (const model of ["Ticket", "Message", "KnowledgeSource", "CustomerIdentity"]) {
        const records = [{ id: "workspace-other-record", workspaceId: "workspace-other" }];
        const visibleRecords = executeWorkspaceQuery({
          args: { where: { workspaceId: "workspace-other" } },
          model,
          operation: "findMany",
          query: ({ where }) =>
            records.filter((record) => record.workspaceId === where?.workspaceId),
        });

        expect(visibleRecords).toEqual([]);
      }
    });
  });

  it("uses the Workspace of a resolved Session", async () => {
    const get = vi.fn((key: string) =>
      key === "session" ? { workspaceId: "workspace-session" } : null,
    );

    await loadWorkspaceContext({ get } as never, async () => {
      expect(requireWorkspaceId()).toBe("workspace-session");
    });
  });

  beforeEach(() => {
    mocks.findUnique.mockReset();
  });

  it("switches an Organization Admin into a sibling Workspace of the same Organization", async () => {
    mocks.findUnique.mockResolvedValue({ deletedAt: null, organizationId: "org-1" });
    const c = fakeContext({
      header: "workspace-sibling",
      user: { isOrganizationAdmin: true, organizationId: "org-1", workspaceId: "workspace-home" },
    });

    await loadWorkspaceContext(c, async () => {
      expect(requireWorkspaceId()).toBe("workspace-sibling");
      expect((c as { get: (key: string) => unknown }).get("user")).toMatchObject({
        role: "ADMIN",
        workspaceId: "workspace-sibling",
      });
    });
  });

  it("rejects a switch requested by a user who is not an Organization Admin", async () => {
    const c = fakeContext({
      header: "workspace-sibling",
      user: { isOrganizationAdmin: false, organizationId: "org-1", workspaceId: "workspace-home" },
    });

    const result = await loadWorkspaceContext(c, async () => {
      throw new Error("must not run the handler");
    });

    expect(result).toEqual({ body: { error: "forbidden" }, status: 403 });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a guessed or cross-Organization Workspace id", async () => {
    mocks.findUnique.mockResolvedValue({ deletedAt: null, organizationId: "org-other" });
    const c = fakeContext({
      header: "workspace-guessed",
      user: { isOrganizationAdmin: true, organizationId: "org-1", workspaceId: "workspace-home" },
    });

    const result = await loadWorkspaceContext(c, async () => {
      throw new Error("must not run the handler");
    });

    expect(result).toEqual({ body: { error: "forbidden" }, status: 403 });
  });
});
