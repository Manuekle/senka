import type { Agent, Contact, Deal } from "./types";

export type TeamActionType = "contact_status" | "contact_note" | "contact_attribute" | "deal_stage" | "deal_note";

/** What an agent asked to do, as the model returns it. */
export type TeamActionRequest = {
  readonly type: TeamActionType;
  readonly targetId: string;
  /** Attribute name for `contact_attribute`; empty for every other type. */
  readonly key: string;
  readonly value: string;
};

/** What actually happened, kept on the message that asked for it. */
export type TeamAction = {
  readonly type: TeamActionType;
  readonly targetId: string;
  /** The record's name when the action ran, so the feed still reads after a rename or delete. */
  readonly targetName?: string;
  readonly key?: string;
  readonly value: string;
  readonly previous?: string;
  readonly status: "done" | "skipped";
  readonly reason?: "not_in_round" | "not_found" | "unchanged" | "invalid" | "closed";
};

export type TeamMessage = {
  id: string;
  agentId: string;
  agentName: string;
  text: string;
  at: string;
  actions?: TeamAction[];
};

export type TeamEvent = {
  id: string;
  at: string;
  changes: { kind: string; id: string; before: string | null; after: string | null }[];
  status: "queued" | "running" | "completed" | "failed";
  participants: string[];
  messages: TeamMessage[];
  attempts: number;
  lease?: { token: string; until: number };
  retryAt?: number;
  error?: string;
};

export type TeamState = {
  /** `auto` follows the active agents; `manual` is what the owner picked.
   *  Absent on every team stored before modes existed — see `isAutoTeam`. */
  mode?: "auto" | "manual";
  enabled: boolean;
  agentIds: string[];
  dailyLimit: number;
  day: string;
  calls: number;
  memory: { agentId: string; text: string }[];
  events: TeamEvent[];
  droppedEvents: number;
};

/** The records a turn may act on, handed in by the store's transaction. */
export type TeamRecords = { contacts: Contact[]; deals: Deal[] };

export function emptyTeam(): TeamState {
  return {
    enabled: false, agentIds: [], dailyLimit: 20, day: "", calls: 0,
    memory: [], events: [], droppedEvents: 0,
  };
}

/** A team nobody has configured runs itself. One configured before modes
 *  existed has participants or is switched on, and keeps its owner's choice. */
export function isAutoTeam(team: TeamState): boolean {
  if (team.mode) return team.mode === "auto";
  return !team.enabled && team.agentIds.length === 0;
}

/** Point an automatic team at the active agents (at most six) and switch it
 *  on once there are two to talk. Returns whether anything changed. */
export function syncAutoTeam(team: TeamState, agents: readonly Agent[]): boolean {
  if (!isAutoTeam(team)) return false;
  const ids = agents.filter((agent) => agent.status === "active").slice(0, 6).map((agent) => agent.id);
  const enabled = ids.length >= 2;
  const changed = team.mode !== "auto" || team.enabled !== enabled || team.agentIds.join() !== ids.join();
  team.mode = "auto";
  team.agentIds = ids;
  team.enabled = enabled;
  return changed;
}
