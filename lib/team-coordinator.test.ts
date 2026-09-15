import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyTeam, type TeamState } from "./team-types";
import type { Agent, Contact } from "./types";
import { captureTeamChanges, teamSnapshot } from "./team-changes";
import { withWorkspace, currentWorkspace } from "./workspace-context";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(), meter: vi.fn(), update: vi.fn(), gate: vi.fn(),
}));
vi.mock("ai", async (original) => ({ ...await original<typeof import("ai")>(), generateObject: mocks.generate }));
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

const { applyTeamActions } = await import("./team-coordinator");
const { isAutoTeam, syncAutoTeam } = await import("./team-types");
type Records = Parameters<typeof applyTeamActions>[0];

function records(): Records {
  return {
    contacts: [
      { id: "c", name: "Ana", status: "open", attributes: {}, notes: "" },
      { id: "x", name: "Outside", status: "open", attributes: {} },
    ] as unknown as Records["contacts"],
    deals: [
      { id: "d", contactId: "c", title: "Plan anual", stage: "lead", value: 1, currency: "USD", createdAt: "", updatedAt: "" },
    ] as unknown as Records["deals"],
  };
}

describe("team actions", () => {
  it("applies changes to the round's records and reports each outcome", () => {
    const team = ready();
    const recs = records();
    const actions = applyTeamActions(recs, team.events[0], "Ventas", [
      { type: "contact_status", targetId: "c", key: "", value: "followup_due" },
      { type: "deal_stage", targetId: "d", key: "", value: "proposal" },
      { type: "contact_note", targetId: "c", key: "", value: "Pidió precio" },
      { type: "contact_attribute", targetId: "c", key: "empresa", value: "Norte" },
    ], Date.UTC(2026, 8, 14));
    expect(actions.map((a) => a.status)).toEqual(["done", "done", "done"]);
    expect(actions[0]).toMatchObject({ targetName: "Ana", previous: "open" });
    expect(recs.contacts[0]).toMatchObject({ status: "followup_due", notes: "[2026-09-14 · Ventas] Pidió precio", attributes: {} });
    expect(recs.deals[0].stage).toBe("proposal");
  });
  it("refuses records outside the round, closing states and no-ops without writing", () => {
    const team = ready();
    const recs = records();
    const before = structuredClone(recs);
    const actions = applyTeamActions(recs, team.events[0], "Ventas", [
      { type: "contact_status", targetId: "x", key: "", value: "waiting_human" },
      { type: "deal_stage", targetId: "d", key: "", value: "won" },
      { type: "contact_status", targetId: "c", key: "", value: "open" },
    ]);
    expect(actions.map((a) => [a.status, a.reason])).toEqual([["skipped", "not_in_round"], ["skipped", "invalid"], ["skipped", "unchanged"]]);
    expect(recs).toEqual(before);
  });
  it("records actions on the message without starting a round about them", () => {
    const team = ready();
    const recs = records();
    const claim = claimTeamTurn(team, agents, 1000, recs)!;
    expect(claim.records.contacts.map((c) => c.id)).toEqual(["c"]);
    expect(claim.records.deals.map((d) => d.id)).toEqual(["d"]);
    finishTeamTurn(team, claim, { message: "Movida", memory: "", actions: [{ type: "deal_stage", targetId: "d", key: "", value: "meeting" }] }, 1001, recs);
    expect(team.events[0].messages[0].actions).toEqual([expect.objectContaining({ status: "done", targetName: "Plan anual", previous: "lead" })]);
    expect(recs.deals[0].stage).toBe("meeting");
    expect(team.events).toHaveLength(1);
  });
  it("lets a worker that lost its lease neither speak nor act", () => {
    const team = ready();
    const recs = records();
    const old = claimTeamTurn(team, agents, 1000, recs)!;
    claimTeamTurn(team, agents, 122000, recs);
    const stale = { message: "Tarde", memory: "", actions: [{ type: "contact_status" as const, targetId: "c", key: "", value: "waiting_human" }] };
    expect(finishTeamTurn(team, old, stale, 122001, recs)).toBe(false);
    expect(recs.contacts[0].status).toBe("open");
  });
});

describe("automatic team", () => {
  const roster = (ids: string[]): Agent[] => ids.map((id) => ({ ...agents[0], id, name: id }));
  it("switches itself on once two agents are active and follows the roster", () => {
    const team = emptyTeam();
    expect(isAutoTeam(team)).toBe(true);
    expect(syncAutoTeam(team, roster(["a"]))).toBe(true);
    expect(team).toMatchObject({ mode: "auto", enabled: false, agentIds: ["a"] });
    expect(syncAutoTeam(team, roster(["a", "b"]))).toBe(true);
    expect(team.enabled).toBe(true);
    expect(syncAutoTeam(team, roster(["a", "b"]))).toBe(false);
  });
  it("leaves a team its owner configured or paused alone", () => {
    const configured = ready();
    expect(isAutoTeam(configured)).toBe(false);
    expect(syncAutoTeam(configured, roster(["a", "b", "c"]))).toBe(false);
    const paused = { ...emptyTeam(), mode: "manual" as const };
    expect(syncAutoTeam(paused, roster(["a", "b"]))).toBe(false);
    expect(paused.enabled).toBe(false);
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
  it("records tokens spent on invalid structured output before retrying", async () => {
    const { NoObjectGeneratedError } = await import("ai");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.generate.mockRejectedValue(new NoObjectGeneratedError({
      response: { id: "fixture", timestamp: new Date(), modelId: "fixture" },
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 } as import("ai").LanguageModelUsage,
      finishReason: "stop",
    }));
    await processTeam("b-one");
    expect(mocks.meter).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "b-one", inputTokens: 100, outputTokens: 20 }));
    expect(team.events[0].messages).toHaveLength(0);
    expect(team.events[0].error).toBe("generation_failed");
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
