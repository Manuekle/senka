import { defineSchedule } from "eve/schedules";
import { scheduleCron } from "../../lib/schedule-cron";
import { processAllTeams } from "../../lib/team-coordinator";

export default defineSchedule({
  cron: scheduleCron("team", "* * * * *"),
  run({ waitUntil }) { waitUntil(processAllTeams()); },
});
