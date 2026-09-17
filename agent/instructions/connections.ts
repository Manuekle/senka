import { defineDynamic, defineInstructions } from "eve/instructions";
import { isOperatorConsole } from "../../lib/operator-console";

// Live integration state for the owner's console — see lib/connections-brief.ts
// for why the model needs it in the prompt rather than behind a tool.
//
// Resolved on `turn.started`, not `session.started`: the owner connects Google
// in another tab and comes back to the same chat, and the next message has to
// know. Console-only because account labels (the connected Google email) are
// the owner's business, and a customer on WhatsApp has no use for the list.
//
// Every read is best-effort. A store that cannot be read drops its section to
// "unknown" rather than failing a turn — the agent losing this block is a
// worse answer, not an error.
export default defineDynamic({
  events: {
    "turn.started": async (_event, ctx) => {
      try {
        if (!(await isOperatorConsole(ctx.session.id))) return;

        const [
          { getConnectionSummaries },
          { connectionHasScope },
          { getCredential },
          { activeServers },
          { parseAllowlist },
          { formatConnectionsBrief },
        ] = await Promise.all([
          import("../../lib/connection-store"),
          import("../../lib/search-console"),
          import("../../lib/credentials"),
          import("../../lib/mcp-store"),
          import("../../lib/http-guard"),
          import("../../lib/connections-brief"),
        ]);

        const [summaries, searchConsole, serviceAccount, whatsappToken, whatsappPhone, instagram, servers, allowlist] =
          await Promise.all([
            getConnectionSummaries(),
            connectionHasScope().catch(() => false),
            getCredential("GOOGLE_SERVICE_ACCOUNT_JSON"),
            getCredential("WHATSAPP_ACCESS_TOKEN"),
            getCredential("WHATSAPP_PHONE_NUMBER_ID"),
            getCredential("INSTAGRAM_ACCESS_TOKEN"),
            activeServers().catch(() => []),
            getCredential("HTTP_ALLOWLIST"),
          ]);

        return defineInstructions({
          markdown: formatConnectionsBrief({
            oauth: summaries.oauth,
            manual: summaries.manual,
            googleSearchConsole: searchConsole,
            googleServiceAccount: Boolean(serviceAccount),
            channels: {
              whatsapp: Boolean(whatsappToken && whatsappPhone),
              instagram: Boolean(instagram),
            },
            mcpServers: servers.map((server) => ({
              name: server.name,
              slug: server.slug,
              description: server.description,
            })),
            httpAllowlist: parseAllowlist(allowlist),
          }),
        });
      } catch {
        return;
      }
    },
  },
});
