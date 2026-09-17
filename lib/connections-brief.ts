import type { ConnectionStatus, ManualConnectionSummary, OAuthConnectionSummary } from "./connection-store";

// What this installation can actually reach, as the model needs to read it.
//
// The Connections page knows which accounts are connected; the agent did not.
// It had a list of tools and no idea which of them had anything behind them,
// so it answered "haceme un informe SEO" by asking the owner to invite it to
// Search Console by email — on an install where Google was already connected
// with the Search Console permission. The model cannot call `operations` to
// find out about a capability it does not know to look for.
//
// So the live state goes into the prompt every turn in the owner's console:
// one line per integration, what it unlocks, and which tool uses it. Names and
// statuses only — never a token, a key, or a masked preview.
//
// Pure on purpose: agent/instructions/connections.ts gathers the inputs, this
// only formats them, and the test pins the wording the model routes on.

export type BriefInput = {
  readonly oauth: readonly Pick<OAuthConnectionSummary, "id" | "label" | "status" | "accountLabel">[];
  readonly manual: readonly Pick<ManualConnectionSummary, "id" | "label" | "configured">[];
  /** Whether the connected Google grant includes Search Console. */
  readonly googleSearchConsole: boolean;
  readonly googleServiceAccount: boolean;
  readonly channels: { readonly whatsapp: boolean; readonly instagram: boolean };
  readonly mcpServers: readonly { readonly name: string; readonly slug: string; readonly description?: string }[];
  readonly httpAllowlist: readonly string[];
};

const OAUTH_UNLOCKS: Record<string, string> = {
  google:
    "Google Calendar (`calendar`), Google Sheets (`log_to_sheet`), Search Console (`seo`), " +
    "and the Drive/Gmail APIs through `http_request` on googleapis.com (auth is automatic)",
  hubspot: "HubSpot CRM contacts through `http_request` on api.hubapi.com (auth is automatic)",
  slack: "Slack messages through `http_request` on slack.com/api (auth is automatic)",
  notion: "Notion pages and databases through `http_request` on api.notion.com (auth is automatic)",
  salesforce: "Salesforce leads and contacts through `http_request` on the org's salesforce.com host",
};

const MANUAL_UNLOCKS: Record<string, string> = {
  shopify: "customer orders (`shopify_orders`)",
  mercadopago: "payment links (`send_payment_link`)",
  stripe: "payment links (`send_payment_link`)",
  meta: "Meta ad campaigns and lead forms (`marketing action=ads`)",
  elevenlabs: "voice agents and spoken audio (`generate_media` type=audio)",
  twilio: "phone numbers and SMS (Números page)",
  smtp: "sending email from automations and email templates",
  resend: "sending email from automations and email templates",
  anthropic: "Anthropic models with the owner's own key",
  openai: "OpenAI models with the owner's own key",
  gemini: "Google Gemini models with the owner's own key",
  "ai-gateway": "models through the Vercel AI Gateway",
};

const STATUS_WORDS: Record<ConnectionStatus, string> = {
  connected: "CONNECTED",
  disconnected: "not connected",
  needs_reconnect: "NEEDS RECONNECT (token expired or revoked)",
  unavailable: "not offered on this install (its OAuth app is not configured in Settings)",
};

export function formatConnectionsBrief(input: BriefInput): string {
  const lines: string[] = [
    "# What this installation has connected (live, read this turn)",
    "",
    "This is the truth about which integrations work right now. Use it before",
    "answering what you can or cannot do, and before asking the owner for access.",
    "",
    "## Accounts (Conexiones page, one-click sign-in)",
  ];

  for (const row of input.oauth) {
    const account = row.accountLabel ? ` as ${row.accountLabel}` : "";
    let line = `- **${row.label}** — ${STATUS_WORDS[row.status]}${row.status === "connected" ? account : ""}`;
    const unlocks = OAUTH_UNLOCKS[row.id];
    if (unlocks) line += `. ${row.status === "connected" ? "Gives you" : "Would give you"}: ${unlocks}`;
    if (row.id === "google" && row.status === "connected" && !input.googleSearchConsole) {
      line +=
        ". Search Console is NOT granted on this grant (it was connected before the app asked for it): " +
        "the owner must reconnect Google in Conexiones for `seo` to work";
    }
    if (row.id === "google" && row.status !== "connected" && input.googleServiceAccount) {
      line +=
        ". A Google service account is configured, so Calendar, Sheets and (if that service account " +
        "was added to the property) Search Console still work";
    }
    lines.push(`${line}.`);
  }

  lines.push("", "## Keys (Conexiones page → card → Configurar)");
  for (const row of input.manual) {
    const unlocks = MANUAL_UNLOCKS[row.id];
    lines.push(
      `- **${row.label}** — ${row.configured ? "CONFIGURED" : "not configured"}${unlocks ? `: ${unlocks}` : ""}.`,
    );
  }

  lines.push(
    "",
    "## Channels",
    "- Web chat (this console) — always on.",
    `- WhatsApp — ${input.channels.whatsapp ? "CONNECTED" : "not connected (Configuración → WhatsApp)"}.`,
    `- Instagram DMs — ${input.channels.instagram ? "CONNECTED" : "not connected (Configuración → Instagram)"}.`,
  );

  lines.push("", "## MCP servers (Conexiones → MCP)");
  if (input.mcpServers.length === 0) {
    lines.push("- None connected.");
  } else {
    for (const server of input.mcpServers) {
      const description = server.description ? ` — ${server.description}` : "";
      lines.push(`- **${server.name}** → tool \`mcp_${server.slug}\`${description}.`);
    }
  }

  lines.push(
    "",
    "## Extra HTTP hosts (Configuración → HTTP_ALLOWLIST)",
    input.httpAllowlist.length > 0
      ? `- \`http_request\` may also call: ${input.httpAllowlist.join(", ")}.`
      : "- None beyond the connected accounts above.",
    "",
    "## How to use this",
    "",
    "- **Connected means use it.** Do not ask permission to read data the owner",
    "  already connected, and do not offer an inferior path (CSV exports, pasting",
    "  numbers) when the connection is there.",
    "- **Not connected means say exactly how.** Name the integration and the click:",
    '  "conectá Google en Conexiones y lo leo directamente". It is one step for them.',
    "- **Never** ask to be invited by email, for a password, an API key or a token",
    "  in chat. Access is always granted through the Conexiones page, never to you.",
    "- If a connected tool still fails, report its error as-is and point to the",
    "  page that fixes it — do not claim the data does not exist.",
  );

  return lines.join("\n");
}
