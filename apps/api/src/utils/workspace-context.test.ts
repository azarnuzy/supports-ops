import { describe, expect, it } from "vitest";
import {
  MissingWorkspaceContextError,
  requireWorkspaceId,
  withWorkspaceContext,
} from "./workspace-context";

describe("Workspace request context", () => {
  it("makes the active Workspace available for the work it wraps", async () => {
    await expect(
      withWorkspaceContext("workspace-a", async () => requireWorkspaceId()),
    ).resolves.toBe("workspace-a");
  });

  it("fails closed when no Workspace context is active", () => {
    expect(() => requireWorkspaceId()).toThrow(MissingWorkspaceContextError);
  });
});
