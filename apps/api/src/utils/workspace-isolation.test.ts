import { describe, expect, it, vi } from "vitest";
import { withWorkspaceContext } from "./workspace-context";
import { MissingWorkspaceContextError } from "./workspace-context";
import { executeWorkspaceQuery, isWorkspaceScopedModel } from "./workspace-isolation";

describe("Workspace-isolated Prisma queries", () => {
  it.each(["ticket", "message", "knowledgeSource", "customerIdentity"])(
    "treats %s records as Workspace-scoped",
    (model) => {
      expect(isWorkspaceScopedModel(model)).toBe(true);
    },
  );

  it.each(["ticket", "message", "knowledgeSource", "customerIdentity"])(
    "returns none of Workspace B's %s records to a Workspace A request",
    (model) => {
      const records = [{ id: "workspace-b-record", workspaceId: "workspace-b" }];
      const query = withWorkspaceContext("workspace-a", () =>
        executeWorkspaceQuery({
          args: { where: { workspaceId: "workspace-b" } },
          model,
          operation: "findMany",
          query: ({ where }) =>
            records.filter((record) => record.workspaceId === where?.workspaceId),
        }),
      );

      expect(query).toEqual([]);
    },
  );

  it("writes records to the active Workspace", () => {
    const query = withWorkspaceContext("workspace-a", () =>
      executeWorkspaceQuery({
        args: { data: { title: "Need help", workspaceId: "workspace-b" } },
        model: "ticket",
        operation: "create",
        query: ({ data }) => data,
      }),
    );

    expect(query).toEqual({ title: "Need help", workspaceId: "workspace-a" });
  });

  it("throws before a scoped query can run without request context", () => {
    const query = vi.fn();

    expect(() =>
      executeWorkspaceQuery({ args: {}, model: "ticket", operation: "findMany", query }),
    ).toThrow(MissingWorkspaceContextError);
    expect(query).not.toHaveBeenCalled();
  });
});
