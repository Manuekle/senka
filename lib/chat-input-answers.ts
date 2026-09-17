import type { InputAnswer } from "./chat-input-request";

// The answers the owner gave to the agent's questions, kept on this device.
//
// Eve does not stream an answer back (see lib/chat-input-request.ts), so the
// only record of "you picked Conectar Search Console" is the click itself.
// Keyed by session so a conversation reopened from Historial finds its
// answers again, and capped so a long-lived browser does not accumulate every
// question ever asked. Best-effort throughout: no storage just means the card
// falls back to "closed" instead of naming the choice.

const STORAGE_KEY = "senka:eve-input-answers:v1";
const MAX_SESSIONS = 40;

export type SessionAnswers = Readonly<Record<string, InputAnswer>>;
export type AnswerStore = { readonly order: readonly string[]; readonly sessions: Readonly<Record<string, SessionAnswers>> };

const EMPTY: AnswerStore = { order: [], sessions: {} };

export function mergeAnswers(
  store: AnswerStore,
  sessionId: string,
  answers: SessionAnswers,
  maxSessions = MAX_SESSIONS,
): AnswerStore {
  const sessions: Record<string, SessionAnswers> = {
    ...store.sessions,
    [sessionId]: { ...store.sessions[sessionId], ...answers },
  };
  const order = [...store.order.filter((id) => id !== sessionId), sessionId];
  while (order.length > maxSessions) {
    const dropped = order.shift();
    if (dropped) delete sessions[dropped];
  }
  return { order, sessions };
}

function read(): AnswerStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<AnswerStore>;
    return {
      order: Array.isArray(parsed.order) ? parsed.order.filter((id) => typeof id === "string") : [],
      sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
    };
  } catch {
    return EMPTY;
  }
}

export function loadSessionAnswers(sessionId: string | undefined): SessionAnswers {
  if (!sessionId) return {};
  return read().sessions[sessionId] ?? {};
}

export function saveSessionAnswers(sessionId: string, answers: SessionAnswers): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mergeAnswers(read(), sessionId, answers)));
  } catch {
    // Best-effort.
  }
}
