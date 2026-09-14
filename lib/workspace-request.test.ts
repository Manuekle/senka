import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentWorkspace } from "./workspace-context";

const registry = vi.hoisted(() => ({ active: "default" }));
vi.mock("./business-scope", () => ({
  activeBusinessId: async () => registry.active,
  listBusinesses: async () => ({ businesses: [{ id: "default" }, { id: "b-a" }, { id: "b-b" }, { id: "b-closed", access: "suspended" }] }),
}));
const { runWorkspaceRequest } = await import("./workspace-request");
beforeEach(() => { registry.active = "default"; });

const request = (id: string, path = "/api/contacts") => new Request(`https://app.example.test${path}`, { headers: { cookie: `senka-workspace=${id}` } });

describe("workspace request routing", () => {
  it("pins two browsers independently, including asynchronous work after a switch", async () => {
    const result = await Promise.all(["b-a", "b-b"].map((id) => runWorkspaceRequest(request(id), async () => {
      registry.active = "b-b";
      await Promise.resolve();
      return currentWorkspace();
    })));
    expect(result).toEqual(["b-a", "b-b"]);
  });
  it("refuses missing or suspended workspaces before any business code runs", async () => {
    const handler = vi.fn();
    const denied = await runWorkspaceRequest(request("b-closed"), handler);
    expect((denied as Response).status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
    expect((await runWorkspaceRequest(request("b-missing"), handler) as Response).status).toBe(403);
  });
  it("keeps billing reachable for payment recovery", async () => {
    expect(await runWorkspaceRequest(request("b-closed", "/api/billing/workspaces"), async () => currentWorkspace())).toBe("default");
  });
  it("never uses a callback's cookie to route an external event", async () => {
    expect(await runWorkspaceRequest(request("b-a", "/api/webhooks/stripe"), async () => currentWorkspace())).toBe("default");
  });
});
