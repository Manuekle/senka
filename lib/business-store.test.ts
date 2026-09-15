import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Setup: point store to a temp dir ──────────────────────────────

// Random suffix alongside the timestamp: two test files (this one and
// tests/agent/tools/propose_automation.test.ts) both derive their temp dir
// from Date.now(), and running in parallel vitest workers they can land on
// the same millisecond — same path, same underlying business.json, and one
// file's writes clobber the other's mid-test.
const TEST_DIR = join(tmpdir(), `senka-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

// We need to set HOME so the business-store reads from our test dir.
// business-store uses homedir() → ~/.senka/business.json.
// We mock homedir() to return our test dir.
import { vi } from "vitest";

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => TEST_DIR,
  };
});

// Must import AFTER mock
const {
  createAutomation,
  listAutomations,
  updateAutomation,
  deleteAutomation,
  upsertContact,
  importContacts,
  listContacts,
  getContactBySession,
  setContactStatus,
  deleteContact,
  upsertChat,
  listChats,
  deleteChat,
  toggleChatPin,
  channelFromKind,
  createAgent,
  updateAgent,
  getAgentByElevenLabsAgentId,
  startVoiceCall,
  recordVoiceCallTranscript,
  listVoiceCalls,
} = await import("./business-store");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

// ── The file itself ──────────────────────────────────────────────
//
// A corrupt store used to read as an empty one, so the app rendered a working
// account as brand new and the next write replaced the real file with that
// emptiness. The write is atomic, which is exactly what made it total: the
// data was destroyed by a clean write of the wrong thing.

describe("business-store: an unreadable file", () => {
  const storeFile = join(TEST_DIR, ".senka", "business.json");

  it("starts empty when there is no file at all", async () => {
    await expect(listContacts()).resolves.toEqual([]);
  });

  it("refuses to read a corrupt file as an empty account", async () => {
    await upsertContact({ name: "Marta", phone: "+5491100000", sessionId: "s-1", source: "web" });
    mkdirSync(join(TEST_DIR, ".senka"), { recursive: true });
    writeFileSync(storeFile, '{"contacts": [', "utf-8");

    await expect(listContacts()).rejects.toThrow(/no es JSON válido/);
  });

  // The salvage case Houston's json-salvage.ts exists for: a complete value
  // followed by trailing bytes. Senka writes atomically so it cannot produce
  // one itself, but an outside editor can — and it must still not silently
  // become an empty account.
  it("refuses a file with a valid prefix and trailing garbage", async () => {
    mkdirSync(join(TEST_DIR, ".senka"), { recursive: true });
    writeFileSync(storeFile, '{"contacts": []}{"contacts": [', "utf-8");

    await expect(listContacts()).rejects.toThrow(/no es JSON válido/);
  });
});

// ── Automations ──────────────────────────────────────────────────

describe("business-store: automations", () => {
  it("starts with empty list", async () => {
    const list = await listAutomations();
    expect(list).toEqual([]);
  });

  it("creates an automation", async () => {
    const list = await createAutomation({
      name: "Welcome",
      description: "Test",
      trigger: "new_chat",
      triggerValue: "",
      channel: "all",
      steps: [],
    });
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Welcome");
    expect(list[0].status).toBe("draft");
    expect(list[0].id).toMatch(/^auto-/);
  });

  it("updates an automation", async () => {
    const list = await createAutomation({
      name: "Test",
      description: "",
      trigger: "keyword",
      triggerValue: "hi",
      channel: "web",
    });
    const id = list[0].id;
    const updated = await updateAutomation(id, { name: "Updated", status: "active" });
    expect(updated.find((a) => a.id === id)?.name).toBe("Updated");
    expect(updated.find((a) => a.id === id)?.status).toBe("active");
  });

  it("deletes an automation", async () => {
    await createAutomation({ name: "To Delete", description: "", trigger: "keyword", triggerValue: "", channel: "all" });
    let list = await listAutomations();
    expect(list).toHaveLength(1);
    await deleteAutomation(list[0].id);
    list = await listAutomations();
    expect(list).toHaveLength(0);
  });
});

// ── Contacts ─────────────────────────────────────────────────────

describe("business-store: contacts", () => {
  it("starts with empty list", async () => {
    const list = await listContacts();
    expect(list).toEqual([]);
  });

  it("creates a contact", async () => {
    const contact = await upsertContact({
      name: "Juan",
      phone: "+54111234",
      channel: "whatsapp",
      source: "webhook",
    });
    expect(contact.name).toBe("Juan");
    expect(contact.phone).toBe("+54111234");
    expect(contact.id).toMatch(/^ct-/);
  });

  it("upserts by phone (no duplicate)", async () => {
    await upsertContact({ name: "Juan", phone: "+54111234", channel: "whatsapp" });
    await upsertContact({ name: "Juan Updated", phone: "+54111234", channel: "whatsapp" });
    const list = await listContacts();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Juan Updated");
  });

  it("upserts by sessionId", async () => {
    await upsertContact({ name: "A", sessionId: "sess-1", channel: "web" });
    await upsertContact({ name: "B", sessionId: "sess-1", channel: "web" });
    const list = await listContacts();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("B");
  });

  it("finds contact by session", async () => {
    await upsertContact({ name: "FindMe", sessionId: "sess-42", channel: "web" });
    const found = await getContactBySession("sess-42");
    expect(found?.name).toBe("FindMe");
  });

  it("sets contact status", async () => {
    const created = await upsertContact({ name: "Status", channel: "web" });
    await setContactStatus(created.id, "waiting_human");
    const list = await listContacts();
    expect(list[0].status).toBe("waiting_human");
  });

  it("deletes a contact", async () => {
    const created = await upsertContact({ name: "Delete Me", channel: "web" });
    await deleteContact(created.id);
    const list = await listContacts();
    expect(list).toHaveLength(0);
  });

  it("merges attributes on upsert", async () => {
    await upsertContact({ name: "Attr", phone: "+5499999", channel: "web", attributes: { a: "1" } });
    const updated = await upsertContact({ name: "Attr", phone: "+5499999", channel: "web", attributes: { b: "2" } });
    expect(updated.attributes).toEqual({ a: "1", b: "2" });
  });
});

// ── Chats ────────────────────────────────────────────────────────

describe("business-store: contact import", () => {
  it("creates in file order tagged csv, and updates existing contacts without re-attributing them", async () => {
    await upsertContact({ phone: "+5491155550101", name: "Ana", source: "whatsapp", channel: "whatsapp" });
    const result = await importContacts([
      { name: "Bruno", email: "bruno@x.com" },
      { name: "Ana Pérez", phone: "+5491155550101", attributes: { empresa: "Norte" } },
      { name: "Carla", phone: "+34600555103", status: "closed" },
    ]);
    expect(result).toEqual({ created: 2, updated: 1 });
    const contacts = await listContacts();
    expect(contacts.map((c) => c.name)).toEqual(["Bruno", "Carla", "Ana Pérez"]);
    const ana = contacts.find((c) => c.name === "Ana Pérez");
    expect(ana?.source).toBe("whatsapp");
    expect(ana?.attributes).toEqual({ empresa: "Norte" });
    expect(contacts.filter((c) => c.source === "csv").map((c) => c.name)).toEqual(["Bruno", "Carla"]);
  });
});

describe("business-store: chats", () => {
  it("starts with empty list", async () => {
    const list = await listChats();
    expect(list).toEqual([]);
  });

  it("creates a chat", async () => {
    const list = await upsertChat({
      title: "Test Chat",
      channel: "web",
      lastMessage: "Hello",
      lastMessageAt: new Date().toISOString(),
      messageCount: 1,
    });
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("Test Chat");
    expect(list[0].id).toMatch(/^conv-/);
  });

  it("upserts by sessionId (no duplicate)", async () => {
    await upsertChat({ title: "A", channel: "web", lastMessage: "", lastMessageAt: "", messageCount: 0, sessionId: "s1" });
    await upsertChat({ title: "B", channel: "web", lastMessage: "Hi", lastMessageAt: "", messageCount: 1, sessionId: "s1" });
    const list = await listChats();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("B");
    expect(list[0].lastMessage).toBe("Hi");
  });

  it("deletes a chat", async () => {
    const list = await upsertChat({ title: "Del", channel: "web", lastMessage: "", lastMessageAt: "", messageCount: 0 });
    await deleteChat(list[0].id);
    const chats = await listChats();
    expect(chats).toHaveLength(0);
  });

  // The browser store mints its own ids, so the id the UI holds for a chat that
  // exists in both stores is usually not the one this store minted. The session
  // id is the only key both sides share.
  it("deletes a chat by its session id", async () => {
    await upsertChat({ title: "Del", channel: "web", lastMessage: "", lastMessageAt: "", messageCount: 0, sessionId: "wrun_1" });
    await deleteChat("wrun_1");
    expect(await listChats()).toHaveLength(0);
  });

  it("pins a chat by its session id", async () => {
    await upsertChat({ title: "Pin", channel: "web", lastMessage: "", lastMessageAt: "", messageCount: 0, sessionId: "wrun_2" });
    const pinned = await toggleChatPin("wrun_2");
    expect(pinned[0].pinned).toBe(true);
  });

  it("toggles pin", async () => {
    const list = await upsertChat({ title: "Pin", channel: "web", lastMessage: "", lastMessageAt: "", messageCount: 0 });
    expect(list[0].pinned).toBeFalsy();
    const pinned = await toggleChatPin(list[0].id);
    expect(pinned[0].pinned).toBe(true);
    const unpinned = await toggleChatPin(list[0].id);
    expect(unpinned[0].pinned).toBe(false);
  });
});

// ── channelFromKind ──────────────────────────────────────────────

describe("channelFromKind", () => {
  // The shape the runtime actually produces: Eve reports an authored channel
  // as `channel:<file stem>`. The old tests only covered the bare names, which
  // is why every WhatsApp turn was filed as web chat without anyone noticing.
  it("maps channel:whatsapp", () => expect(channelFromKind("channel:whatsapp")).toBe("whatsapp"));
  it("maps channel:instagram", () =>
    expect(channelFromKind("channel:instagram")).toBe("instagram"));
  it("sends the web console's own channel to web", () =>
    expect(channelFromKind("channel:eve")).toBe("web"));
  it("maps whatsapp", () => expect(channelFromKind("whatsapp")).toBe("whatsapp"));
  it("defaults to web", () => expect(channelFromKind("web")).toBe("web"));
  it("defaults to web for unknown", () => expect(channelFromKind("carrier-pigeon")).toBe("web"));
  it("defaults to web for undefined", () => expect(channelFromKind(undefined)).toBe("web"));
});

// ── Voice calls ──────────────────────────────────────────────────

describe("business-store: voice calls", () => {
  async function makeVoiceAgent(elevenlabsAgentId: string) {
    const agent = await createAgent({
      name: "Vendedor",
      description: "",
      systemPrompt: "",
      tools: [],
    });
    return updateAgent(agent.id, { voice: { enabled: true, elevenlabsAgentId } });
  }

  it("looks an agent up by its ElevenLabs mirror id", async () => {
    const agent = await makeVoiceAgent("el-agent-1");
    expect(await getAgentByElevenLabsAgentId("el-agent-1")).toMatchObject({ id: agent!.id });
    expect(await getAgentByElevenLabsAgentId("no-such-mirror")).toBeUndefined();
  });

  it("a call this app placed keeps source 'test' once the transcript lands", async () => {
    const agent = await makeVoiceAgent("el-agent-2");
    await startVoiceCall({ agentId: agent!.id, conversationId: "conv-test-1", source: "test" });

    const filled = await recordVoiceCallTranscript({
      agentId: agent!.id,
      conversationId: "conv-test-1",
      transcript: [{ role: "user", message: "Hola", timeInCallSecs: 0 }],
      durationSecs: 12,
    });

    expect(filled.source).toBe("test");
    expect(filled.transcript).toEqual([{ role: "user", message: "Hola", timeInCallSecs: 0 }]);
    expect(filled.durationSecs).toBe(12);

    const [listed] = await listVoiceCalls(agent!.id);
    expect(listed).toMatchObject({ conversationId: "conv-test-1", source: "test" });
  });

  it("a call the webhook reports with no pending row defaults to 'real'", async () => {
    const agent = await makeVoiceAgent("el-agent-3");

    const created = await recordVoiceCallTranscript({
      agentId: agent!.id,
      conversationId: "conv-inbound-1",
      transcript: [{ role: "agent", message: "Hola, en qué te ayudo?", timeInCallSecs: 0 }],
    });

    expect(created.source).toBe("real");
  });

  it("registering the same conversation id twice does not duplicate the row", async () => {
    const agent = await makeVoiceAgent("el-agent-4");
    await startVoiceCall({ agentId: agent!.id, conversationId: "conv-dup", source: "test" });
    await startVoiceCall({ agentId: agent!.id, conversationId: "conv-dup", source: "test" });

    const calls = await listVoiceCalls(agent!.id);
    expect(calls).toHaveLength(1);
  });

  it("lists an agent's calls newest first and never another agent's calls", async () => {
    const agentA = await makeVoiceAgent("el-agent-5");
    const agentB = await makeVoiceAgent("el-agent-6");
    await startVoiceCall({ agentId: agentA!.id, conversationId: "conv-a1", source: "test" });
    await startVoiceCall({ agentId: agentB!.id, conversationId: "conv-b1", source: "real" });
    await startVoiceCall({ agentId: agentA!.id, conversationId: "conv-a2", source: "real" });

    const calls = await listVoiceCalls(agentA!.id);
    expect(calls.map((c) => c.conversationId)).toEqual(["conv-a2", "conv-a1"]);
  });
});
