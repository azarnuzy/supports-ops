import { describe, expect, it, vi } from "vitest";
import { requireWorkspaceId } from "../../utils/workspace-context";
import { executeWorkspaceQuery } from "../../utils/workspace-isolation";
import { loadWorkspaceContext } from "./middleware";

describe("loadWorkspaceContext", () => {
  it("filters another Workspace's records when context comes from the authenticated user", async () => {
    const get = vi.fn((key: string) =>
      key === "user" ? { workspaceId: "workspace-user" } : null,
    );

    await loadWorkspaceContext({ get } as never, async () => {
      expect(requireWorkspaceId()).toBe("workspace-user");

      for (const model of ["ticket", "message", "knowledgeSource", "customerIdentity"]) {
        const records = [{ id: "workspace-other-record", workspaceId: "workspace-other" }];
        const visibleRecords = executeWorkspaceQuery({
          args: { where: { workspaceId: "workspace-other" } },
          model,
          operation: "findMany",
          query: ({ where }) => records.filter((record) => record.workspaceId === where?.workspaceId),
        });

        expect(visibleRecords).toEqual([]);
      }
    });
  });

  it("uses the Workspace of a resolved Web Session", async () => {
    const get = vi.fn((key: string) =>
      key === "webSession" ? { workspaceId: "workspace-session" } : null,
    );

    await loadWorkspaceContext({ get } as never, async () => {
      expect(requireWorkspaceId()).toBe("workspace-session");
    });
  });
});
