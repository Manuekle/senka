import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  documents: new Map<string, unknown>(),
  writes: 0,
  reads: 0,
  queue: Promise.resolve() as Promise<unknown>,
}));

vi.mock("eve/hooks", () => ({ defineHook: (hook: unknown) => hook }));
// Workspace lifecycle is covered independently; these tests isolate transcript writes.
vi.mock("../../agent/lib/workspace", () => ({ bindSessionWorkspace: vi.fn() }));
vi.mock("@/lib/business-scope", () => ({
  scopedDocumentId: async (id: string) => id,
  scopedFile: async (file: string) => file,
}));
vi.mock("@/lib/doc-store", () => ({
  hasDocument: async () => true,
  migrateFromFileStore: vi.fn(),
  readDocument: async (id: string) => {
    db.reads++;
    return structuredClone(db.documents.get(id) ?? null);
  },
  updateDocument: (id: string, load: (raw: unknown) => unknown, mutate: (store: unknown) => unknown) => {
    const run = db.queue.then(() => {
      db.writes++;
      const store = load(structuredClone(db.documents.get(id) ?? null));
      const result = mutate(store);
      db.documents.set(id, structuredClone(store));
      return result;
    });
    db.queue = run.catch(() => {});
    return run;
  },
}));

const store = await import("@/lib/business-store");
const hook = (await import("../../agent/hooks/persist")).default as unknown as {
  events: Record<string, (event: unknown, ctx: unknown) => Promise<void>>;
};

const context = (channel = "web", sessionId = "session-1", principalId = "owner") => ({
  session: { id: sessionId, auth: { current: { principalId } } },
  channel: { kind: `channel:${channel}` },
});
const message = (text: string) => ({ data: { message: text } });

beforeEach(() => {
  vi.stubEnv("WORKFLOW_POSTGRES_URL", "postgres://test");
  db.documents.clear();
  db.writes = 0;
  db.reads = 0;
  db.queue = Promise.resolve();
});
afterEach(() => vi.unstubAllEnvs());

describe("agent persistence", () => {
  it("starts a session with one atomic write", async () => {
    await hook.events["session.started"]({}, context());
    expect(db.writes).toBe(1);
    expect(await store.listChats()).toMatchObject([{ sessionId: "session-1", title: "", messageCount: 0 }]);
    expect(await store.getContactBySession("session-1")).toBeDefined();
  });

  it("does not lose message counts when events overlap", async () => {
    await hook.events["session.started"]({}, context());
    await Promise.all([
      hook.events["message.received"](message("First question"), context()),
      hook.events["message.received"](message("Second question"), context()),
    ]);
    expect(await store.listChats()).toMatchObject([{ title: "First question", messageCount: 2 }]);
  });

  it("writes the customer summary, contact and full transcript together", async () => {
    const ctx = context("whatsapp", "session-1", "+541112345678");
    await hook.events["session.started"]({}, ctx);
    await hook.events["message.received"](message("¿Cuánto cuesta?"), ctx);
    const contact = await store.getContactBySession("session-1");
    await store.upsertContact({ id: contact!.id, name: "Ana", status: "waiting_human" });
    db.writes = 0;
    db.reads = 0;
    const reply = "Respuesta completa. ".repeat(30);
    await hook.events["message.completed"](message(reply), ctx);
    expect({ writes: db.writes, reads: db.reads }).toEqual({ writes: 1, reads: 0 });
    expect(await store.listChats()).toMatchObject([{
      title: "Ana", messageCount: 2, lastMessage: reply.slice(0, 240), handoff: true,
    }]);
    expect(await store.listChannelConversations()).toMatchObject([{
      contactId: contact!.id, title: "Ana", turns: [
        { role: "user", content: "¿Cuánto cuesta?" },
        { role: "assistant", content: reply.trim() },
      ],
    }]);
  });

  it("keeps web titles and excludes console turns from customer transcripts", async () => {
    await hook.events["session.started"]({}, context());
    await hook.events["message.received"](message("  Analyze\n my business  "), context());
    await hook.events["message.completed"](message("Analysis"), context());
    await hook.events["message.received"](message("New topic"), context());
    expect(await store.listChats()).toMatchObject([{ title: "Analyze my business", messageCount: 3 }]);
    expect(await store.listChannelConversations()).toEqual([]);
  });

  it("does not reset history when session initialization is replayed", async () => {
    await hook.events["session.started"]({}, context());
    await hook.events["message.received"](message("Original title"), context());
    await hook.events["message.completed"](message("Original answer"), context());
    await hook.events["session.started"]({}, context());
    expect(await store.listChats()).toMatchObject([{
      title: "Original title", messageCount: 2, lastMessage: "Original answer",
    }]);
  });

  it("preserves Instagram identity and existing contact status", async () => {
    const contact = await store.upsertContact({ externalId: "ig-1", name: "Ana", status: "waiting_human" });
    const ctx = context("instagram", "ig-session", "ig-1");
    await hook.events["session.started"]({}, ctx);
    await hook.events["message.received"](message("Hola"), ctx);
    expect(await store.listContacts()).toMatchObject([{
      id: contact.id, externalId: "ig-1", name: "Ana", status: "waiting_human", sessionId: "ig-session",
    }]);
    expect(await store.listChats()).toMatchObject([{ title: "Ana", channel: "instagram" }]);
  });
});
