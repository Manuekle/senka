import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyTeam, type TeamState } from "./team-types";
import type { Agent, Contact } from "./types";
import { captureTeamChanges, teamSnapshot } from "./team-changes";
import { withWorkspace, currentWorkspace } from "./workspace-context";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(), meter: vi.fn(), update: vi.fn(), gate: vi.fn(),
}));
vi.mock("ai", () => ({ generateObject: mocks.generate }));
vi.mock("./business-store", () => ({ updateTeamState: mocks.update, readTeamState: vi.fn() }));
vi.mock("./business-scope", () => ({ listBusinesses: async () => ({ businesses: [{ id: "b-one" }, { id: "b-two" }] }) }));
vi.mock("./credentials", () => ({ warmCredentialCache: vi.fn() }));
vi.mock("./ai-provider", () => ({ resolveProvider: () => "openai", resolveLanguageModel: () => "test-model" }));
vi.mock("./task-model", () => ({ modelIdForTask: () => "test-model" }));
vi.mock("./credit-gate", () => ({ checkCreditGate: mocks.gate, billingSourceForProvider: () => "BYOK" }));
vi.mock("./ai-usage", () => ({ recordUsage: mocks.meter }));
vi.mock("./license/installation", () => ({ getInstallationId: () => "test-install" }));

const { claimTeamTurn, finishTeamTurn, processTeam } = await import("./team-coordinator");
const agents: Agent[] = ["a", "b"].map((id) => ({ id, name: id, description: "", systemPrompt: "", tools: [], status: "active", createdAt: "" }));

function ready(): TeamState {
  const team = { ...emptyTeam(), enabled: true, agentIds: ["a", "b"] };
  captureTeamChanges(team, new Map(), { contacts: [{ id: "c", name: "Ana", status: "open" } as Contact], deals: [], agents: [] });
  return team;
}

describe("atomic business changes", () => {
  it("does not start a conversation for unchanged records or reordered rows", () => {
    const team = ready();
    const contacts = [{ id: "c", name: "Ana", status: "open" }, { id: "d", name: "Bob", status: "closed" }] as Contact[];
    const before = teamSnapshot({ contacts, deals: [], agents: [] });
    captureTeamChanges(team, before, { contacts: [...contacts].reverse(), deals: [], agents: [] });
    expect(team.events).toHaveLength(1);
  });
  it("captures the old and new state, including deletion", () => {
    const team = ready();
    const contacts = [{ id: "c", name: "Ana", status: "open" }] as Contact[];
    captureTeamChanges(team, teamSnapshot({ contacts, deals: [], agents: [] }), { contacts: [], deals: [], agents: [] });
    expect(team.events[1].changes[0]).toMatchObject({ id: "c", after: null });
    expect(team.events[1].changes[0].before).toContain("Ana");
  });
  it("does not accumulate changes while disabled", () => {
    const team = emptyTeam();
    captureTeamChanges(team, new Map(), { contacts: [], deals: [], agents });
    expect(team.events).toHaveLength(0);
  });
});

describe("worker coordination", () => {
  it("permits only one in-flight call per workspace", () => {
    const team = ready();
    const claim = claimTeamTurn(team, agents, 1000)!;
    expect(claim.agent.id).toBe("a");
    expect(claimTeamTurn(team, agents, 1001)).toBeNull();
    expect(team.calls).toBe(1);
  });
  it("resumes at the next agent with the prior reply and memory", () => {
    const team = ready();
    const first = claimTeamTurn(team, agents, 1000)!;
    finishTeamTurn(team, first, { message: "Ana changed", memory: "Ana is open" }, 1002);
    const next = claimTeamTurn(team, agents, 1003)!;
    expect(next.agent.id).toBe("b");
    expect(next.event.messages[0].text).toBe("Ana changed");
    expect(next.memory[0].text).toBe("Ana is open");
    finishTeamTurn(team, next, { message: "Received", memory: "" }, 1004);
    expect(team.events[0].status).toBe("completed");
    expect(claimTeamTurn(team, agents, 1005)).toBeNull();
  });
  it("rejects stale completions after a crashed worker's lease is reclaimed", () => {
    const team = ready();
    const old = claimTeamTurn(team, agents, 1000)!;
    const replacement = claimTeamTurn(team, agents, 122000)!;
    expect(replacement.token).not.toBe(old.token);
    expect(finishTeamTurn(team, old, { message: "Stale", memory: "" })).toBe(false);
    expect(team.events[0].messages).toHaveLength(0);
  });
  it("reserves a bounded daily budget and resets it on the next UTC day", () => {
    const team = ready(); team.dailyLimit = 1;
    const first = claimTeamTurn(team, agents, 1000)!;
    finishTeamTurn(team, first, { message: "done", memory: "" });
    expect(claimTeamTurn(team, agents, 2000)).toBeNull();
    expect(claimTeamTurn(team, agents, 86_400_001)?.agent.id).toBe("b");
  });
  it("allows a running reply to settle after pause but starts no new call", () => {
    const team = ready();
    const first = claimTeamTurn(team, agents)!;
    team.enabled = false;
    expect(finishTeamTurn(team, first, { message: "done", memory: "" })).toBe(true);
    expect(claimTeamTurn(team, agents)).toBeNull();
  });
  it("stops repeatedly abandoned calls after three reservations", () => {
    const team = ready();
    claimTeamTurn(team, agents, 1000);
    claimTeamTurn(team, agents, 122000);
    claimTeamTurn(team, agents, 244000);
    expect(claimTeamTurn(team, agents, 366000)).toBeNull();
    expect(team.events[0].status).toBe("failed");
    expect(team.calls).toBe(3);
  });
});

describe("provider integration", () => {
  let team: TeamState;
  beforeEach(() => {
    vi.clearAllMocks(); team = ready();
    mocks.update.mockImplementation(async (fn: (team: TeamState, agents: Agent[]) => unknown) => fn(team, agents));
    mocks.gate.mockResolvedValue({ allowed: true });
    mocks.generate.mockResolvedValue({ object: { message: "Shared update", memory: "Relevant change" }, usage: { inputTokens: 100, outputTokens: 20 } });
    mocks.meter.mockResolvedValue({ recorded: true });
  });
  it("runs without a browser and attributes each call to its workspace and agent", async () => {
    expect(await processTeam("b-one")).toBe(2);
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.generate.mock.calls[1][0].prompt).toContain("Shared update");
    expect(mocks.meter).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "b-one", agentId: "a" }));
    expect(team.events[0].status).toBe("completed");
  });
  it("does not call the provider when credits are exhausted", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.gate.mockResolvedValue({ allowed: false });
    await processTeam("b-one");
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(team.events[0].error).toBe("credits_exhausted");
    log.mockRestore();
  });
  it("keeps simultaneous async workspace chains separate", async () => {
    const observed = await Promise.all(["b-one", "b-two"].map((id) => withWorkspace(id, async () => {
      await Promise.resolve(); await new Promise((resolve) => setTimeout(resolve, 2));
      return currentWorkspace();
    })));
    expect(observed).toEqual(["b-one", "b-two"]);
    expect(currentWorkspace()).toBeUndefined();
  });
});
