// The feed's pets, rendered end to end with react-dom/server: round pets
// (BloubLive, first frame) plus one personal pet per member (BloubAvatar).
// Locks three invariants compilers miss: every mounted SVG carries a unique
// mask namespace (url(#...) resolves document-wide), the avatar group ships
// the transitions.dev hover wire-up classes, and no i18n key leaks raw.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@/lib/i18n/provider";
import { TeamFeed, type FeedAgent } from "@/app/(app)/runtime/_components/team-feed";
import type { TeamState } from "@/lib/team-types";

const agents: FeedAgent[] = [
  { id: "ag-recepcion", name: "Recepción", description: "Atiende WhatsApp", iconKey: "receptionist" },
  { id: "ag-calificador", name: "Calificador", description: "Califica", iconKey: "leadQualifier" },
  { id: "ag-seguimiento", name: "Seguimiento", description: "Ventas", iconKey: "salesFollowUp" },
  { id: "ag-analista", name: "Analista", description: "Métricas" },
];

const team: TeamState = {
  mode: "auto", enabled: true,
  agentIds: agents.map((a) => a.id),
  dailyLimit: 20, day: "2026-09-17", calls: 6,   droppedEvents: 0,
  memory: [
    { agentId: "ag-seguimiento", text: "Lucía: suministro activo." },
    // Same agent twice on purpose: memory keys must stay unique (regression:
    // duplicate `ag-seguimiento` key crashed /working with seeded data).
    { agentId: "ag-seguimiento", text: "Grupo Prisma revisa propuesta." },
  ],
  events: [
    {
      id: "ev-old", at: "2026-09-16T10:00:00.000Z", status: "completed",
      participants: agents.map((a) => a.id), attempts: 0,
      changes: [{ kind: "contact", id: "ct-1", before: null, after: "{\"name\":\"Marta Rojas\",\"status\":\"open\"}" }],
      messages: [
        {
          id: "m-1", agentId: "ag-recepcion", agentName: "Recepción", at: "2026-09-16T10:00:00.000Z",
          text: "Marta confirmó el surtido.",
          actions: [{ type: "contact_note", targetId: "ct-1", targetName: "Marta Rojas", value: "Cliente mensual.", status: "done" }],
        },
      ],
    },
    {
      id: "ev-now", at: "2026-09-17T20:00:00.000Z", status: "running",
      participants: agents.map((a) => a.id), attempts: 1,
      changes: [{ kind: "contact", id: "ct-2", before: null, after: "{\"name\":\"Sofía Vargas\",\"status\":\"open\"}" }],
      messages: [
        { id: "m-2", agentId: "ag-recepcion", agentName: "Recepción", at: "2026-09-17T20:00:00.000Z", text: "Sofía pregunta por masa madre." },
        { id: "m-3", agentId: "ag-calificador", agentName: "Calificador", at: "2026-09-17T20:10:00.000Z", text: "La trato como lead." },
      ],
    },
  ],
};

describe("team feed pets", () => {
  it("mounts round + member pets with unique namespaces, hover group and resolved i18n", () => {
    // NOTE: React only warns about duplicate keys in the browser (Next error
    // overlay) — SSR stays silent. The double `ag-seguimiento` memory entry
    // above pins the regression fixture anyway; the unique
    // `${agentId}-${index}` key in TeamFeed is what keeps /working alive.
    const html = renderToStaticMarkup(h(I18nProvider, null, h(TeamFeed, { team, agents })));
    // Round pets (live, first frame) + personal pets per member, stack and
    // rows: every mask id unique so no url(#...) collides document-wide.
    const masks = [...html.matchAll(/<mask\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]!);
    expect(masks.length).toBeGreaterThan(0);
    expect(new Set(masks).size).toBe(masks.length);
    for (const id of masks) expect(html, `url(#${id}) resolve`).toContain(`url(#${id})`);
    // Avatar group hover physics (transitions.dev): group class plus one
    // hover item per stacked pet.
    expect(html).toContain("t-avatar-group");
    expect(html).toContain("t-avatar");
    // The done action renders its quoted value; no raw dictionary keys leak.
    expect(html).toContain("Cliente mensual.");
    expect(html).not.toMatch(/"agentTeam\.[a-z.]+"/);
    // Round pets paint by status: completed green, running blue.
    expect(html).toContain("--bot-ink:#3ecf8e");
    expect(html).toContain("--bot-ink:#3b93f0");
  });
});
