import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type {
  Agent,
  AgentChatSession,
  AgentChatTurn,
  AgentStatus,
  ChannelConversation,
  Automation,
  ChannelId,
  ChatSummary,
  Contact,
  ContactStatus,
  Deal,
  Form,
  FormResponse,
  LeadInput,
  ProspectAssessment,
  Reminder,
  ReminderActivity,
  ReminderActivityType,
  ReminderStatus,
  VoiceCall,
  VoiceCallSource,
  VoiceCallStatus,
  VoiceCallTurn,
} from "./types";
import { moveContactTo } from "./contact-order";
import {
  hasDocument as dbHasDocument,
  migrateFromFileStore as dbMigrateFromFile,
  readDocument as dbReadDocument,
  updateDocument as dbUpdateDocument,
  type StoredDocumentId,
} from "./doc-store";
import { scopedDocumentId, scopedFile } from "./business-scope";
import { emptyTeam, type TeamState } from "./team-types";
import { captureTeamChanges, teamSnapshot } from "./team-changes";

// Shared by the Eve agent (tools/hooks/schedules) and Next.js API routes.
//
// Two backends, chosen once per process. With WORKFLOW_POSTGRES_URL set the
// store lives in Postgres (`senka.business_store`), which is what a deploy
// with no writable filesystem — Vercel, or any container with a read-only
// root — requires, and what lets more than one process write safely. Without
// it, ~/.senka/business.json, unchanged: a single-host install should not
// have to run a database to try the app.
//
// Same routing as lib/auth/store.ts, including the one-time migration: the
// first DB access on an install that already has a file imports it, and after
// that the database is the source of truth.

const STORE_FILE = join(homedir(), ".senka", "business.json");

/**
 * Which business's store this call is about.
 *
 * The first business keeps `business` and ~/.senka/business.json, so an
 * install that predates multi-business needs no migration; a second one gets
 * `business::<id>` and its own file under ~/.senka/businesses/<id>/. See
 * lib/business-scope.ts.
 */
async function target(): Promise<{ id: StoredDocumentId; file: string }> {
  return {
    id: (await scopedDocumentId("business")) as StoredDocumentId,
    file: await scopedFile(STORE_FILE),
  };
}

type BusinessStore = {
  team: TeamState;
  automations: Automation[];
  contacts: Contact[];
  deals: Deal[];
  chats: ChatSummary[];
  reminders: Reminder[];
  reminderActivity: ReminderActivity[];
  agents: Agent[];
  forms: Form[];
  formResponses: FormResponse[];
  voiceCalls: VoiceCall[];
  agentChats: AgentChatSession[];
  channelConversations: ChannelConversation[];
  /** Which agent answers each customer channel. See `getChannelAgentId`. */
  channelAgents?: Partial<Record<ChannelId, string>>;
};

function emptyStore(): BusinessStore {
  return {
    team: emptyTeam(),
    automations: [],
    contacts: [],
    deals: [],
    chats: [],
    reminders: [],
    reminderActivity: [],
    agents: [],
    forms: [],
    formResponses: [],
    voiceCalls: [],
    agentChats: [],
    channelConversations: [],
    channelAgents: {},
  };
}

// ── Backend selection (resolved once, lazily) ─────────────────────

let dbMode: boolean | null = null;
/** Scopes already considered for the file import. Per business, not per
 *  process: a second business starts with no row and no file, and must never
 *  import the first business's data as its own. */
const migrated = new Set<string>();

async function usingDb(where: { id: StoredDocumentId; file: string }): Promise<boolean> {
  if (!process.env.WORKFLOW_POSTGRES_URL) {
    dbMode = false;
    return false;
  }
  if (dbMode === true && migrated.has(where.id)) return true;

  try {
    if (!(await dbHasDocument(where.id))) {
      // Reachable but empty. An install that has been running on the file
      // store keeps its data; a fresh one just starts empty.
      const file = await readFileStore(where.file);
      if (file !== null) await dbMigrateFromFile(where.id, file);
    }
    dbMode = true;
    migrated.add(where.id);
  } catch {
    // Database unreachable — keep serving from the file rather than failing
    // every read. Retried on the next call, since dbMode stays unset.
    return false;
  }
  return true;
}

let writeQueue: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * The file's contents, or `null` when there is no file at all — which is what
 * tells the migration there is nothing to import.
 *
 * "No file" and "file I cannot read" have to stay separate, and this used to
 * catch both into `null`. That is a silent total-loss bug: a `business.json`
 * that fails to parse read as an empty store, the app rendered zero contacts
 * and zero deals as though the account were new, and the very next write
 * replaced the real file with that empty store. The write itself is atomic
 * (tmp + rename below), so nothing was ever half-written — the data was
 * destroyed by a clean write of the wrong thing.
 *
 * So an unreadable file throws. A loud failure on a corrupt store is
 * recoverable, because the bytes are still on disk; a quiet one is not.
 */
async function readFileStore(file: string): Promise<BusinessStore | null> {
  let raw: string;
  try {
    raw = await readFile(file, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw new Error(
      `No pude leer ${file}. Revisá los permisos antes de seguir — ` +
        "la app no arranca vacía sobre un archivo que existe.",
      { cause: error },
    );
  }

  try {
    return normalize(JSON.parse(raw) as Partial<BusinessStore>);
  } catch (error) {
    throw new Error(
      `${file} existe pero no es JSON válido. No lo sobrescribo: ` +
        "movelo a un lado o arreglalo, y volvé a abrir la app.",
      { cause: error },
    );
  }
}

function normalize(parsed: Partial<BusinessStore>): BusinessStore {
  return {
    team: { ...emptyTeam(), ...parsed.team },
    automations: parsed.automations ?? [],
    contacts: parsed.contacts ?? [],
    // Absent from every store written before deals existed, which is why it is
    // read defensively rather than assumed.
    deals: parsed.deals ?? [],
    chats: parsed.chats ?? [],
    reminders: parsed.reminders ?? [],
    reminderActivity: parsed.reminderActivity ?? [],
    agents: parsed.agents ?? [],
    forms: parsed.forms ?? [],
    formResponses: parsed.formResponses ?? [],
    voiceCalls: parsed.voiceCalls ?? [],
    agentChats: parsed.agentChats ?? [],
    channelConversations: parsed.channelConversations ?? [],
    channelAgents: parsed.channelAgents ?? {},
  };
}

async function readStore(): Promise<BusinessStore> {
  const where = await target();
  if (await usingDb(where)) {
    const document = await dbReadDocument<Partial<BusinessStore>>(where.id);
    return document ? normalize(document) : emptyStore();
  }
  return (await readFileStore(where.file)) ?? emptyStore();
}

async function writeStore(file: string, store: BusinessStore): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2) + "\n", "utf-8");
  await rename(tmp, file);
}

async function updateStore<T>(fn: (store: BusinessStore) => T): Promise<T> {
  const where = await target();
  const mutate = (store: BusinessStore): T => {
    const before = store.team.enabled ? teamSnapshot(store) : null;
    const result = fn(store);
    if (before) captureTeamChanges(store.team, before, store);
    return result;
  };
  if (await usingDb(where)) {
    // No queue: the row lock inside the transaction is the serialisation, and
    // it holds across processes, which the in-process queue never did.
    // Normalized on the way in, so a mutator can push onto a collection the
    // stored document predates.
    return dbUpdateDocument(where.id, (raw) => (raw ? normalize(raw) : emptyStore()), mutate);
  }
  // A successful write to a fallback file would lose its collaboration event
  // when PostgreSQL recovers. Reads may fall back; configured DB writes may not.
  if (process.env.WORKFLOW_POSTGRES_URL) throw new Error("The workspace database is unavailable");
  return enqueue(async () => {
    const store = (await readFileStore(where.file)) ?? emptyStore();
    const result = mutate(store);
    await writeStore(where.file, store);
    return result;
  });
}

export async function readTeamState(): Promise<TeamState> {
  return (await readStore()).team;
}

/**
 * Paid/background work needs the same cross-process row lock as business writes.
 *
 * `records` are the live contacts and deals, for the team's own actions.
 * Writes through it deliberately skip change capture (unlike `updateStore`):
 * a round that moves a deal must not start a round about moving that deal.
 */
export async function updateTeamState<T>(
  fn: (team: TeamState, agents: Agent[], records: { contacts: Contact[]; deals: Deal[] }) => T,
): Promise<T> {
  if (!process.env.WORKFLOW_POSTGRES_URL) throw new Error("PostgreSQL is required for autonomous teams");
  const where = await target();
  if (!(await usingDb(where))) throw new Error("The workspace database is unavailable");
  return dbUpdateDocument<BusinessStore, T>(where.id, (raw) => (raw ? normalize(raw) : emptyStore()), (store) => fn(store.team, store.agents, store));
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizePhone(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const trimmed = phone.replace(/[\s()-]/g, "");
  return trimmed.length > 0 ? trimmed : undefined;
}

// ── Automations ────────────────────────────────────────────────────

export async function listAutomations(): Promise<Automation[]> {
  return (await readStore()).automations;
}


export async function createAutomation(
  input: Omit<Automation, "id" | "status" | "responseCount" | "createdAt">,
): Promise<Automation[]> {
  return updateStore((store) => {
    const created: Automation = {
      ...input,
      id: newId("auto"),
      status: "draft",
      responseCount: 0,
      createdAt: nowIso(),
      steps: input.steps ?? [],
    };
    store.automations = [created, ...store.automations];
    return store.automations;
  });
}

export async function updateAutomation(
  id: string,
  updates: Partial<Omit<Automation, "id">>,
): Promise<Automation[]> {
  return updateStore((store) => {
    store.automations = store.automations.map((a) =>
      a.id === id ? { ...a, ...updates } : a,
    );
    return store.automations;
  });
}

export async function deleteAutomation(id: string): Promise<Automation[]> {
  return updateStore((store) => {
    store.automations = store.automations.filter((a) => a.id !== id);
    return store.automations;
  });
}

export async function recordAutomationFire(id: string): Promise<void> {
  await updateStore((store) => {
    store.automations = store.automations.map((a) =>
      a.id === id
        ? { ...a, responseCount: a.responseCount + 1, lastTriggeredAt: nowIso() }
        : a,
    );
  });
}

// ── Contacts ───────────────────────────────────────────────────────

export async function listContacts(): Promise<Contact[]> {
  return (await readStore()).contacts;
}


export async function getContact(id: string): Promise<Contact | undefined> {
  return (await readStore()).contacts.find((c) => c.id === id);
}

export async function getContactBySession(sessionId: string): Promise<Contact | undefined> {
  return (await readStore()).contacts.find((c) => c.sessionId === sessionId);
}

export async function getContactByPhone(phone: string): Promise<Contact | undefined> {
  const normalized = normalizePhone(phone);
  if (!normalized) return undefined;
  return (await readStore()).contacts.find((c) => normalizePhone(c.phone) === normalized);
}

/**
 * The name a contact gets when nobody has said who they are.
 *
 * Contacts are created on the first inbound event, before anyone has
 * introduced themselves, so `name` has to hold *something* — and on the web
 * console, where the "contact" is the operator talking to their own agent, it
 * never gets replaced. Exported so the callers that display a name can tell
 * "we don't know yet" from an actual name, instead of printing this at people.
 */
export const UNNAMED_CONTACT = "Unknown";

export async function upsertContact(
  input: Partial<Contact> & { sessionId?: string; phone?: string; email?: string },
): Promise<Contact> {
  return updateStore((store) => upsertContactInStore(store, input));
}

/**
 * A whole CSV in one write: a file that half-imports and then fails leaves the
 * person unable to tell which rows made it. Matching is `upsertContact`'s, so a
 * row whose email or phone already exists updates that contact.
 *
 * `source` is only stamped on contacts the file creates. Overwriting it on an
 * existing contact would re-attribute a WhatsApp lead to "csv" in every chart.
 */
export async function importContacts(
  inputs: readonly Partial<Contact>[],
): Promise<{ created: number; updated: number }> {
  return updateStore((store) => {
    let created = 0;
    // Reversed so the file's first row ends up first: new contacts are prepended.
    for (const input of [...inputs].reverse()) {
      const before = store.contacts.length;
      const contact = upsertContactInStore(store, input);
      if (store.contacts.length > before) {
        created += 1;
        store.contacts[0] = { ...contact, source: "csv" };
      }
    }
    return { created, updated: inputs.length - created };
  });
}

function upsertContactInStore(store: BusinessStore, input: Partial<Contact>): Contact {
  const phone = normalizePhone(input.phone);
  const existing = store.contacts.find((c) => {
    if (input.id && c.id === input.id) return true;
    if (input.sessionId && c.sessionId === input.sessionId) return true;
    if (phone && normalizePhone(c.phone) === phone) return true;
    if (input.externalId && c.externalId === input.externalId) return true;
    if (input.email && c.email && c.email.toLowerCase() === input.email.toLowerCase()) {
      return true;
    }
    return false;
  });

  if (existing) {
    const next: Contact = {
      ...existing,
      name: input.name ?? existing.name,
      phone: phone ?? existing.phone,
      email: input.email ?? existing.email,
      externalId: input.externalId ?? existing.externalId,
      channel: input.channel ?? existing.channel,
      sessionId: input.sessionId ?? existing.sessionId,
      crmId: input.crmId ?? existing.crmId,
      status: input.status ?? existing.status,
      source: input.source ?? existing.source,
      attributes: { ...existing.attributes, ...input.attributes },
      lastMessage: input.lastMessage ?? existing.lastMessage,
      lastMessageAt: input.lastMessageAt ?? existing.lastMessageAt,
      notes: input.notes ?? existing.notes,
    };
    store.contacts = store.contacts.map((c) => (c.id === existing.id ? next : c));
    return next;
  }

  const created: Contact = {
    id: newId("ct"),
    name: input.name ?? phone ?? input.email ?? UNNAMED_CONTACT,
    phone,
    email: input.email,
    externalId: input.externalId,
    channel: input.channel ?? "web",
    sessionId: input.sessionId,
    crmId: input.crmId,
    status: input.status ?? "open",
    source: input.source ?? "chat",
    attributes: input.attributes ?? {},
    lastMessage: input.lastMessage,
    lastMessageAt: input.lastMessageAt ?? nowIso(),
    createdAt: nowIso(),
    notes: input.notes,
  };
  store.contacts = [created, ...store.contacts];
  return created;
}

export async function setContactStatus(id: string, status: ContactStatus): Promise<Contact[]> {
  return updateStore((store) => {
    store.contacts = store.contacts.map((c) => (c.id === id ? { ...c, status } : c));
    return store.contacts;
  });
}

/**
 * Status change plus placement: the CRM board lets a card be dropped between
 * two others, and the slot it lands in is the order it keeps. Order lives in
 * the contacts array itself — see `moveContactTo`.
 */
export async function moveContact(
  id: string,
  status: ContactStatus,
  index?: number,
): Promise<Contact[]> {
  return updateStore((store) => {
    store.contacts = moveContactTo(store.contacts, id, status, index);
    return store.contacts;
  });
}

export async function ingestLead(lead: LeadInput): Promise<Contact> {
  const name = lead.name?.trim() || lead.phone || lead.email || "Lead";
  return upsertContact({
    name,
    phone: lead.phone,
    email: lead.email,
    channel: lead.channel ?? "form",
    source: lead.source ?? "webhook",
    lastMessage: lead.message,
    attributes: lead.attributes ?? {},
    status: "open",
  });
}

// ── Chats ──────────────────────────────────────────────────────────

export async function listChats(): Promise<ChatSummary[]> {
  return (await readStore()).chats;
}

/**
 * Create or patch the history row for a conversation.
 *
 * A patch, not a whole record: the persist hook learns the pieces at different
 * moments — the channel when the session opens, the title when the person
 * says the first thing, the last message and the count on every turn — and
 * requiring it to restate all of them each time is how a good title gets
 * overwritten with a stand-in. Omitted keys keep whatever the row already has;
 * a new row fills the gaps with empties.
 */
export async function upsertChat(
  chat: Partial<Omit<ChatSummary, "id">> & { id?: string },
): Promise<ChatSummary[]> {
  return updateStore((store) => upsertChatInStore(store, chat));
}

function upsertChatInStore(
  store: BusinessStore,
  chat: Partial<ChatSummary>,
): ChatSummary[] {
  const existing = store.chats.find(
    (c) =>
      (chat.id && c.id === chat.id) ||
      (chat.sessionId && c.sessionId === chat.sessionId),
  );
  if (existing) {
    const next: ChatSummary = { ...existing, ...chat, id: existing.id };
    store.chats = store.chats.map((c) => (c.id === existing.id ? next : c));
    return store.chats;
  }
  const created: ChatSummary = {
    channel: "web",
    lastMessage: "",
    lastMessageAt: nowIso(),
    messageCount: 0,
    title: "",
    ...chat,
    id: chat.id ?? newId("conv"),
  };
  store.chats = [created, ...store.chats];
  return store.chats;
}

/** Create the contact and history row in one transaction before the first turn. */
export async function startChatSession(input: {
  sessionId: string;
  channel: ChannelId;
  phone?: string;
  externalId?: string;
}): Promise<void> {
  await updateStore((store) => {
    upsertContactInStore(store, { ...input, source: input.channel });
    // Replayed session events must not reset a populated history row.
    upsertChatInStore(store, { sessionId: input.sessionId, channel: input.channel });
  });
}

/** Persist a message's count, preview and transcript under the same row lock.
 * Reading the count before acquiring that lock loses increments on overlap. */
export async function recordChatMessage(input: {
  sessionId: string;
  channel: ChannelId;
  role: "user" | "assistant";
  content: string;
}): Promise<void> {
  await updateStore((store) => {
    const { sessionId, channel, role, content } = input;
    const existing = store.chats.find((chat) => chat.sessionId === sessionId);
    let contact = store.contacts.find((item) => item.sessionId === sessionId);
    const customer = channel === "whatsapp" || channel === "instagram";
    const name = contact?.name?.trim();
    const realName =
      name && name !== UNNAMED_CONTACT && name !== contact?.phone && name !== contact?.externalId
        ? name
        : undefined;
    const firstMessage = role === "user" ? content.trim().replace(/\s+/g, " ") : "";
    let title: string | undefined;
    if (customer && realName) title = realName;
    else if (!existing?.title?.trim()) {
      title = firstMessage.length > 60 ? `${firstMessage.slice(0, 59)}…` : firstMessage;
    }
    const lastMessage = content.slice(0, 240) || contact?.lastMessage;
    const lastMessageAt = nowIso();
    if (role === "assistant") {
      contact = upsertContactInStore(store, { sessionId, channel, lastMessage, lastMessageAt });
    }
    upsertChatInStore(store, {
      sessionId,
      channel,
      lastMessageAt,
      messageCount: (existing?.messageCount ?? 0) + 1,
      ...(title ? { title } : {}),
      ...(role === "assistant"
        ? { lastMessage: lastMessage || "", handoff: contact?.status === "waiting_human" }
        : {}),
    });
    if (customer && content.trim()) {
      appendConversationTurnInStore(store, { ...input, contactId: contact?.id, title: contact?.name });
    }
  });
}

/** A chat row can be addressed by either id. The browser store mints its own
 *  `conv-<timestamp>` ids and `mergeChats` keeps those when a session exists in
 *  both stores, so the id the UI holds is often not the one this store minted.
 *  The Eve session id is the only key both sides agree on. */
function isChat(chat: ChatSummary, key: string): boolean {
  return chat.id === key || chat.sessionId === key;
}

export async function deleteChat(key: string): Promise<ChatSummary[]> {
  return updateStore((store) => {
    store.chats = store.chats.filter((c) => !isChat(c, key));
    return store.chats;
  });
}

export async function deleteContact(contactId: string): Promise<Contact[]> {
  return updateStore((store) => {
    store.contacts = store.contacts.filter((c) => c.id !== contactId);
    // Deals and reminders belong to the person, and both name them by id. Left
    // behind they are rows nothing can resolve: a pipeline column counting
    // money against nobody, and a reminder queued to message a contact who is
    // no longer in the store. Same rule `deleteForm` applies to responses.
    store.deals = store.deals.filter((deal) => deal.contactId !== contactId);
    store.reminders = store.reminders.filter((r) => r.contact_id !== contactId);
    return store.contacts;
  });
}

export async function toggleChatPin(key: string): Promise<ChatSummary[]> {
  return updateStore((store) => {
    store.chats = store.chats.map((c) =>
      isChat(c, key) ? { ...c, pinned: !c.pinned } : c,
    );
    return store.chats;
  });
}

/**
 * The customer channel a turn arrived on, from Eve's channel kind.
 *
 * Eve reports an authored channel as `channel:<file stem>`, so
 * agent/channels/whatsapp.ts arrives as "channel:whatsapp" — never the bare
 * "whatsapp" this used to compare against. Everything therefore fell through
 * to "web": WhatsApp conversations were filed as web chat, and because
 * agent/hooks/persist.ts only captures a sender's identity on a *customer*
 * channel, the phone number the sender had already given us by messaging was
 * dropped on every turn. The bare names are still accepted so a caller that
 * passes an already-normalized id keeps working.
 */
export function channelFromKind(kind: string | undefined): ChannelId {
  const name = kind?.startsWith("channel:") ? kind.slice("channel:".length) : kind;
  if (name === "whatsapp") return "whatsapp";
  if (name === "instagram") return "instagram";
  return "web";
}

// ── Reminders ─────────────────────────────────────────────────────

export async function listReminders(contactId?: string): Promise<Reminder[]> {
  const store = await readStore();
  if (contactId) {
    return store.reminders.filter((r) => r.contact_id === contactId);
  }
  return store.reminders;
}

export async function listReminderActivity(): Promise<ReminderActivity[]> {
  const store = await readStore();
  return store.reminderActivity;
}

function addReminderActivity(
  store: BusinessStore,
  reminder: Reminder,
  type: ReminderActivityType,
): void {
  store.reminderActivity = [
    {
      id: newId("rem-activity"),
      reminder_id: reminder.id,
      type,
      message: type === "created" ? "Reminder created" : `Reminder ${type}`,
      reminder_message: reminder.message,
      datetime: reminder.datetime,
      created_at: nowIso(),
    },
    ...store.reminderActivity,
  ];
}


export async function createReminder(input: {
  contact_id: string;
  datetime: string;
  message: string;
  status: ReminderStatus;
}): Promise<Reminder> {
  return updateStore((store) => {
    const reminder: Reminder = {
      id: newId("rem"),
      contact_id: input.contact_id,
      datetime: input.datetime,
      message: input.message,
      status: input.status,
      created_at: nowIso(),
    };
    store.reminders = [reminder, ...store.reminders];
    addReminderActivity(store, reminder, "created");
    return reminder;
  });
}

export async function updateReminder(
  id: string,
  updates: Partial<Omit<Reminder, "id" | "created_at">>,
): Promise<Reminder | undefined> {
  return updateStore((store) => {
    const existing = store.reminders.find((r) => r.id === id);
    if (!existing) return undefined;
    const updated: Reminder = { ...existing, ...updates };
    store.reminders = store.reminders.map((r) => (r.id === id ? updated : r));
    if (
      updates.status &&
      updates.status !== existing.status &&
      updates.status !== "pending"
    ) {
      addReminderActivity(store, updated, updates.status);
    }
    return updated;
  });
}

export async function deleteReminder(id: string): Promise<boolean> {
  return updateStore((store) => {
    const reminder = store.reminders.find((r) => r.id === id);
    if (!reminder) return false;
    addReminderActivity(store, reminder, "deleted");
    const before = store.reminders.length;
    store.reminders = store.reminders.filter((r) => r.id !== id);
    return store.reminders.length < before;
  });
}

// ── Agents ──────────────────────────────────────────────────────

// ── Which agent answers a channel ──────────────────────────────────
//
// A message arriving on WhatsApp has to be answered by *some* agent's rules,
// and until this existed there was no answer to "which one": the runtime had
// one prompt and every tool, and the agents in the app were configuration
// nobody's inbound message ever read.
//
// Assignment is per channel rather than per contact so that a working
// installation needs one decision, not one per conversation, and pointing
// all three channels at the same agent is how you say "one agent for
// everything".

export async function getChannelAgents(): Promise<Partial<Record<ChannelId, string>>> {
  return (await readStore()).channelAgents ?? {};
}


/** `null` clears the assignment, which is how a channel goes back to the
 *  unrestricted default rather than being pinned to a deleted agent. */
export async function setChannelAgent(
  channel: ChannelId,
  agentId: string | null,
): Promise<Partial<Record<ChannelId, string>>> {
  return updateStore((store) => {
    const next = { ...(store.channelAgents ?? {}) };
    if (agentId) next[channel] = agentId;
    else delete next[channel];
    store.channelAgents = next;
    return next;
  });
}

export async function listAgents(): Promise<Agent[]> {
  return (await readStore()).agents;
}

export async function getAgent(id: string): Promise<Agent | undefined> {
  return (await readStore()).agents.find((a) => a.id === id);
}

export async function createAgent(
  input: Omit<Agent, "id" | "createdAt" | "status"> & { readonly status?: AgentStatus },
): Promise<Agent> {
  return updateStore((store) => {
    const created: Agent = {
      ...input,
      id: newId("agent"),
      // Templates and the API's own default still hire a working agent
      // outright; the builder passes "draft", because an agent that exists
      // only so the workspace has something to autosave into must not start
      // out answering customers.
      status: input.status ?? "active",
      createdAt: nowIso(),
    };
    store.agents = [created, ...store.agents];
    return created;
  });
}

export async function updateAgent(
  id: string,
  updates: Partial<Omit<Agent, "id" | "createdAt">>,
): Promise<Agent | undefined> {
  return updateStore((store) => {
    const existing = store.agents.find((a) => a.id === id);
    if (!existing) return undefined;
    const updated: Agent = { ...existing, ...updates };
    store.agents = store.agents.map((a) => (a.id === id ? updated : a));
    return updated;
  });
}

export async function deleteAgent(id: string): Promise<boolean> {
  return updateStore((store) => {
    const initial = store.agents.length;
    store.agents = store.agents.filter((a) => a.id !== id);
    return store.agents.length < initial;
  });
}

export async function toggleAgentStatus(id: string): Promise<Agent | undefined> {
  return updateStore((store) => {
    const existing = store.agents.find((a) => a.id === id);
    if (!existing) return undefined;
    // A draft has never been on, so its toggle turns it on — the same as a
    // paused one. Only "active" toggles the other way.
    const nextStatus: AgentStatus = existing.status === "active" ? "inactive" : "active";
    const updated: Agent = { ...existing, status: nextStatus };
    store.agents = store.agents.map((a) => (a.id === id ? updated : a));
    return updated;
  });
}

/** Looks an agent up by its ElevenLabs mirror id — what a post-call webhook
 *  carries, never this app's own agent id. */
export async function getAgentByElevenLabsAgentId(
  elevenlabsAgentId: string,
): Promise<Agent | undefined> {
  return (await readStore()).agents.find(
    (a) => a.voice?.elevenlabsAgentId === elevenlabsAgentId,
  );
}

// ── Voice calls ──────────────────────────────────────────────────────
//
// Every call an agent's ElevenLabs mirror handles — the test button on this
// app and real inbound calls both land here. `startVoiceCall` runs the
// instant this app itself places or opens a call, before there is any
// transcript to show, purely to stamp `source: "test"` on the record ahead
// of the webhook. `recordVoiceCallTranscript` is the post_call_transcription
// webhook filling that record in (or creating it fresh, tagged "real", when
// no such pending row exists — the only way a call reaches this handler
// without this app having placed it first).

export async function listVoiceCalls(agentId: string): Promise<VoiceCall[]> {
  const calls = (await readStore()).voiceCalls.filter((c) => c.agentId === agentId);
  return calls.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function startVoiceCall(input: {
  agentId: string;
  conversationId: string;
  source: VoiceCallSource;
}): Promise<VoiceCall> {
  return updateStore((store) => {
    const existing = store.voiceCalls.find((c) => c.conversationId === input.conversationId);
    if (existing) return existing;
    const created: VoiceCall = {
      id: newId("call"),
      agentId: input.agentId,
      conversationId: input.conversationId,
      source: input.source,
      transcript: [],
      startedAt: nowIso(),
      createdAt: nowIso(),
    };
    store.voiceCalls = [created, ...store.voiceCalls];
    return created;
  });
}

export async function recordVoiceCallTranscript(input: {
  agentId: string;
  conversationId: string;
  transcript: readonly VoiceCallTurn[];
  durationSecs?: number;
  startedAt?: string;
}): Promise<VoiceCall> {
  return updateStore((store) => {
    const existing = store.voiceCalls.find((c) => c.conversationId === input.conversationId);
    if (existing) {
      const updated: VoiceCall = {
        ...existing,
        // post_call_transcription only fires once a call has ended, so a row
        // it touches is finished by definition.
        status: "done",
        transcript: input.transcript,
        durationSecs: input.durationSecs ?? existing.durationSecs,
        startedAt: input.startedAt ?? existing.startedAt,
      };
      store.voiceCalls = store.voiceCalls.map((c) =>
        c.conversationId === input.conversationId ? updated : c,
      );
      return updated;
    }
    // No pending row — this app never placed this call, so it is a real
    // inbound call reaching the agent's routed number.
    const created: VoiceCall = {
      id: newId("call"),
      agentId: input.agentId,
      conversationId: input.conversationId,
      source: "real",
      status: "done",
      transcript: input.transcript,
      durationSecs: input.durationSecs,
      startedAt: input.startedAt ?? nowIso(),
      createdAt: nowIso(),
    };
    store.voiceCalls = [created, ...store.voiceCalls];
    return created;
  });
}

/**
 * The pull path's writer: what a poll of ElevenLabs learned about a call.
 *
 * Deliberately not the same function as `recordVoiceCallTranscript`. A poll
 * can land while the call is still going, and an in-progress conversation
 * answers with an empty transcript — writing that over a transcript already
 * saved would erase the call to show a fresher nothing. So the transcript is
 * only ever replaced by a longer one.
 */
export async function updateVoiceCallState(input: {
  agentId: string;
  conversationId: string;
  status: VoiceCallStatus;
  transcript: readonly VoiceCallTurn[];
  durationSecs?: number;
  startedAt?: string;
  terminationReason?: string;
}): Promise<VoiceCall> {
  return updateStore((store) => {
    const existing = store.voiceCalls.find((c) => c.conversationId === input.conversationId);
    const transcript =
      input.transcript.length >= (existing?.transcript.length ?? 0)
        ? input.transcript
        : (existing?.transcript ?? []);

    if (existing) {
      const updated: VoiceCall = {
        ...existing,
        status: input.status,
        transcript,
        durationSecs: input.durationSecs ?? existing.durationSecs,
        startedAt: input.startedAt ?? existing.startedAt,
        ...(input.terminationReason ? { terminationReason: input.terminationReason } : {}),
      };
      store.voiceCalls = store.voiceCalls.map((c) =>
        c.conversationId === input.conversationId ? updated : c,
      );
      return updated;
    }

    const created: VoiceCall = {
      id: newId("call"),
      agentId: input.agentId,
      conversationId: input.conversationId,
      source: "real",
      status: input.status,
      transcript,
      durationSecs: input.durationSecs,
      startedAt: input.startedAt ?? nowIso(),
      createdAt: nowIso(),
      ...(input.terminationReason ? { terminationReason: input.terminationReason } : {}),
    };
    store.voiceCalls = [created, ...store.voiceCalls];
    return created;
  });
}

// ── Agent playground chats ─────────────────────────────────────────
//
// The text half of the agent playground keeps its transcripts here, next to
// the call transcripts, for the same reason: what the agent answered in
// rehearsal is what you compare against after editing the prompt, and a
// browser tab is not a place to keep that. Nothing in here ever reached a
// customer — a playground chat runs no tools and touches no channel.

/** Kept per agent. Old rehearsals stop being interesting long before they
 *  stop taking up room in the store, so the tail is dropped on write. */
const MAX_CHATS_PER_AGENT = 30;

/** How much of the opening line becomes the session's name in the list. */
const CHAT_TITLE_LENGTH = 60;

function chatTitle(turns: readonly AgentChatTurn[]): string {
  const first = turns.find((turn) => turn.role === "user")?.content.trim() ?? "";
  if (!first) return "";
  return first.length > CHAT_TITLE_LENGTH ? `${first.slice(0, CHAT_TITLE_LENGTH)}…` : first;
}

export async function listAgentChats(agentId: string): Promise<AgentChatSession[]> {
  const chats = (await readStore()).agentChats.filter((c) => c.agentId === agentId);
  return chats.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Write a conversation, creating it on the first save and replacing its turns
 * on every save after that.
 *
 * The browser owns the transcript while the chat is open and sends the whole
 * thing each time, so this is a replace rather than an append: a retried or
 * out-of-order save can't interleave two copies of the same answer.
 */
export async function saveAgentChat(input: {
  sessionId?: string;
  agentId: string;
  turns: readonly AgentChatTurn[];
}): Promise<AgentChatSession> {
  return updateStore((store) => {
    const existing = input.sessionId
      ? store.agentChats.find((c) => c.id === input.sessionId && c.agentId === input.agentId)
      : undefined;

    const saved: AgentChatSession = {
      id: existing?.id ?? newId("chat"),
      agentId: input.agentId,
      // The title comes from the opening line, which never changes once the
      // session exists — so an existing one keeps the name it was listed by.
      title: existing?.title || chatTitle(input.turns),
      turns: input.turns,
      startedAt: existing?.startedAt ?? nowIso(),
      updatedAt: nowIso(),
    };

    const others = store.agentChats.filter((c) => c.id !== saved.id);
    const mine = others.filter((c) => c.agentId === input.agentId);
    const dropped = new Set(
      mine
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(MAX_CHATS_PER_AGENT - 1)
        .map((c) => c.id),
    );
    store.agentChats = [saved, ...others.filter((c) => !dropped.has(c.id))];
    return saved;
  });
}

export async function deleteAgentChat(agentId: string, sessionId: string): Promise<boolean> {
  return updateStore((store) => {
    const before = store.agentChats.length;
    store.agentChats = store.agentChats.filter(
      (c) => !(c.id === sessionId && c.agentId === agentId),
    );
    return store.agentChats.length < before;
  });
}

// ── Channel conversations ──────────────────────────────────────────
//
// What the agent actually said to customers on WhatsApp and Instagram,
// mirrored here turn by turn from agent/hooks/persist.ts.
//
// Eve owns the durable session and is the system of record for the model; the
// copy here is what the operator's screens read, because showing a transcript
// should not mean holding an Eve session open, and because the prospect
// assessment needs somewhere to live that is not the model's own history.

/** Turns kept per conversation. A long-running WhatsApp thread is a year of
 *  chatter; what an operator reads is the recent end of it. */
const MAX_CONVERSATION_TURNS = 200;

/** Conversations kept in total, newest first. */
const MAX_CONVERSATIONS = 300;

export async function listChannelConversations(): Promise<ChannelConversation[]> {
  const conversations = [...(await readStore()).channelConversations];
  return conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getChannelConversation(
  id: string,
): Promise<ChannelConversation | undefined> {
  return (await readStore()).channelConversations.find((c) => c.id === id);
}

/**
 * Append one turn to a channel conversation, creating it on the first turn.
 *
 * Keyed by Eve session id, so the two halves of a turn — the customer's
 * message and the agent's reply, which arrive as separate stream events —
 * land in the same record.
 */
export async function appendConversationTurn(input: {
  sessionId: string;
  channel: ChannelId;
  role: AgentChatTurn["role"];
  content: string;
  contactId?: string;
  title?: string;
}): Promise<ChannelConversation | undefined> {
  const content = input.content.trim();
  if (!content) return undefined;

  return updateStore((store) => appendConversationTurnInStore(store, input));
}

function appendConversationTurnInStore(
  store: BusinessStore,
  input: Parameters<typeof appendConversationTurn>[0],
): ChannelConversation {
  const content = input.content.trim();
  const existing = store.channelConversations.find((c) => c.sessionId === input.sessionId);
  const turn: AgentChatTurn = { role: input.role, content };

  const updated: ChannelConversation = {
    id: existing?.id ?? newId("conv"),
    sessionId: input.sessionId,
    channel: input.channel,
    contactId: input.contactId ?? existing?.contactId,
    // A conversation is named after whoever is on the other end, and that
    // name usually arrives a few turns in — so a real one always wins over
    // the placeholder the first turn had to use.
    title: input.title?.trim() || existing?.title || "",
    turns: [...(existing?.turns ?? []), turn].slice(-MAX_CONVERSATION_TURNS),
    startedAt: existing?.startedAt ?? nowIso(),
    updatedAt: nowIso(),
    prospect: existing?.prospect,
  };

  const others = store.channelConversations.filter((c) => c.sessionId !== input.sessionId);
  store.channelConversations = [updated, ...others].slice(0, MAX_CONVERSATIONS);
  return updated;
}

export async function setConversationProspect(
  id: string,
  prospect: ProspectAssessment,
): Promise<ChannelConversation | undefined> {
  return updateStore((store) => {
    const existing = store.channelConversations.find((c) => c.id === id);
    if (!existing) return undefined;
    const updated: ChannelConversation = { ...existing, prospect };
    store.channelConversations = store.channelConversations.map((c) =>
      c.id === id ? updated : c,
    );
    return updated;
  });
}

export async function setVoiceCallProspect(
  callId: string,
  prospect: ProspectAssessment,
): Promise<VoiceCall | undefined> {
  return updateStore((store) => {
    const existing = store.voiceCalls.find((c) => c.id === callId);
    if (!existing) return undefined;
    const updated: VoiceCall = { ...existing, prospect };
    store.voiceCalls = store.voiceCalls.map((c) => (c.id === callId ? updated : c));
    return updated;
  });
}

/** Every voice call, newest first — what the assessment schedule walks. */
export async function listAllVoiceCalls(): Promise<VoiceCall[]> {
  const calls = [...(await readStore()).voiceCalls];
  return calls.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

// ── Forms ──────────────────────────────────────────────────────────
//
// Forms and their responses live in this file rather than in one of their own
// because `readStore` rebuilds the whole object from a fixed key set: a second
// module writing the same JSON would drop whatever it did not know about. One
// owner per file.

/** A slug that reads like the form's name and is safe in a URL. Falls back to
 *  the id's suffix when a name has nothing a URL can carry (an emoji, CJK). */
export function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "form";
}

/** `slugify`, then `-2`, `-3`… until nothing else claims it. */
function uniqueSlug(forms: readonly Form[], name: string, ignoreId?: string): string {
  const taken = new Set(forms.filter((f) => f.id !== ignoreId).map((f) => f.slug));
  const base = slugify(name);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function listForms(): Promise<Form[]> {
  return (await readStore()).forms;
}


export async function getForm(id: string): Promise<Form | undefined> {
  return (await readStore()).forms.find((f) => f.id === id);
}

/** How the public page finds a form. Draft forms resolve too — the caller
 *  decides what an unpublished form looks like to a visitor. */
export async function getFormBySlug(slug: string): Promise<Form | undefined> {
  return (await readStore()).forms.find((f) => f.slug === slug);
}

export async function createForm(
  input: Pick<Form, "name" | "description" | "steps" | "scoring"> & Partial<Pick<Form, "thankYou" | "status" | "slug">>,
): Promise<Form> {
  return updateStore((store) => {
    const now = nowIso();
    const created: Form = {
      id: newId("fm"),
      slug: uniqueSlug(store.forms, input.slug ?? input.name),
      name: input.name,
      description: input.description,
      // Published on creation: a form nobody can open is not a first win, and
      // the list screen has a switch for turning it off.
      status: input.status ?? "published",
      steps: input.steps,
      scoring: input.scoring,
      thankYou: input.thankYou,
      createdAt: now,
      updatedAt: now,
    };
    store.forms = [created, ...store.forms];
    return created;
  });
}

export async function updateForm(
  id: string,
  updates: Partial<Omit<Form, "id" | "createdAt">>,
): Promise<Form | undefined> {
  return updateStore((store) => {
    const existing = store.forms.find((f) => f.id === id);
    if (!existing) return undefined;
    // A rename does not move the URL: links already handed out keep working.
    // Changing the slug is its own edit, and it is checked for collisions.
    const slug = updates.slug ? uniqueSlug(store.forms, updates.slug, id) : existing.slug;
    const updated: Form = { ...existing, ...updates, slug, updatedAt: nowIso() };
    store.forms = store.forms.map((f) => (f.id === id ? updated : f));
    return updated;
  });
}

export async function deleteForm(id: string): Promise<boolean> {
  return updateStore((store) => {
    const initial = store.forms.length;
    store.forms = store.forms.filter((f) => f.id !== id);
    // Responses go with it. Keeping orphans would leave the responses screen
    // counting answers to questions nobody can read any more.
    store.formResponses = store.formResponses.filter((r) => r.formId !== id);
    return store.forms.length < initial;
  });
}

// ── Deals ──────────────────────────────────────────────────────────

export async function listDeals(contactId?: string): Promise<Deal[]> {
  const deals = (await readStore()).deals;
  return contactId ? deals.filter((deal) => deal.contactId === contactId) : deals;
}

export async function getDeal(id: string): Promise<Deal | undefined> {
  return (await readStore()).deals.find((deal) => deal.id === id);
}

export async function createDeal(
  input: Pick<Deal, "contactId" | "title" | "value" | "currency"> &
    Partial<Pick<Deal, "stage" | "expectedCloseAt" | "notes" | "source" | "lostReason">>,
): Promise<Deal> {
  return updateStore((store) => {
    const now = nowIso();
    const stage = input.stage ?? "lead";
    const created: Deal = {
      id: newId("dl"),
      contactId: input.contactId,
      title: input.title,
      value: input.value,
      currency: input.currency,
      stage,
      expectedCloseAt: input.expectedCloseAt,
      notes: input.notes,
      // Inherited from the contact when the caller didn't say, so "which
      // channel actually pays" is answerable without anyone filling a field.
      source: input.source ?? store.contacts.find((c) => c.id === input.contactId)?.source,
      lostReason: input.lostReason,
      createdAt: now,
      updatedAt: now,
      closedAt: stage === "won" || stage === "lost" ? now : undefined,
    };
    store.deals = [created, ...store.deals];
    return created;
  });
}

export async function updateDeal(
  id: string,
  updates: Partial<Omit<Deal, "id" | "contactId" | "createdAt">>,
): Promise<Deal | undefined> {
  return updateStore((store) => {
    const existing = store.deals.find((deal) => deal.id === id);
    if (!existing) return undefined;
    const stage = updates.stage ?? existing.stage;
    const closing = stage === "won" || stage === "lost";
    const wasClosed = existing.stage === "won" || existing.stage === "lost";
    const updated: Deal = {
      ...existing,
      ...updates,
      stage,
      // `closedAt` is owned by the stage, not by the caller: stamped the first
      // time a deal closes, kept across later edits to a closed deal, and
      // cleared when one is reopened — otherwise a reopened deal keeps a
      // closing date it no longer has.
      closedAt: closing ? (wasClosed ? existing.closedAt : nowIso()) : undefined,
      // A reason only means anything on a lost deal. Moving one back out of
      // `lost` takes the reason with it.
      lostReason: stage === "lost" ? (updates.lostReason ?? existing.lostReason) : undefined,
      updatedAt: nowIso(),
    };
    store.deals = store.deals.map((deal) => (deal.id === id ? updated : deal));
    return updated;
  });
}

export async function deleteDeal(id: string): Promise<boolean> {
  return updateStore((store) => {
    const initial = store.deals.length;
    store.deals = store.deals.filter((deal) => deal.id !== id);
    return store.deals.length < initial;
  });
}

export async function listFormResponses(formId?: string): Promise<FormResponse[]> {
  const responses = (await readStore()).formResponses;
  return formId ? responses.filter((r) => r.formId === formId) : responses;
}

export async function getFormResponse(id: string): Promise<FormResponse | undefined> {
  return (await readStore()).formResponses.find((r) => r.id === id);
}

/**
 * Create or replace a response. The public page writes on every step, so the
 * same response is updated several times: whoever left after question two is
 * already stored when they close the tab, which is the whole point of counting
 * partial submissions as leads.
 */
export async function saveFormResponse(
  input: Omit<FormResponse, "id" | "startedAt" | "updatedAt"> & { id?: string },
): Promise<FormResponse> {
  return updateStore((store) => {
    const now = nowIso();
    const existing = input.id ? store.formResponses.find((r) => r.id === input.id) : undefined;
    if (existing) {
      const updated: FormResponse = {
        ...existing,
        answers: input.answers,
        score: input.score,
        temperature: input.temperature,
        partial: input.partial,
        contactId: input.contactId ?? existing.contactId,
        updatedAt: now,
      };
      store.formResponses = store.formResponses.map((r) => (r.id === existing.id ? updated : r));
      return updated;
    }
    const created: FormResponse = {
      ...input,
      id: input.id ?? newId("fr"),
      startedAt: now,
      updatedAt: now,
    };
    store.formResponses = [created, ...store.formResponses];
    return created;
  });
}
