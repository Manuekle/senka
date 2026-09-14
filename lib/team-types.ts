export type TeamMessage = {
  id: string;
  agentId: string;
  agentName: string;
  text: string;
  at: string;
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
  enabled: boolean;
  agentIds: string[];
  dailyLimit: number;
  day: string;
  calls: number;
  memory: { agentId: string; text: string }[];
  events: TeamEvent[];
  droppedEvents: number;
};

export function emptyTeam(): TeamState {
  return {
    enabled: false, agentIds: [], dailyLimit: 20, day: "", calls: 0,
    memory: [], events: [], droppedEvents: 0,
  };
}
