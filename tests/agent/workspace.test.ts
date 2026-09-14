import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionContext } from "eve/context";

const state = vi.hoisted(() => ({ value: null as string | null, bindings: {} as Record<string, string>, suspended: false }));
vi.mock("eve/context", () => ({ defineState: () => ({ get: () => state.value, update: (fn: (id: string | null) => string) => { state.value = fn(state.value); } }) }));
vi.mock("../../lib/doc-store", () => ({ createDocumentStore: () => ({
  read: async () => ({ sessions: state.bindings }),
  update: async (fn: (store: { sessions: Record<string, string> }) => unknown) => fn({ sessions: state.bindings }),
}) }));
vi.mock("../../lib/business-scope", () => ({
  activeBusinessId: async () => "default",
  listBusinesses: async () => ({ businesses: [{ id: "default" }, { id: "b-a", access: state.suspended ? "suspended" : "active" }, { id: "b-b" }] }),
}));
const { bindSessionWorkspace } = await import("../../agent/lib/workspace");

const ctx = (id: string, workspaceId?: string, parent?: string) => ({ session: {
  id, auth: { initiator: { attributes: { workspaceId } } }, ...(parent ? { parent: { rootSessionId: parent } } : {}),
} }) as unknown as SessionContext;

beforeEach(() => { state.value = null; state.bindings = {}; state.suspended = false; });
describe("durable Eve workspace", () => {
  it("binds a session to the authenticated workspace and retains it when the browser switches", async () => {
    await bindSessionWorkspace(ctx("root", "b-a"));
    await bindSessionWorkspace(ctx("root", "b-b"));
    expect(state.value).toBe("b-a");
    expect(state.bindings.root).toBe("b-a");
  });
  it("restores a session binding after durable-state reinitialization", async () => {
    await bindSessionWorkspace(ctx("root", "b-a"));
    state.value = null;
    await bindSessionWorkspace(ctx("root", "b-b"));
    expect(state.value).toBe("b-a");
  });
  it("gives a child its parent's workspace even though child state starts empty", async () => {
    await bindSessionWorkspace(ctx("root", "b-a"));
    state.value = null;
    await bindSessionWorkspace(ctx("child", undefined, "root"));
    expect(state.value).toBe("b-a");
    expect(state.bindings.child).toBe("b-a");
  });
  it("refuses resumed work after access has been suspended", async () => {
    await bindSessionWorkspace(ctx("root", "b-a"));
    state.suspended = true;
    await expect(bindSessionWorkspace(ctx("root", "b-a"))).rejects.toThrow("Workspace access is unavailable");
  });
});
