import { describe, expect, it, vi } from "vitest";
import { withWorkspaceContext } from "./workspace-context";
import { MissingWorkspaceContextError } from "./workspace-context";
import { executeWorkspaceQuery, isWorkspaceScopedModel } from "./workspace-isolation";

describe("Workspace-isolated Prisma queries", () => {
  it.each(["Ticket", "Message", "KnowledgeSource", "CustomerIdentity", "Tool", "ToolPolicy"])(
    "treats %s records as Workspace-scoped",
    (model) => {
      expect(isWorkspaceScopedModel(model)).toBe(true);
    },
  );

  it("does not match the camelCase client delegate name Prisma never passes", () => {
    // Prisma's query extension passes the schema's PascalCase model name
    // ("Ticket"), never the camelCase client delegate ("ticket"). A Set keyed
    // by the wrong casing silently scopes nothing.
    expect(isWorkspaceScopedModel("ticket")).toBe(false);
  });

  it.each(["Ticket", "Message", "KnowledgeSource", "CustomerIdentity", "Tool", "ToolPolicy"])(
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
        model: "Ticket",
        operation: "create",
        query: ({ data }) => data,
      }),
    );

    expect(query).toEqual({ title: "Need help", workspaceId: "workspace-a" });
  });

  it("throws before a scoped query can run without request context", () => {
    const query = vi.fn();

    expect(() =>
      executeWorkspaceQuery({ args: {}, model: "Ticket", operation: "findMany", query }),
    ).toThrow(MissingWorkspaceContextError);
    expect(query).not.toHaveBeenCalled();
  });
});
