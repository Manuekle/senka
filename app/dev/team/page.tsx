"use client";

// The autonomous team's feed with fixture rounds.
//
// The real feed needs PostgreSQL, a running schedule and model credits before a
// single message exists, so this is where the spectator view gets looked at.
// "Siguiente turno" plays the coordinator: the agent that is writing replies,
// with the actions it took, the way the next poll would deliver it.
//
// Rendered after mount only: the fixture is stamped relative to now and printed
// with the viewer's clock, which a server render would disagree with.

import { useState, useSyncExternalStore } from "react";
import { TeamFeed, type FeedAgent } from "@/app/(app)/runtime/_components/team-feed";
import { Button } from "@/components/ui/button";
import { emptyTeam, type TeamAction, type TeamEvent, type TeamState } from "@/lib/team-types";

const AGENTS: FeedAgent[] = [
  { id: "ag-recepcion", name: "Recepción", description: "Atiende WhatsApp", iconKey: "receptionist" },
  { id: "ag-calificador", name: "Calificador", description: "Califica leads", iconKey: "leadQualifier" },
  { id: "ag-seguimiento", name: "Seguimiento", description: "Ventas", iconKey: "salesFollowUp" },
  { id: "ag-analista", name: "Analista", description: "Métricas" },
];

const REPLIES: Record<string, { text: string; actions: TeamAction[] }> = {
  "ag-seguimiento": {
    text: "Pasé la oportunidad a propuesta y dejé anotado ofrecer el descuento anual solo si pregunta por precio.",
    actions: [
      { type: "deal_stage", targetId: "dl-lucia", targetName: "Plan anual — Lucía Fernández", value: "proposal", previous: "qualified", status: "done" },
      { type: "deal_note", targetId: "dl-lucia", targetName: "Plan anual — Lucía Fernández", value: "Descuento anual solo si pregunta por precio.", status: "done" },
    ],
  },
  "ag-analista": {
    text: "Es el tercer lead de Instagram esta semana con ticket anual. Lo registro como atributo para medir el canal.",
    actions: [
      { type: "contact_attribute", targetId: "ct-lucia", targetName: "Lucía Fernández", key: "canal_origen", value: "Instagram", status: "done" },
      { type: "deal_stage", targetId: "dl-lucia", targetName: "Plan anual — Lucía Fernández", value: "won", status: "skipped", reason: "invalid" },
    ],
  },
};

const noSubscribe = () => () => {};

function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function contact(name: string, status: string) {
  return JSON.stringify({ name, status, notes: "", attributes: {} });
}

function fixture(): TeamState {
  const ids = AGENTS.map((agent) => agent.id);
  const events: TeamEvent[] = [
    {
      id: "ev-4", at: ago(3), status: "running", participants: ids, attempts: 1,
      changes: [
        { kind: "contact", id: "ct-lucia", before: null, after: contact("Lucía Fernández", "open") },
        { kind: "deal", id: "dl-lucia", before: null, after: JSON.stringify({ title: "Plan anual — Lucía Fernández", stage: "lead", value: 480 }) },
      ],
      messages: [
        {
          id: "m-41", agentId: "ag-recepcion", agentName: "Recepción", at: ago(2),
          text: "Lucía llegó por Instagram preguntando por el plan anual. Dejé su interés anotado en el contacto.",
          actions: [{ type: "contact_note", targetId: "ct-lucia", targetName: "Lucía Fernández", value: "Consulta por plan anual para un equipo de 8.", status: "done" }],
        },
        {
          id: "m-42", agentId: "ag-calificador", agentName: "Calificador", at: ago(1),
          text: "Coincide con el perfil ideal: equipo de 8 personas y presupuesto confirmado.\nLa califico y la dejo esperando a una persona para cerrar la fecha de inicio.",
          actions: [
            { type: "deal_stage", targetId: "dl-lucia", targetName: "Plan anual — Lucía Fernández", value: "qualified", previous: "lead", status: "done" },
            { type: "contact_status", targetId: "ct-lucia", targetName: "Lucía Fernández", value: "waiting_human", previous: "open", status: "done" },
          ],
        },
      ],
    },
    {
      id: "ev-3", at: ago(95), status: "completed", participants: ids.slice(0, 3), attempts: 0,
      changes: [{ kind: "contact", id: "ct-martin", before: contact("Martín Ruiz", "followup_due"), after: contact("Martín Ruiz", "closed") }],
      messages: [
        { id: "m-31", agentId: "ag-recepcion", agentName: "Recepción", at: ago(94), text: "Martín pagó el link de Mercado Pago; el pago lo marcó como pagado." },
        {
          id: "m-32", agentId: "ag-calificador", agentName: "Calificador", at: ago(93), text: "Cierre en 4 días desde el primer contacto. No hay nada más que mover.",
          actions: [{ type: "contact_status", targetId: "ct-martin", targetName: "Martín Ruiz", value: "followup_due", status: "skipped", reason: "closed" }],
        },
        { id: "m-33", agentId: "ag-seguimiento", agentName: "Seguimiento", at: ago(92), text: "Sin seguimiento pendiente de mi lado." },
      ],
    },
    {
      id: "ev-2", at: ago(60 * 26), status: "failed", participants: ids.slice(1), attempts: 3, error: "credits_exhausted",
      changes: [{ kind: "agent", id: "ag-seguimiento", before: JSON.stringify({ name: "Seguimiento", status: "paused" }), after: JSON.stringify({ name: "Seguimiento", status: "active" }) }],
      messages: [
        { id: "m-21", agentId: "ag-calificador", agentName: "Calificador", at: ago(60 * 26 - 1), text: "Seguimiento volvió a estar activo; le quedan los 3 leads tibios de la semana." },
      ],
    },
    {
      id: "ev-1", at: ago(60 * 24 * 9), status: "queued", participants: ids, attempts: 0,
      changes: [{ kind: "deal", id: "dl-old", before: null, after: JSON.stringify({ title: "Renovación — Estudio Norte" }) }],
      messages: [],
    },
  ];
  return {
    ...emptyTeam(), mode: "auto", enabled: true, agentIds: ids, events,
    memory: [
      { agentId: "ag-recepcion", text: "Lucía Fernández: lead de Instagram, interesada en plan anual." },
      { agentId: "ag-calificador", text: "Prioridad alta para equipos de más de 5 personas con presupuesto confirmado." },
      { agentId: "ag-seguimiento", text: "Propuesta pendiente: descuento anual para Lucía solo si pregunta por precio." },
    ],
  };
}

export default function TeamFeedDevPage() {
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [team, setTeam] = useState<TeamState>(fixture);

  const nextTurn = () => setTeam((current) => {
    const events = current.events.map((event) => {
      if (event.status !== "running") return event;
      const next = event.participants.find((id) => !event.messages.some((m) => m.agentId === id));
      if (!next) return { ...event, status: "completed" as const };
      const agent = AGENTS.find((a) => a.id === next)!;
      const reply = REPLIES[next] ?? { text: "Sin novedades de mi lado.", actions: [] };
      const messages = [...event.messages, {
        id: `m-${Date.now()}`, agentId: next, agentName: agent.name, at: new Date().toISOString(),
        text: reply.text, ...(reply.actions.length ? { actions: reply.actions } : {}),
      }];
      const done = event.participants.every((id) => messages.some((m) => m.agentId === id));
      return { ...event, messages, status: done ? ("completed" as const) : event.status };
    });
    return { ...current, events };
  });

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Equipo autónomo · fixture</h1>
          <p className="mt-1 text-sm text-muted-foreground">TeamFeed con rondas y acciones de ejemplo, sin PostgreSQL ni créditos.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTeam(fixture())}>Reiniciar</Button>
          <Button onClick={nextTurn}>Siguiente turno</Button>
        </div>
      </header>
      {mounted ? <TeamFeed team={team} agents={AGENTS} /> : null}
    </main>
  );
}
