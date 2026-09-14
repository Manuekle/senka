import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";

// Opt-in integration suite. Never point this at an application database.
const databaseUrl = process.env.SENKA_TEST_DATABASE_URL;
const folder = vi.hoisted(() => `/tmp/senka-team-test-${process.pid}-${Date.now()}`);
vi.mock("node:os", async (original) => ({ ...await original<typeof import("node:os")>(), homedir: () => folder }));
vi.mock("ai", () => ({ generateObject: async () => ({ object: { message: "Cambio recibido", memory: "Contexto compartido" }, usage: { inputTokens: 10, outputTokens: 5 } }) }));
vi.mock("./ai-provider", () => ({ resolveProvider: () => "openai", resolveLanguageModel: () => "fixture" }));
vi.mock("./credentials", () => ({ warmCredentialCache: async () => undefined }));
vi.mock("./task-model", () => ({ modelIdForTask: async () => "fixture" }));
vi.mock("./credit-gate", () => ({ checkCreditGate: async () => ({ allowed: true }), billingSourceForProvider: async () => "BYOK" }));
vi.mock("./ai-usage", () => ({ recordUsage: async () => ({ recorded: true }) }));
vi.mock("./license/installation", () => ({ getInstallationId: async () => "integration-test" }));

describe.skipIf(!databaseUrl)("team with real PostgreSQL locks", () => {
  let store: typeof import("./business-store");
  let scope: typeof import("./business-scope");
  let context: typeof import("./workspace-context");
  let coordinator: typeof import("./team-coordinator");
  let first: string;
  let second: string;
  let ids: string[];
  beforeAll(async () => {
    if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_test")) throw new Error("Use an isolated _test database");
    vi.stubEnv("WORKFLOW_POSTGRES_URL", databaseUrl);
    [store, scope, context, coordinator] = await Promise.all([import("./business-store"), import("./business-scope"), import("./workspace-context"), import("./team-coordinator")]);
    first = (await scope.createBusiness("First integration workspace")).id;
    second = (await scope.createBusiness("Second integration workspace")).id;
    ids = await context.withWorkspace(first, async () => {
      const agents = await Promise.all(["Ventas", "Soporte"].map((name) => store.createAgent({ name, description: "", systemPrompt: "", tools: [] })));
      await store.updateTeamState((team) => { team.enabled = true; team.agentIds = agents.map((a) => a.id); });
      return agents.map((a) => a.id);
    });
  });
  afterAll(async () => {
    if (databaseUrl) await (await import("./postgres-pool")).sharedPool().end();
    vi.unstubAllEnvs();
    if (folder.startsWith(join(tmpdir(), "senka-team-test-")) || folder.startsWith("/tmp/senka-team-test-")) await rm(folder, { recursive: true, force: true });
  });
  it("captures concurrent mutations atomically without crossing business boundaries", async () => {
    await Promise.all(Array.from({ length: 12 }, (_, i) => context.withWorkspace(i % 2 === 0 ? first : second, () => store.upsertContact({ name: `Contact ${i}`, email: `contact${i}@example.test` }))));
    const a = await context.withWorkspace(first, store.listContacts);
    const b = await context.withWorkspace(second, store.listContacts);
    expect(a).toHaveLength(6); expect(b).toHaveLength(6);
    expect(a.every((c) => Number(c.name.split(" ")[1]) % 2 === 0)).toBe(true);
    const team = await context.withWorkspace(first, store.readTeamState);
    expect(team.events).toHaveLength(6);
    expect(await context.withWorkspace(second, store.readTeamState)).toMatchObject({ enabled: false, events: [] });
  });
  it("grants one lease when two workers claim at the same time", async () => {
    const claims = await Promise.all([1, 2].map(() => context.withWorkspace(first, () => store.updateTeamState((team, agents) => coordinator.claimTeamTurn(team, agents)))));
    expect(claims.filter(Boolean)).toHaveLength(1);
    const claim = claims.find(Boolean)!;
    expect(claim.agent.id).toBe(ids[0]);
    await context.withWorkspace(first, () => store.updateTeamState((team) => coordinator.finishTeamTurn(team, claim, { message: "Primera respuesta", memory: "Contacto nuevo" })));
  });
  it("continues a persisted round after the browser's workspace changes", async () => {
    await scope.setActiveBusiness(second);
    await coordinator.processTeam(first, 1);
    const team = await context.withWorkspace(first, store.readTeamState);
    expect(team.events[0].messages.map((message) => message.agentId)).toEqual(ids);
    expect(team.events[0].status).toBe("completed");
    expect((await context.withWorkspace(second, store.readTeamState)).events).toHaveLength(0);
  });
});
