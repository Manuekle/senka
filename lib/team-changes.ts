import { randomUUID } from "node:crypto";
import type { Agent, Contact, Deal } from "./types";
import type { TeamState } from "./team-types";

type BusinessData = { contacts: Contact[]; deals: Deal[]; agents: Agent[] };
export type TeamSnapshot = Map<string, { kind: string; id: string; value: string }>;

/** Only business facts trigger rounds; token streams and the feed itself do not. */
export function teamSnapshot(data: BusinessData): TeamSnapshot {
  const snapshot: TeamSnapshot = new Map();
  const add = (kind: string, id: string, value: unknown) => {
    snapshot.set(`${kind}:${id}`, { kind, id, value: JSON.stringify(value) });
  };
  for (const c of data.contacts) add("contact", c.id, { name: c.name, status: c.status, notes: c.notes, attributes: c.attributes });
  for (const d of data.deals) add("deal", d.id, { title: d.title, contactId: d.contactId, stage: d.stage, value: d.value, currency: d.currency, notes: d.notes });
  for (const a of data.agents) add("agent", a.id, { name: a.name, description: a.description, status: a.status, systemPrompt: a.systemPrompt, tools: a.tools });
  return snapshot;
}

export function captureTeamChanges(team: TeamState, before: TeamSnapshot, data: BusinessData): void {
  if (!team.enabled) return;
  const after = teamSnapshot(data);
  const changes = [...new Set([...before.keys(), ...after.keys()])].flatMap((key) => {
    const previous = before.get(key);
    const next = after.get(key);
    if (previous?.value === next?.value) return [];
    const entity = next ?? previous!;
    return [{ kind: entity.kind, id: entity.id, before: previous?.value.slice(0, 2000) ?? null, after: next?.value.slice(0, 2000) ?? null }];
  });
  if (!changes.length) return;
  // Retain every queued round up to a visible cap; never erase running work.
  const pending = team.events.filter((event) => event.status === "queued" || event.status === "running");
  const finished = team.events.filter((event) => event.status === "completed" || event.status === "failed").slice(-100);
  team.events = [...finished, ...pending];
  if (pending.length >= 100) {
    team.droppedEvents += 1;
    return;
  }
  team.events.push({
    id: randomUUID(), at: new Date().toISOString(), changes: changes.slice(0, 20),
    status: "queued", participants: [...team.agentIds], messages: [], attempts: 0,
  });
  if (changes.length > 20) team.droppedEvents += changes.length - 20;
}
