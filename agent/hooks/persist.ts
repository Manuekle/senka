import { defineHook } from "eve/hooks";
import { channelFromKind, recordChatMessage, startChatSession } from "../../lib/business-store";
import { bindSessionWorkspace } from "../lib/workspace";

/** Keep the full reply in the transcript; only the history preview is clipped. */
function fullText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "content" in value) {
    const content = (value as { content?: unknown }).content;
    if (typeof content === "string") return content;
  }
  return "";
}

export default defineHook({
  events: {
    async "session.started"(_event, ctx) {
      await bindSessionWorkspace(ctx);
      try {
        const channel = channelFromKind(ctx.channel.kind);
        const principalId = ctx.session.auth.current?.principalId;
        await startChatSession({
          sessionId: ctx.session.id,
          channel,
          ...(channel === "whatsapp" && principalId ? { phone: principalId } : {}),
          ...(channel === "instagram" && principalId ? { externalId: principalId } : {}),
        });
      } catch {
        // Persistence must never fail a turn.
      }
    },
    async "message.received"(event, ctx) {
      try {
        await recordChatMessage({
          sessionId: ctx.session.id,
          channel: channelFromKind(ctx.channel.kind),
          role: "user",
          content: fullText(event.data.message),
        });
      } catch {
        // Persistence must never fail a turn.
      }
    },
    async "message.completed"(event, ctx) {
      try {
        await recordChatMessage({
          sessionId: ctx.session.id,
          channel: channelFromKind(ctx.channel.kind),
          role: "assistant",
          content: fullText(event.data.message),
        });
      } catch {
        // Persistence must never fail a turn.
      }
    },
  },
});
