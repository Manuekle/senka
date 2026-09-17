"use client";

// The autonomous team's feed, played as a live broadcast.
//
// The real feed needs PostgreSQL, a running schedule and model credits before a
// single message exists, so this is where the spectator view gets looked at —
// at full size, the way /working shows it. Play runs the round on its own: a
// change lands, each agent's "writing" row appears, the reply types itself in
// word by word, and the next agent takes the floor — the same beats the real
// poll would deliver, at the pace a spectator can follow.
//
// Rendered after mount only: the fixture is stamped relative to now and printed
// with the viewer's clock, which a server render would disagree with.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { PauseIcon, PlayIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import { TeamFeed, type FeedAgent } from "@/app/(app)/runtime/_components/team-feed";
import { Button } from "@/components/ui/button";
import { emptyTeam, type TeamAction, type TeamEvent, type TeamState } from "@/lib/team-types";

const AGENTS: FeedAgent[] = [
  { id: "ag-recepcion", name: "Recepción", description: "Atiende WhatsApp", iconKey: "receptionist" },
  { id: "ag-calificador", name: "Calificador", description: "Califica leads", iconKey: "leadQualifier" },
  { id: "ag-seguimiento", name: "Seguimiento", description: "Ventas", iconKey: "salesFollowUp" },
  { id: "ag-analista", name: "Analista", description: "Métricas" },
];

// Roughly one beat of pause per handful of words when a reply is typing itself
// in — the pace LiveText draws at, used here so the next speaker waits for the
// text to be read rather than for a fixed timer that ignores how long the
// reply is.
const WORDS_PER_BEAT = 20;
const BEAT_MS = 2600;

const REPLIES: Record<string, { text: string; actions: TeamAction[] }[]> = {
  "ag-recepcion": [{
    text: "Entró una consulta nueva por el plan anual desde Instagram; quedó registrada en el contacto con el interés anotado.",
    actions: [
      { type: "contact_note", targetId: "ct-lucia", targetName: "Lucía Fernández", value: "Consulta por plan anual para un equipo de 8.", status: "done" },
    ],
  }, {
    text: "Segunda consulta del día, esta vez por WhatsApp: preguntan si el plan cubre a todo el equipo de una vez.",
    actions: [],
  }],
  "ag-calificador": [{
    text: "Equipo de 8 con presupuesto confirmado: encaja en el perfil ideal, se lo paso a Seguimiento.",
    actions: [
      { type: "contact_attribute", targetId: "ct-lucia", targetName: "Lucía Fernández", key: "presupuesto", value: "confirmado", status: "done" },
    ],
  }, {
    text: "Ese contacto de WhatsApp no deja datos de empresa todavía; lo dejo tibio para un toque nuestro mañana.",
    actions: [],
  }],
  "ag-seguimiento": [{
    text: "Pasé la oportunidad a propuesta y dejé anotado ofrecer el descuento anual solo si pregunta por precio.",
    actions: [
      { type: "deal_stage", targetId: "dl-lucia", targetName: "Plan anual — Lucía Fernández", value: "proposal", previous: "qualified", status: "done" },
      { type: "deal_note", targetId: "dl-lucia", targetName: "Plan anual — Lucía Fernández", value: "Descuento anual solo si pregunta por precio.", status: "done" },
    ],
  }, {
    text: "La propuesta de Lucía ya está enviada; agendo el toque de seguimiento para el jueves.",
    actions: [
      { type: "deal_stage", targetId: "dl-lucia", targetName: "Plan anual — Lucía Fernández", value: "negotiation", previous: "proposal", status: "done" },
    ],
  }],
  "ag-analista": [{
    text: "Es el tercer lead de Instagram esta semana con ticket anual. Lo registro como atributo para medir el canal.",
    actions: [
      { type: "contact_attribute", targetId: "ct-lucia", targetName: "Lucía Fernández", key: "canal_origen", value: "Instagram", status: "done" },
      { type: "deal_stage", targetId: "dl-lucia", targetName: "Plan anual — Lucía Fernández", value: "won", status: "skipped", reason: "invalid" },
    ],
  }, {
    text: "El canal Instagram va primero en ticket anual este mes; lo dejo medido para el reporte del viernes.",
    actions: [],
  }],
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
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Per-agent cursors into each reply pool, so every agent advances through
   *  its own lines across rounds instead of repeating one script. */
  const replyIndex = useRef<Record<string, number>>({});

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // `?autoplay` starts the broadcast on load: a dev deep link so the page can
  // be opened already running (and so automated checks can reach the loop).
  useEffect(() => {
    // Opening the page with the param is the event; this is a one-shot
    // starter, not state derived from props, so it runs once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (new URLSearchParams(window.location.search).has("autoplay")) setPlaying(true);
  }, []);

  /** One beat of the broadcast: the next expected speaker of the running round
   *  posts its reply (each agent rotates through its own pool), the round
   *  completes when everyone has spoken, and a fresh round starts soon after —
   *  the way the next poll would deliver it. */
  const nextTurn = useCallback(() => {
    setTeam((current) => {
      const events = current.events.map((event) => {
        if (event.status !== "running") return event;
        const next = event.participants.find((id) => !event.messages.some((m) => m.agentId === id));
        if (!next) return { ...event, status: "completed" as const };
        const agent = AGENTS.find((a) => a.id === next)!;
        const pool = REPLIES[next] ?? [{ text: "Sin novedades de mi lado.", actions: [] }];
        const at = replyIndex.current[next] ?? 0;
        const reply = pool[at % pool.length];
        replyIndex.current[next] = at + 1;
        const messages = [...event.messages, {
          id: `m-${Date.now()}`, agentId: next, agentName: agent.name, at: new Date().toISOString(),
          text: reply.text, ...(reply.actions.length ? { actions: reply.actions } : {}),
        }];
        // The last speaker's reply stays `running` while it types; the next
        // beat finds no pending speaker and only then marks the round done.
        return { ...event, messages };
      });
      // A live broadcast does not stop at one round: when the running round has
      // settled (the completion beat above), a new change comes in and the next
      // round starts at the top, with the finished conversation kept below as
      // history the way the real feed archives past rounds.
      const [newest, ...rest] = events;
      if (newest?.status === "completed" && rest.every((event) => event.status !== "running")) {
        events.unshift({
          id: `ev-${Date.now()}`, at: new Date().toISOString(), status: "running",
          participants: newest.participants, attempts: newest.attempts, changes: [
            { kind: "deal", id: `dl-${Date.now()}`, before: null, after: JSON.stringify({ title: "Seguimiento — Plan anual", stage: "lead", value: 480 }) },
          ],
          messages: [],
        });
        if (events.length > 6) events.length = 6;
      }
      return { ...current, events };
    });
  }, []);

  /** The autoplay loop: wait for the previous reply to finish typing (roughly
   *  a beat per WORDS_PER_BEAT words), then post the next one. Pausing clears
   *  the timer; play resumes the loop on its own without forcing a turn. */
  useEffect(() => {
    if (!playing) return undefined;
    const words = team.events[0]?.messages.at(-1)?.text.split(/\s+/).length ?? 0;
    const step = () => { nextTurn(); schedule(); };
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(step, Math.round(BEAT_MS + (words / WORDS_PER_BEAT) * BEAT_MS));
    };
    schedule();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [playing, team, nextTurn]);

  return (
    <div className="page-enter relative flex h-full min-h-0 w-full flex-col p-4 sm:p-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Equipo autónomo · simulación</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Ronda en vivo a tamaño completo: los agentes escriben en streaming, sin PostgreSQL ni créditos.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setPlaying(false); setTeam(fixture()); }}>
            <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.75} />
            Reiniciar
          </Button>
          <Button onClick={() => setPlaying((on) => !on)}>
            <HugeiconsIcon icon={playing ? PauseIcon : PlayIcon} size={14} strokeWidth={1.75} />
            {playing ? "Pausar" : "Reproducir"}
          </Button>
        </div>
      </header>
      {mounted ? (
        <div className="min-h-0 flex-1">
          <TeamFeed team={team} agents={AGENTS} fill />
        </div>
      ) : null}
    </div>
  );
}
