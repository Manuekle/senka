import { processAllTeams } from "./team-coordinator";

// Development stand-in for agent/schedules/team.ts: same work, same cadence,
// inside the `next dev` process.
//
// Eve fires schedules on their cron on Vercel and under `eve start`, but
// `eve dev` never does (node_modules/eve/docs/schedules.mdx). Without this a
// local install shows a team that never speaks unless someone dispatches the
// schedule by hand. The coordinator's leases make it safe to run alongside
// such a dispatch. Every tick can spend AI credits, so `STEVE_DEV_TEAM_TICK=0`
// turns it off.

const TICK_MS = 60_000;
/** Let the dev server finish compiling before the first provider call. */
const FIRST_TICK_MS = 15_000;
const HANDLE = Symbol.for("steve.devTeamTicker");

type TickerGlobal = typeof globalThis & { [HANDLE]?: ReturnType<typeof setInterval> };

export function startDevTeamTicker(): void {
  const scope = globalThis as TickerGlobal;
  // A module reload re-runs registration; one timer per process is the point.
  if (scope[HANDLE] || process.env.STEVE_DEV_TEAM_TICK === "0" || !process.env.WORKFLOW_POSTGRES_URL) return;

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processAllTeams();
    } catch (error) {
      console.error("[team] dev tick failed", error);
    } finally {
      running = false;
    }
  };

  scope[HANDLE] = setInterval(() => void tick(), TICK_MS);
  scope[HANDLE].unref();
  setTimeout(() => void tick(), FIRST_TICK_MS).unref();
}
