// Next.js server startup.
//
// One job: under `next dev`, run the autonomous team on a timer, because
// `eve dev` never fires schedules (see lib/team-dev-ticker.ts). Production
// builds leave it to agent/schedules/team.ts, which Vercel Cron and
// `eve start` do run.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "development") return;
  const { startDevTeamTicker } = await import("./lib/team-dev-ticker");
  startDevTeamTicker();
}
