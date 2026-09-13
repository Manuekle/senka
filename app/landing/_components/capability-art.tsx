"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { Blockchain05Icon, Target01Icon, Tick02Icon, WebhookIcon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { at, Bloom, Brackets, Chip, Mono, Plate, Row, Scene } from "./scene-kit";
import { VoiceInstrument as VoiceScene } from "./instrument-art";
import { KnowledgeScene, HandoffScene, CalendarScene, LeadsScene, PaymentsScene } from "./capability-instruments";

export { KnowledgeScene, HandoffScene, CalendarScene, LeadsScene, PaymentsScene, VoiceScene };

// ── 07 · CRM y contactos ────────────────────────────────────────────

/**
 * A board, and a contact moving a column along it.
 *
 * Three columns is the smallest number that reads as a pipeline rather than as
 * two piles. On hover the card in the first column crosses into the second —
 * exactly one column, which is why the columns are a fixed width and the
 * travel is stated in the same unit rather than eyeballed.
 */
export function CrmScene() {
  return (
    <Scene>
      {/* Over the second column — where the card is going, not where it is. */}
      <Bloom className="top-2 left-[50%] h-28 w-32" />

      <div className="flex justify-center gap-2.5">
        {[0, 1, 2].map((column) => (
          <div
            className="flex h-[5.5rem] w-[5rem] flex-col gap-2 rounded-xl bg-[var(--lp-glass)] p-2 shadow-[inset_0_0_0_1px_var(--lp-glass-edge)]"
            key={column}
          >
            {/* Headings of different widths, so three columns do not read as
                three copies of one column. */}
            <span
              className="h-[3px] rounded-full bg-foreground/20"
              style={{ width: [22, 28, 18][column] }}
            />
            {column === 2 ? <span className="lp-plate h-6 rounded-lg opacity-70" /> : null}
            {column === 0 ? (
              /* One column is 5rem plus a 0.625rem gap, so the travel is
                 exactly 5.625rem — stated, not eyeballed, or the card lands
                 between two columns. It is also the only one at full contrast:
                 the eye needs one thing to follow, not three. */
              <span
                className="relative z-10 h-6 rounded-lg bg-[var(--lp-glass-lit)] shadow-[inset_0_0_0_1px_var(--lp-glass-edge-lit),0_0_18px_-6px_var(--lp-halo)] transition-transform duration-500 group-hover:translate-x-[5.625rem]"
              />
            ) : null}
            {column === 1 ? (
              <span className="h-6 rounded-lg bg-[var(--lp-glass)] opacity-60" />
            ) : null}
          </div>
        ))}
      </div>
    </Scene>
  );
}

// ── 08 · Prospección ────────────────────────────────────────────────

/**
 * Two conversations, and where each one actually left the person.
 *
 * The stages are `PROSPECT_STAGES` verbatim — the same words the classifier in
 * `lib/prospect.ts` is allowed to answer with, so the card cannot promise a
 * vocabulary the model does not have. At rest both threads are unread; on
 * hover each takes its verdict, because the whole point is that nobody sat
 * down to tag them.
 */
export function ProspectScene() {
  const threads = [
    { stage: "ganado", who: "Lucía Romero" },
    { stage: "negociando", who: "Diego Paz" },
  ];

  return (
    <Scene>
      <Bloom className="-top-2 left-2 h-28 w-48" />

      <div className="space-y-2">
        {threads.map((thread, index) => (
          <Row key={thread.who} style={at(index * 90)}>
            <Plate active={index === 0} className="size-8" icon={Target01Icon} />
            <Mono className="min-w-0 flex-1 truncate text-muted-foreground transition-colors duration-500 group-hover:text-foreground">
              {thread.who}
            </Mono>
            {/* A fixed slot, so two chips of different lengths do not shuffle
                the rows as they arrive. */}
            <span className="relative h-6 w-[6.5rem] shrink-0">
              <span className="absolute inset-y-0 right-0 h-[3px] w-10 translate-y-2.5 rounded-full bg-foreground/12 transition-opacity duration-500 group-hover:opacity-0" />
              <Chip
                className="absolute inset-y-0 right-0 translate-y-1 text-muted-foreground opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100"
                style={at(160 + index * 90)}
              >
                {thread.stage}
              </Chip>
            </span>
          </Row>
        ))}
      </div>
    </Scene>
  );
}

// ── 09 · Tu propia API ──────────────────────────────────────────────

/**
 * Two systems and the call between them.
 *
 * senka on the left, whatever you already run on the right, a hairline
 * connecting them. On hover the request slides the length of the wire, the far
 * plate lights, and the response lands underneath as a status line. The
 * allowlist is the subject, so the route is spelled out rather than implied.
 */
export function ApiScene() {
  return (
    <Scene>
      {/* A measure on the full-width card. Left to stretch, the wire ran the
          whole row and the request crossing it read as a loading bar. */}
      <div className="relative mx-auto w-full max-w-[30rem]">
        {/* The measured region, marked the way a drawing marks one: four
            corners rather than a box. What is between them is the claim —
            two systems and one call. */}
        <Brackets className="-inset-x-3 -top-3 bottom-9" />
        <Bloom className="-right-2 top-0 h-28 w-32 opacity-0 transition-opacity duration-700 group-hover:opacity-100" />

        <div className="flex items-center justify-between">
          <div className="flex flex-col items-center gap-2">
            <Plate active className="size-12 rounded-xl" icon={Blockchain05Icon} size={21} />
            <Mono className="text-muted-foreground">senka</Mono>
          </div>

          {/* The chip travels from the near end to `100% - its own width`, so
              it finishes flush against the far plate at any card width instead
              of overshooting on a wide one. */}
          <div className="relative mx-4 h-px flex-1 bg-border">
            <Chip
              className="absolute -top-4 left-0 text-muted-foreground opacity-60 transition-all duration-500 group-hover:left-[calc(100%-5.5rem)] group-hover:text-muted-foreground group-hover:opacity-100"
              style={at(80)}
            >
              GET /stock
            </Chip>
          </div>

          <div className="flex flex-col items-center gap-2">
            <span className="lp-plate flex size-12 items-center justify-center rounded-xl text-muted-foreground transition-colors duration-500 group-hover:text-foreground">
              <HugeiconsIcon icon={WebhookIcon} size={21} strokeWidth={1.75} />
            </span>
            <Mono className="text-muted-foreground">tu API</Mono>
          </div>
        </div>

        <div className="mt-5 flex justify-center">
          <Chip
            className="translate-y-2 text-muted-foreground opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100"
            icon={Tick02Icon}
            style={at(520)}
          >
            200 · 6 unidades en stock
          </Chip>
        </div>
      </div>
    </Scene>
  );
}

export const CAPABILITY_ART: Record<string, () => ReactNode> = {
  knowledge: KnowledgeScene,
  handoff: HandoffScene,
  calendar: CalendarScene,
  leads: LeadsScene,
  payments: PaymentsScene,
  voice: VoiceScene,
  crm: CrmScene,
  prospect: ProspectScene,
  api: ApiScene,
};
