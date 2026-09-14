import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, withApiErrors } from "@/lib/api-error";
import { listAgents, readTeamState, updateTeamState } from "@/lib/business-store";
import { activeBusinessId } from "@/lib/business-scope";

export const GET = withApiErrors(async () => {
  const [team, agents, workspaceId] = await Promise.all([readTeamState(), listAgents(), activeBusinessId()]);
  return NextResponse.json({
    team: { ...team, events: team.events.slice(-100).reverse() }, workspaceId,
    agents: agents.filter((agent) => agent.status === "active").map(({ id, name, description }) => ({ id, name, description })),
    configured: Boolean(process.env.WORKFLOW_POSTGRES_URL),
  });
});

const settings = z.object({ enabled: z.boolean(), agentIds: z.array(z.string().min(1).max(100)).max(6), dailyLimit: z.number().int().min(1).max(100) });
export const PUT = withApiErrors(async (request: NextRequest) => {
  const parsed = settings.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("invalid_body");
  const value = parsed.data;
  if (!process.env.WORKFLOW_POSTGRES_URL) return apiError("not_configured", { status: 503 });
  const saved = await updateTeamState((team, agents) => {
    const ids = [...new Set(value.agentIds)];
    if (value.enabled && (ids.length < 2 || !ids.every((id) => agents.some((a) => a.id === id && a.status === "active")))) return false;
    team.enabled = value.enabled;
    team.agentIds = ids;
    team.dailyLimit = value.dailyLimit;
    return true;
  });
  if (!saved) return apiError("invalid_field", { field: "agentIds" });
  return NextResponse.json({ saved: true });
});
