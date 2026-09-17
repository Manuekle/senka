import { describe, expect, it } from "vitest";
import { formatConnectionsBrief, type BriefInput } from "./connections-brief";

const base: BriefInput = {
  oauth: [
    { id: "google", label: "Google", status: "connected", accountLabel: "dueño@gym.example" },
    { id: "hubspot", label: "HubSpot", status: "disconnected" },
    { id: "slack", label: "Slack", status: "unavailable" },
  ],
  manual: [
    { id: "shopify", label: "Shopify", configured: true },
    { id: "stripe", label: "Stripe", configured: false },
  ],
  googleSearchConsole: true,
  googleServiceAccount: false,
  channels: { whatsapp: true, instagram: false },
  mcpServers: [{ name: "Notion MCP", slug: "notion_mcp", description: "Docs del equipo" }],
  httpAllowlist: ["api.example.com"],
};

describe("formatConnectionsBrief", () => {
  it("names each integration's status and the tool that uses it", () => {
    const brief = formatConnectionsBrief(base);
    expect(brief).toContain("**Google** — CONNECTED as dueño@gym.example");
    expect(brief).toContain("Search Console (`seo`)");
    expect(brief).toContain("**HubSpot** — not connected. Would give you");
    expect(brief).toContain("**Slack** — not offered on this install");
    expect(brief).toContain("**Shopify** — CONFIGURED: customer orders (`shopify_orders`)");
    expect(brief).toContain("**Stripe** — not configured");
    expect(brief).toContain("WhatsApp — CONNECTED");
    expect(brief).toContain("Instagram DMs — not connected");
    expect(brief).toContain("tool `mcp_notion_mcp` — Docs del equipo");
    expect(brief).toContain("api.example.com");
  });

  it("flags a Google grant that predates the Search Console permission", () => {
    const brief = formatConnectionsBrief({ ...base, googleSearchConsole: false });
    expect(brief).toContain("Search Console is NOT granted");
    expect(brief).toContain("reconnect Google in Conexiones");
  });

  it("tells the model never to ask for invitations or secrets", () => {
    const brief = formatConnectionsBrief(base);
    expect(brief).toMatch(/Never\*\* ask to be invited by email/);
  });

  it("never prints an account label for an integration that is not connected", () => {
    const brief = formatConnectionsBrief({
      ...base,
      oauth: [{ id: "google", label: "Google", status: "needs_reconnect", accountLabel: "old@gym.example" }],
    });
    expect(brief).not.toContain("old@gym.example");
    expect(brief).toContain("NEEDS RECONNECT");
  });
});
