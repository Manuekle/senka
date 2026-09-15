// The runtime half of "this agent may use these integrations".
//
// Eve's dynamic capabilities add and override authored tools; they cannot
// remove one. So scoping is enforced where the work actually happens — each
// gateable tool asks here before doing anything, and a refusal comes back as
// a sentence the model can relay ("no puedo cobrar desde acá") rather than as
// a stack trace or, worse, a charge nobody authorised.
//
// The rules, in the order they are applied:
//
//   1. No agent is assigned to this conversation's channel → allow. An
//      installation that never opened Mis Agentes keeps working exactly as it
//      did, which is the only acceptable default for a change that can
//      otherwise silently disable a working WhatsApp bot.
//   2. The assigned agent lists no capabilities → allow. The field used to be
//      free-form prose; an agent whose text nobody has re-picked must not read
//      as "allowed to do nothing".
//   3. Otherwise → only what the agent lists.
//
// Rules 1 and 2 are permissive on purpose. Scoping is a thing an operator
// turns on by making a choice, never something that happens to them.

import { getChannelAgents, getContactBySession, listAgents } from "./business-store";
import {
  capabilityForTool,
  getCapability,
  toCapabilityIds,
  type CapabilityId,
} from "./agent-capabilities";
import { toMessagingChannel } from "./contact-channel";
import type { Agent } from "./types";

// Contacts carry two channels the messaging ones don't — see toMessagingChannel.

/** The agent answering this session, if the operator has assigned one. */
export async function agentForSession(sessionId: string): Promise<Agent | undefined> {
  const contact = await getContactBySession(sessionId);
  if (!contact) return undefined;
  const agentId = (await getChannelAgents())[toMessagingChannel(contact.channel)];
  if (!agentId) return undefined;
  return (await listAgents()).find((agent) => agent.id === agentId);
}

export type ScopeDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly agent: Agent; readonly capability: CapabilityId };

export async function checkCapability(
  sessionId: string,
  capability: CapabilityId,
): Promise<ScopeDecision> {
  const agent = await agentForSession(sessionId);
  if (!agent) return { allowed: true };

  const allowed = toCapabilityIds(agent.tools);
  if (allowed.length === 0) return { allowed: true };
  if (allowed.includes(capability)) return { allowed: true };
  return { allowed: false, agent, capability };
}

/**
 * The one line every gated tool runs first.
 *
 * Throws, rather than returning a value the tool has to remember to check:
 * a tool that forgets a returned `false` charges the card anyway, and a
 * forgotten `await` on a throwing call is a lint error rather than a silent
 * hole. The message names the agent and the capability because the person who
 * reads it in a transcript is the one who has to go and tick the box.
 */
export async function assertCapability(
  sessionId: string,
  capability: CapabilityId,
): Promise<void> {
  const decision = await checkCapability(sessionId, capability);
  if (decision.allowed) return;
  throw new Error(
    `The agent "${decision.agent.name}" is not allowed to use ${capability}. ` +
      `Tell the person you cannot do this, and do not claim otherwise. ` +
      `To enable it, tick "${getCapability(capability).id}" for that agent in Mis Agentes.`,
  );
}

/** Same check, addressed by tool name — for callers that have the tool's own
 *  slug rather than the capability it belongs to. A tool no capability gates
 *  is always allowed. */
export async function assertToolAllowed(sessionId: string, toolName: string): Promise<void> {
  const capability = capabilityForTool(toolName);
  if (!capability) return;
  await assertCapability(sessionId, capability);
}

/**
 * Changes to the business configuration belong to its owner, not to someone
 * writing in through WhatsApp or Instagram. The Eve console is persisted as
 * the `web` contact for its session before the first turn reaches a tool.
 */
export async function assertOwnerConsole(sessionId: string): Promise<void> {
  const contact = await getContactBySession(sessionId);
  if (contact?.channel === "web") return;
  throw new Error(
    "This action is only available in the business owner's web console. " +
      "Do not create or change business configuration from a customer conversation.",
  );
}
