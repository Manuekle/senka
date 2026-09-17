// The team conversation, full screen.
//
// The config — mode, participants, daily limit — lives in /runtime's team tab;
// this page is only the conversation, laid out the way /calendar is: no page
// padding, no floating card — the feed's own surfaces are divided by hairlines
// and reach every edge under the shell. Same TeamFeed the /dev fixture looks
// at, wired to the real /api/team data.

import { TeamPanel } from "@/app/(app)/runtime/_components/team-panel";

export default function WorkingPage() {
  return (
    <div className="content-enter flex h-full min-h-0 w-full flex-col overflow-hidden">
      <TeamPanel feedOnly fill />
    </div>
  );
}



