"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { MessageResponse } from "@/components/ai-elements/message-response";
import { AgentLoading } from "@/app/_components/chat/agent-loading";
import { ChartArtifact } from "@/app/_components/chat/artifacts/chart-artifact";
import { ReportArtifact } from "@/app/_components/chat/artifacts/report-artifact";
import type { ChartSpec, ReportSpec } from "@/lib/artifacts";
import type { EveDynamicToolPart } from "eve/react";
import { InputRequestCard } from "@/app/_components/chat/input-request-card";

/**
 * Every shape the agent can draw in `/chat`, on one page.
 *
 * The artifacts only appear in the product at the end of a real turn: a model
 * call, a tool call, and whatever the model decided to pass. That is a slow and
 * non-deterministic way to find out that a pie with seven slices overflows its
 * legend, or that a two-series bar chart is unreadable in dark mode — and it
 * costs a model call per look.
 *
 * So this renders the same components against fixtures that deliberately
 * include the awkward cases: negative values, a long category label, twenty-six
 * buckets on an axis with room for nine, four series at once, a Mermaid diagram
 * the fallback renderer has to catch. Flip the theme with the app's own toggle
 * and both palettes are checkable side by side.
 *
 * Dev only — /dev 404s in production (see `app/dev/layout.tsx`).
 */

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep"];

const SALES: ChartSpec = {
  currency: "ARS",
  format: "currency",
  kind: "column",
  note: "Marzo y julio concentran el 41 % del año. Los dos coinciden con campañas de Meta activas.",
  series: [
    {
      name: "Ganado",
      points: MONTHS.map((label, index) => ({
        label,
        value: [820_000, 640_000, 1_480_000, 910_000, 760_000, 1_020_000, 1_390_000, 540_000, 980_000][
          index
        ]!,
      })),
    },
  ],
  subtitle: "Enero–Septiembre 2026 · deals en estado ganado",
  title: "Ventas cerradas por mes",
};

const TREND: ChartSpec = {
  format: "number",
  kind: "line",
  note: "Los perdidos crecen desde mayo sin que caigan los abiertos: el cuello está en propuesta, no en generación.",
  series: [
    { name: "Abiertos", points: MONTHS.map((label, i) => ({ label, value: [12, 15, 19, 17, 22, 25, 24, 21, 26][i]! })) },
    { name: "Ganados", points: MONTHS.map((label, i) => ({ label, value: [4, 3, 8, 6, 5, 7, 9, 3, 6][i]! })) },
    { name: "Perdidos", points: MONTHS.map((label, i) => ({ label, value: [2, 4, 3, 5, 8, 9, 7, 10, 11][i]! })) },
  ],
  subtitle: "Conteo de deals por mes",
  title: "Movimiento del pipeline",
};

const SOURCES: ChartSpec = {
  format: "number",
  kind: "bar",
  note: "Instagram trae volumen y WhatsApp trae cierre — no son el mismo lead.",
  series: [
    {
      name: "Leads",
      points: [
        { label: "Instagram DM", value: 148 },
        { label: "WhatsApp", value: 96 },
        { label: "Formulario de presupuesto del sitio", value: 61 },
        { label: "Meta Ads — remarketing", value: 44 },
        { label: "Referidos", value: 12 },
      ],
    },
  ],
  subtitle: "Últimos 90 días",
  title: "De dónde vienen los leads",
};

const SHARE: ChartSpec = {
  currency: "USD",
  format: "currency",
  kind: "donut",
  series: [
    {
      name: "Ganado",
      points: [
        { label: "Instalación", value: 42_000 },
        { label: "Mantenimiento", value: 28_500 },
        { label: "Repuestos", value: 12_300 },
        { label: "Consultoría", value: 8_100 },
        { label: "Capacitación", value: 3_400 },
        { label: "Otros servicios", value: 2_200 },
        { label: "Envíos", value: 900 },
      ],
    },
  ],
  subtitle: "Facturado en el trimestre",
  title: "Mezcla de ingresos",
};

/** The awkward cases: values below zero, and an axis with more buckets than labels. */
const MARGIN: ChartSpec = {
  format: "percent",
  kind: "area",
  note: "Dos semanas en rojo en agosto — descuentos de liquidación aplicados por debajo del costo.",
  series: [
    {
      name: "Margen",
      points: Array.from({ length: 26 }, (_, index) => ({
        label: `S${index + 1}`,
        value: Math.round((Math.sin(index / 2.6) * 18 + 9) * 10) / 10,
      })),
    },
  ],
  subtitle: "26 semanas · el eje tiene lugar para nueve etiquetas",
  title: "Margen semanal",
};

const FOUR: ChartSpec = {
  format: "compact",
  kind: "column",
  series: [
    { name: "Instagram", points: MONTHS.slice(0, 6).map((label, i) => ({ label, value: [120, 145, 160, 138, 172, 190][i]! })) },
    { name: "WhatsApp", points: MONTHS.slice(0, 6).map((label, i) => ({ label, value: [98, 104, 88, 121, 133, 118][i]! })) },
    { name: "Web", points: MONTHS.slice(0, 6).map((label, i) => ({ label, value: [45, 52, 61, 49, 58, 72][i]! })) },
    { name: "Email", points: MONTHS.slice(0, 6).map((label, i) => ({ label, value: [22, 19, 28, 31, 24, 27][i]! })) },
  ],
  subtitle: "El techo de series — cuatro slots, legenda obligatoria",
  title: "Mensajes por canal",
};

const REPORT: ReportSpec = {
  footnote:
    "Fuente: pipeline (deals cerrados), marketing (campañas de Meta) e inbox (conversaciones clasificadas). Excluye deals sin moneda declarada.",
  kpis: [
    { label: "Facturado", tone: "positive", value: "$8,54 M", delta: "+18 % vs 2025" },
    { label: "Deals ganados", value: "51", delta: "+7" },
    { label: "Tasa de cierre", tone: "warning", value: "34 %", delta: "-6 pts" },
    { label: "Ticket promedio", value: "$167 K", delta: "+11 %" },
    { label: "Días a cierre", tone: "critical", value: "38", delta: "+9" },
    { label: "Costo por lead", value: "$4.120", delta: "-3 %" },
  ],
  period: "Enero–Septiembre 2026",
  sections: [
    {
      body:
        "El año viene **18 % arriba** del anterior en facturación, con menos deals de los que ese número sugiere: el crecimiento es de ticket, no de volumen.\n\n- Marzo y julio explican el 41 % del total\n- Los dos meses coinciden con campañas de remarketing activas\n- Agosto cayó a menos de la mitad del promedio",
      chart: SALES,
      heading: "Ventas por mes",
    },
    {
      body: "La generación de leads no bajó. Lo que empeoró es la conversión de propuesta a cierre.",
      chart: TREND,
      heading: "Dónde se pierde el pipeline",
      table: {
        columns: ["Etapa", "Entraron", "Salieron", "Conversión"],
        rows: [
          ["Lead", "418", "301", "72 %"],
          ["Calificado", "301", "184", "61 %"],
          ["Reunión", "184", "112", "61 %"],
          ["Propuesta", "112", "51", "46 %"],
          ["Negociación", "51", "51", "100 %"],
        ],
      },
    },
    {
      body: "Instagram trae el volumen; WhatsApp trae el cierre. Tratarlos igual es lo que está inflando el costo por venta.",
      chart: SOURCES,
      heading: "Origen de los leads",
    },
  ],
  subtitle: "Cierre de los primeros tres trimestres",
  summary:
    "**El año está 18 % arriba en facturación y 6 puntos abajo en tasa de cierre.** Se vende más caro y se cierra peor: el ticket promedio subió 11 % mientras el ciclo se estiró nueve días. El cuello está en la etapa de propuesta, donde se pierde el 54 % de lo que entra.\n\nLa recomendación es acortar la propuesta, no generar más leads.",
  title: "Informe comercial 2026",
};

const DIAGRAM = `Así queda el flujo de calificación que propusimos:

\`\`\`mermaid
flowchart LR
  A[Mensaje entrante] --> B{¿Ya es contacto?}
  B -->|Sí| C[Cargar historial]
  B -->|No| D[Crear contacto]
  C --> E{¿Pide precio?}
  D --> E
  E -->|Sí| F[Buscar en catálogo]
  E -->|No| G[Responder y calificar]
  F --> H[Abrir deal]
  G --> H
  H --> I{¿Pide humano?}
  I -->|Sí| J[Transferir]
  I -->|No| K[Agendar seguimiento]
\`\`\`

Y el estado en que queda cada conversación:

\`\`\`mermaid
stateDiagram-v2
  [*] --> Nuevo
  Nuevo --> Calificado
  Calificado --> Propuesta
  Propuesta --> Ganado
  Propuesta --> Perdido
  Ganado --> [*]
  Perdido --> [*]
\`\`\`
`;

/**
 * One artifact at a time, picked by the hash — `/dev/artifacts#donut`.
 *
 * A single page holding all eight would be the nicer contact sheet, and it is
 * not what these need: a chart is judged at the width it will actually be read
 * at, and stacking eight of them means judging most of them halfway down a
 * scroll, at whatever size is left. Same reason `/dev/screens` shows one
 * landing mockup at a time.
 *
 * The hash rather than component state so a particular case is a link somebody
 * can paste into a bug report, and so a reload comes back to the one being
 * looked at.
 */
const VIEWS: readonly (readonly [
  string,
  string,
  "chart" | "connecting" | "mermaid" | "question" | "report" | "restoring",
  ChartSpec | null,
])[] =
  [
    ["column", "Columnas · una serie", "chart", SALES],
    ["line", "Líneas · tres series", "chart", TREND],
    ["bar", "Barras rankeadas · etiquetas largas", "chart", SOURCES],
    ["donut", "Dona · siete categorías, la cola se pliega", "chart", SHARE],
    ["area", "Área · valores negativos, 26 buckets", "chart", MARGIN],
    ["grouped", "Columnas agrupadas · cuatro series", "chart", FOUR],
    ["report", "Informe con descarga en PDF", "report", null],
    ["mermaid", "Diagramas en el texto de la respuesta", "mermaid", null],
    ["question", "Preguntas y aprobaciones · todas las fases", "question", null],
    ["restoring", "Pantalla de carga · recuperando una conversación", "restoring", null],
    ["connecting", "Pantalla de carga · primera conexión", "connecting", null],
  ];

export default function Page() {
  const [active, setActive] = useState(VIEWS[0]![0]);

  useEffect(() => {
    const read = () => setActive(window.location.hash.slice(1) || VIEWS[0]![0]);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const view = VIEWS.find(([id]) => id === active) ?? VIEWS[0]!;
  const [, title, kind, spec] = view;

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-6 py-8">
      <header className="space-y-2">
        <h1 className="font-medium text-foreground text-xl">Artefactos del chat</h1>
        <p className="text-muted-foreground text-sm">
          Lo que <code className="rounded bg-muted px-1 py-0.5 text-xs">chart</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">report</code> y los bloques{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">mermaid</code> dibujan en /chat.
          Cambiá el tema desde la app para revisar las dos paletas.
        </p>
        <nav className="flex flex-wrap gap-1.5 pt-1">
          {VIEWS.map(([id]) => (
            <a
              className={
                id === view[0]
                  ? "rounded-md border border-input bg-accent px-2 py-1 text-foreground text-xs"
                  : "rounded-md border border-border px-2 py-1 text-muted-foreground text-xs transition-colors hover:border-input hover:text-foreground"
              }
              href={`#${id}`}
              key={id}
            >
              {id}
            </a>
          ))}
        </nav>
      </header>

      <h2 className="font-medium text-foreground text-sm">{title}</h2>
      {kind === "chart" && spec ? <ChartArtifact spec={spec} /> : null}
      {kind === "report" ? <ReportArtifact spec={REPORT} /> : null}
      {kind === "question" ? <QuestionPhases /> : null}
      {kind === "mermaid" ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <MessageResponse>{DIAGRAM}</MessageResponse>
        </div>
      ) : null}
      {/* The scene fills the viewport in the product; here it is cropped so
          the nav above it stays reachable. No frame around it — the scene has
          no edge of its own any more, and a border here would put back the
          box it was redrawn to lose. The hint line appears on its own timer,
          so leave the tab open a few seconds to see the slow state. */}
      {kind === "restoring" || kind === "connecting" ? (
        <div
          className="overflow-hidden rounded-xl"
          style={{ "--stage-height": "30rem" } as React.CSSProperties}
        >
          <AgentLoading mode={kind} />
        </div>
      ) : null}
    </main>
  );
}

// ── Questions and approvals ────────────────────────────────────────

const QUESTION_OPTIONS = [
  { id: "full", label: "Auditoría completa (técnica + contenido + keywords)" },
  { id: "gsc", label: "Solo datos de Search Console", description: "Clics, impresiones y posiciones" },
  { id: "page", label: "Solo la home" },
];

function questionPart(
  state: EveDynamicToolPart["state"],
  extra: Partial<{ allowFreeform: boolean; approval: boolean; response: { optionId?: string; text?: string } }> = {},
): EveDynamicToolPart {
  const approval = extra.approval === true;
  return {
    type: "dynamic-tool",
    toolCallId: `call-${state}-${approval ? "a" : "q"}`,
    toolName: approval ? "send_payment_link" : "ask_question",
    stepIndex: 1,
    state,
    input: approval ? { amount: 45000, currency: "ARS", description: "Plan trimestral" } : { prompt: "" },
    approval: { id: "req", ...(state === "output-denied" ? { approved: false } : {}) },
    ...(state === "output-available" ? { output: { ok: true, url: "https://mpago.la/x" } } : {}),
    toolMetadata: {
      eve: {
        kind: "tool-call",
        name: approval ? "send_payment_link" : "ask_question",
        inputRequest: approval
          ? {
              requestId: "req",
              prompt: "¿Genero el link de pago por $45.000 para Marta?",
              options: [
                { id: "approve", label: "Approve" },
                { id: "deny", label: "Deny" },
              ],
            }
          : {
              requestId: "req",
              prompt: "¿Qué tipo de informe SEO querés para gymratplus.com?",
              options: QUESTION_OPTIONS,
              allowFreeform: extra.allowFreeform ?? true,
            },
        ...(extra.response ? { inputResponse: { requestId: "req", ...extra.response } } : {}),
      },
    },
  } as EveDynamicToolPart;
}

function QuestionPhases() {
  const [answer, setAnswer] = useState<{ optionId?: string; text?: string }>();
  const noop = () => {};
  const rows: readonly [string, React.ReactNode][] = [
    [
      "Interactiva · elegí una opción (pasa a enviando)",
      <InputRequestCard
        answer={answer}
        canRespond
        key="live"
        movedOn={false}
        onInputResponses={(responses) => setAnswer({ optionId: responses[0]?.optionId, text: responses[0]?.text })}
        part={questionPart(answer ? "approval-responded" : "approval-requested")}
        toolLabel="ask_question"
      />,
    ],
    [
      "Respondida · la conversación siguió",
      <InputRequestCard answer={{ optionId: "gsc" }} canRespond key="answered" movedOn onInputResponses={noop} part={questionPart("approval-responded")} toolLabel="ask_question" />,
    ],
    [
      "Respondida con texto libre",
      <InputRequestCard answer={{ text: "Las dos cosas, pero empezá por keywords" }} canRespond key="text" movedOn onInputResponses={noop} part={questionPart("approval-responded")} toolLabel="ask_question" />,
    ],
    [
      "Cerrada · recargada sin respuesta registrada (el bug original)",
      <InputRequestCard answer={undefined} canRespond key="closed" movedOn onInputResponses={noop} part={questionPart("approval-requested")} toolLabel="ask_question" />,
    ],
    [
      "Aprobación pendiente",
      <InputRequestCard answer={undefined} canRespond key="approval" movedOn={false} onInputResponses={noop} part={questionPart("approval-requested", { approval: true })} toolLabel="send_payment_link" />,
    ],
    [
      "Aprobación aprobada y ejecutada",
      <InputRequestCard answer={{ optionId: "approve" }} canRespond key="approved" movedOn onInputResponses={noop} part={questionPart("output-available", { approval: true })} toolLabel="send_payment_link" />,
    ],
    [
      "Aprobación rechazada",
      <InputRequestCard answer={{ optionId: "deny" }} canRespond key="denied" movedOn onInputResponses={noop} part={questionPart("output-denied", { approval: true })} toolLabel="send_payment_link" />,
    ],
  ];
  return (
    <div className="space-y-6">
      {rows.map(([label, node]) => (
        <div className="space-y-1.5" key={label}>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
          {node}
        </div>
      ))}
    </div>
  );
}
