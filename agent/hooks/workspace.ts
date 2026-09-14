import { defineHook } from "eve/hooks";
import { bindSessionWorkspace } from "../lib/workspace";

export default defineHook({
  events: {
    "session.started": async (_event, ctx) => bindSessionWorkspace(ctx),
    "turn.started": async (_event, ctx) => bindSessionWorkspace(ctx),
  },
});
