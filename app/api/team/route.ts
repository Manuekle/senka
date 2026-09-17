import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, withApiErrors } from "@/lib/api-error";
import { listAgents, readTeamState, updateTeamState } from "@/lib/business-store";
import { activeBusinessId } from "@/lib/business-scope";
import { isAutoTeam, syncAutoTeam, type TeamState } from "@/lib/team-types";
import type { Agent } from "@/lib/types";
import { requireOwner } from "@/lib/owner-gate";

/** An automatic team follows the active agents. Opening the page applies that
 *  straight away instead of leaving it to the next schedule tick; a database
 *  hiccup here only delays it, it never fails the read. */
async function syncedTeam(team: TeamState, agents: Agent[]): Promise<TeamState> {
  if (!process.env.WORKFLOW_POSTGRES_URL || !isAutoTeam(team) || !syncAutoTeam(structuredClone(team), agents)) return team;
  try {
    return await updateTeamState((current, fresh) => {
      syncAutoTeam(current, fresh);
      return structuredClone(current);
    });
  } catch {
    return team;
  }
}

export const GET = withApiErrors(async () => {
  const [stored, agents, workspaceId] = await Promise.all([readTeamState(), listAgents(), activeBusinessId()]);
  const team = await syncedTeam(stored, agents);
  return NextResponse.json({
    team: { ...team, events: team.events.slice(-100).reverse() }, workspaceId,
    agents: agents.filter((agent) => agent.status === "active").map(({ id, name, description, iconKey }) => ({ id, name, description, iconKey })),
    configured: Boolean(process.env.WORKFLOW_POSTGRES_URL),
    auto: isAutoTeam(team),
  });
});

const settings = z.object({
  enabled: z.boolean(),
  agentIds: z.array(z.string().min(1).max(100)).max(6),
  dailyLimit: z.number().int().min(1).max(100),
  mode: z.enum(["auto", "manual"]).default("manual"),
});
export const PUT = withApiErrors(async (request: NextRequest) => {
  // Who is on the team decides which agents may act on the shared inbox —
  // an account-level capability, so an account-level gate.
  const denied = await requireOwner(request);
  if (denied) return denied;

  const parsed = settings.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("invalid_body");
  const value = parsed.data;
  if (!process.env.WORKFLOW_POSTGRES_URL) return apiError("not_configured", { status: 503 });
  const saved = await updateTeamState((team, agents) => {
    if (value.mode === "auto") {
      team.mode = "auto";
      team.dailyLimit = value.dailyLimit;
      syncAutoTeam(team, agents);
      return true;
    }
    const ids = [...new Set(value.agentIds)];
    if (value.enabled && (ids.length < 2 || !ids.every((id) => agents.some((a) => a.id === id && a.status === "active")))) return false;
    team.mode = "manual";
    team.enabled = value.enabled;
    team.agentIds = ids;
    team.dailyLimit = value.dailyLimit;
    return true;
  });
  if (!saved) return apiError("invalid_field", { field: "agentIds" });
  return NextResponse.json({ saved: true });
});
