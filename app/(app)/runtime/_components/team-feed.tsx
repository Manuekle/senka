"use client";

import type { IconSvgElement } from "@hugeicons/react";
import { AnimatePresence, motion, useReducedMotion, type Transition, type Variants } from "motion/react";
import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  AiChat02Icon,
  Alert02Icon,
  Brain02Icon,
  Cancel01Icon,
  Contact01Icon,
  RefreshIcon,
  Target01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { getAgentTemplate } from "@/lib/agent-templates";
import { EASE_OUT } from "@/lib/ease";
import { useI18n } from "@/lib/i18n/provider";
import type { TeamAction, TeamEvent, TeamState } from "@/lib/team-types";
import { cn } from "@/lib/utils";
import { BloubLive } from "@/components/pet/bloub-live";
import type { ColorId, ExpressionId } from "@/lib/bloub";
import { petIdentity } from "./pet-icons";

// The autonomous team, drawn as the conversation it is.
//
// The coordinator (lib/team-coordinator.ts) turns every business change into a
// round: each agent speaks once, reading what the others said and did before
// it, and may act on the records that started the round. The owner is a
// spectator, so this view answers a spectator's questions — who is on the
// team, what set this round off, who has spoken, what they changed, who is
// writing right now — rather than listing records.
//
// Every agent keeps one colour everywhere: its template accent when it was
// hired from one, otherwise a stable hash of its id, so a reply is attributable
// at a glance even after the agent has been renamed or paused.
//
// Motion is for arrivals only. A poll that brings nothing new must not move a
// pixel, so lists animate entries and exits (AnimatePresence, initial off) and
// never replay what was already on screen.

export type FeedAgent = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly iconKey?: string;
};

const TONES = {
  blue: { tile: "bg-blue-500/10 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300", pet: "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300", text: "text-blue-600 dark:text-blue-400" },
  violet: { tile: "bg-violet-500/10 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300", pet: "bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300", text: "text-violet-600 dark:text-violet-400" },
  amber: { tile: "bg-amber-500/10 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300", pet: "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300", text: "text-amber-600 dark:text-amber-400" },
  emerald: { tile: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300", pet: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300", text: "text-emerald-600 dark:text-emerald-400" },
  sky: { tile: "bg-sky-500/10 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300", pet: "bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-300", text: "text-sky-600 dark:text-sky-400" },
  rose: { tile: "bg-rose-500/10 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300", pet: "bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300", text: "text-rose-600 dark:text-rose-400" },
  orange: { tile: "bg-orange-500/10 text-orange-600 dark:bg-orange-400/15 dark:text-orange-300", pet: "bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-300", text: "text-orange-600 dark:text-orange-400" },
  pink: { tile: "bg-pink-500/10 text-pink-600 dark:bg-pink-400/15 dark:text-pink-300", pet: "bg-pink-100 text-pink-600 dark:bg-pink-950 dark:text-pink-300", text: "text-pink-600 dark:text-pink-400" },
  teal: { tile: "bg-teal-500/10 text-teal-600 dark:bg-teal-400/15 dark:text-teal-300", pet: "bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-300", text: "text-teal-600 dark:text-teal-400" },
} as const;

type Tone = keyof typeof TONES;
type Translate = ReturnType<typeof useI18n>["t"];

const HASHED_TONES: readonly Tone[] = ["violet", "pink", "teal", "amber", "sky", "rose", "emerald", "orange", "blue"];

const KIND_ICON: Record<string, IconSvgElement> = { contact: Contact01Icon, deal: Target01Icon, agent: AiChat02Icon };

const LABEL = "font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground";

const ENTER: Transition = { duration: 0.28, ease: EASE_OUT };

/** Entry for a thread row, and the stagger its children (header, text,
 *  actions) inherit. Reduced motion keeps the fade and drops the travel.
 *  `line` is a sub-variant so the "writing" row above and the reply replacing
 *  it animate on separate beats — one thread variant cannot do both, because
 *  the reply's beat runs only when the writing row exits. */
function threadVariants(reduce: boolean): { entry: Variants; item: Variants; line: Variants } {
  const from = (y: number) => (reduce ? { opacity: 0 } : { opacity: 0, y });
  return {
    entry: {
      hidden: from(8),
      show: { opacity: 1, y: 0, transition: { ...ENTER, staggerChildren: 0.06, delayChildren: 0.08 } },
      exit: { opacity: 0, transition: { duration: 0.14, ease: EASE_OUT } },
    },
    item: { hidden: from(4), show: { opacity: 1, y: 0, transition: ENTER } },
    line: { hidden: from(4), show: { opacity: 1, y: 0, transition: { ...ENTER, delay: 0.18 } } },
  };
}

type Persona = { readonly id: string; readonly name: string; readonly description: string; readonly tone: Tone };

function hashTone(id: string): Tone {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return HASHED_TONES[hash % HASHED_TONES.length];
}

function persona(agents: readonly FeedAgent[], id: string, fallbackName = ""): Persona {
  const agent = agents.find((a) => a.id === id);
  const template = getAgentTemplate(agent?.iconKey);
  const accent = template?.accent.match(/bg-(\w+)-500/)?.[1];
  const tone = accent && accent in TONES ? (accent as Tone) : hashTone(id);
  return { id, name: agent?.name ?? (fallbackName || id), description: agent?.description ?? "", tone };
}

const AVATAR_PET_PX = {
  xs: 20,
  sm: 32,
  lg: 48,
} as const;

/**
 * A member's personal pet: stable shape + tone color + personality face per
 * agent (see `petIdentity`), on a tone-tinted disc. Only whoever holds the
 * floor is live (`BloubLive` loop + "attentif"); everyone else is a frozen
 * first frame — one animated pet per conversation, and the speaker is
 * obvious. Decorative: the name always sits next to it as text.
 */
function Avatar({ who, size, expression, live = false, className, avatarClass }: {
  readonly who: Persona;
  readonly size: keyof typeof AVATAR_PET_PX;
  readonly expression?: ExpressionId;
  readonly live?: boolean;
  readonly className?: string;
  readonly avatarClass?: string;
}) {
  const identity = petIdentity(who.id, who.tone);
  return (
    <BloubLive
      expression={expression ?? identity.expression}
      shape={identity.shape}
      color={identity.color}
      size={AVATAR_PET_PX[size]}
      still={!live}
      className={cn("shrink-0 rounded-full", TONES[who.tone].pet, className, avatarClass)}
    />
  );
}

function AvatarStack({ people, size }: { readonly people: readonly Persona[]; readonly size: keyof typeof AVATAR_PET_PX }) {
  // Transitions.dev avatar-group hover: the hovered pet lifts and its
  // neighbors trail off with distance falloff. Timing function goes inline
  // BEFORE the variable writes; mouseleave resets with the out-ease.
  const hover = (group: HTMLElement | null, activeIdx: number | null) => {
    if (!group) return;
    const items = Array.from(group.children) as HTMLElement[];
    const ease = activeIdx === null ? "var(--avatar-ease-out)" : "var(--avatar-ease-in)";
    items.forEach((el, i) => {
      el.style.transitionTimingFunction = ease;
      if (activeIdx === null) {
        el.style.setProperty("--shift", "0px");
        el.style.setProperty("--scale-active", "1");
        return;
      }
      const distance = Math.abs(i - activeIdx);
      el.style.setProperty("--shift", (-4 * Math.pow(0.45, distance)).toFixed(3) + "px");
      el.style.setProperty("--scale-active", i === activeIdx ? "1.05" : "1");
    });
  };
  return (
    <span
      className="t-avatar-group flex -space-x-1.5"
      onMouseLeave={(e) => hover(e.currentTarget, null)}
    >
      {people.slice(0, 4).map((who, i) => (
        <span
          key={who.id}
          className="t-avatar"
          onMouseEnter={(e) => hover(e.currentTarget.parentElement, i)}
        >
          <Avatar who={who} size={size} className="ring-1 ring-border" />
        </span>
      ))}
    </span>
  );
}

/** Snapshot values are JSON cut at 2000 characters, so a long record can arrive
 *  unparseable; the name sits at the front and survives the cut. */
function changeName(change: TeamEvent["changes"][number]): string {
  const raw = change.after ?? change.before ?? "";
  try {
    const value = JSON.parse(raw) as { name?: unknown; title?: unknown };
    const name = value.name ?? value.title;
    if (typeof name === "string" && name) return name;
  } catch {
    const match = raw.match(/"(?:name|title)":"((?:[^"\\]|\\.)*)"/);
    if (match) {
      try { return JSON.parse(`"${match[1]}"`) as string; } catch { /* fall through to the id */ }
    }
  }
  return change.id;
}

function changeVerb(change: TeamEvent["changes"][number]): "created" | "updated" | "deleted" {
  if (change.before === null) return "created";
  if (change.after === null) return "deleted";
  return "updated";
}

/** Who this round expects to hear from. A participant removed from the team
 *  after the round started is no longer waited on, but keeps what they said. */
function roundPeople(event: TeamEvent, team: TeamState) {
  const spoken = new Set(event.messages.map((m) => m.agentId));
  const expected = event.participants.filter((id) => spoken.has(id) || team.agentIds.includes(id));
  const live = event.status === "running" || event.status === "queued";
  return { expected, pending: live ? expected.filter((id) => !spoken.has(id)) : [] };
}

function doneActions(event: TeamEvent): number {
  return event.messages.reduce((sum, message) => sum + (message.actions?.filter((a) => a.status === "done").length ?? 0), 0);
}

function shortTime(iso: string, locale: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  if (now.getTime() - date.getTime() < 6 * 86_400_000) return date.toLocaleDateString(locale, { weekday: "short" });
  return date.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

/** A label that falls back to the raw value when no translation exists — a
 *  refused action can carry a status the dictionary has never heard of. */
function labelOr(t: Translate, key: string, fallback: string): string {
  const label = t(key);
  return label === key ? fallback : label;
}

function actionText(t: Translate, action: TeamAction): string {
  const target = action.targetName ?? action.targetId;
  switch (action.type) {
    case "contact_status":
      return t("agentTeam.action.contact_status", { target, value: labelOr(t, `contactStatus.${action.value}`, action.value) });
    case "deal_stage":
      return t("agentTeam.action.deal_stage", { target, value: labelOr(t, `pipeline.stage.${action.value}`, action.value) });
    case "contact_attribute":
      return t("agentTeam.action.contact_attribute", { target, key: action.key ?? "", value: action.value });
    default:
      return t(`agentTeam.action.${action.type}`, { target });
  }
}

const STATUS_DOT: Record<TeamEvent["status"], string> = {
  queued: "bg-amber-400",
  running: "bg-sky-500",
  completed: "bg-emerald-500",
  failed: "bg-destructive",
};

function StatusDot({ status }: { readonly status: TeamEvent["status"] }) {
  return (
    <span aria-hidden="true" className="relative inline-flex size-2">
      {status === "running" ? <span className="absolute inset-0 animate-ping rounded-full bg-sky-500/60 motion-reduce:animate-none" /> : null}
      <span className={cn("relative size-2 rounded-full transition-colors duration-300", STATUS_DOT[status])} />
    </span>
  );
}

// The round's mood, carried by the app pet. The bloub sleeps while the round
// waits, gets curious as the first replies land, pays attention when the round
// is deep in, celebrates a completed round and mopes over a failed one. One
// live BloubLive per event, carried INLINE, not via <img>: the dark mode
// inside the SVG listens for the app's `.dark`/`.light` classes, which an
// `<img>` document can never see. A change of mood MORPHS in the engine, so it
// reads as the pet reacting, not an image swap. Nothing frames it: no progress
// ring, no disc behind — the drawing floats bare, the way a sticker would.

/** Round status to pet paint: one color + one face per state. Failed rounds
 *  run red and angry, completed ones green and happy, queued ones gray and
 *  sleepy; a running round stays blue and mirrors whoever holds the floor
 *  (`writingExpression`), resting attentive between turns. */
const STATUS_PET: Record<TeamEvent["status"], { color: ColorId; expression: ExpressionId | null }> = {
  failed: { color: "rouge", expression: "colere" },
  completed: { color: "vert", expression: "heureux" },
  queued: { color: "gris", expression: "somnolent" },
  running: { color: "bleu", expression: null },
};

/** The round's progress, told by the pet's mood alone: color and face follow
 *  the status, and every turn change morphs to the new writer's face. */
function PetProgress({ status, writing = false, writingExpression }: {
  readonly status: TeamEvent["status"];
  readonly writing?: boolean;
  readonly writingExpression?: ExpressionId;
}) {
  const reduce = useReducedMotion() ?? false;
  const paint = STATUS_PET[status];
  const mood: ExpressionId =
    paint.expression ?? (writing ? (writingExpression ?? "curieux") : "attentif");
  // Per-mount namespace: history lists several events with the same mood at
  // once and `url(#...)` resolves document-wide. BloubLive derives it from
  // useId; mood changes MORPH in the engine instead of crossfading two SVGs
  // (no AnimatePresence: a single live instance per event).
  return (
    <span className="relative block size-12 shrink-0">
      {/* Live, not <img>: the embedded dark mode reads the app's `.dark` /
          `.light` classes, which an image document never receives. With
          reduced-motion, a fixed frame on the final face. No pulse: the engine
          already moves (blink, drift, morphs) — opacity throbbing reads as a
          glitch next to it. */}
      <BloubLive
        expression={mood}
        shape="nuage"
        color={paint.color}
        size={48}
        still={reduce}
        className="[&_svg]:block [&_svg]:size-full"
      />
    </span>
  );
}

function TypingDots() {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1 animate-pulse rounded-full bg-current motion-reduce:animate-none" style={{ animationDelay: `${i * 180}ms` }} />
      ))}
    </span>
  );
}

/** The dictionary has no plural rules, and one action is the case that reads wrong. */
function actionCount(t: Translate, count: number): string {
  return count === 1 ? t("agentTeam.actionsOne") : t("agentTeam.actionsTotal", { count });
}

/** Simulated streaming: the words arrive a few at a time while the avatar is
 *  marked as "writing", the way a poll delivering the finished reply late would
 *  draw it. An id change remounts this (the caller keys it by message id), so
 *  the effect never has to reset state — it only drives the interval forward,
 *  and a real stream appending to the text just keeps typing. */
function LiveText({ text, streaming, toneClass, reduce }: {
  readonly text: string;
  readonly streaming: boolean;
  readonly toneClass: string;
  readonly reduce: boolean;
}) {
  // Typed-up-to position. A reply mounted already settled (history, reduced
  // motion) starts at full length and never animates.
  const [chars, setChars] = useState(() => (streaming && !reduce && text ? 0 : text.length));

  useEffect(() => {
    if (!streaming || reduce || !text) return undefined;
    let hold: ReturnType<typeof setTimeout> | null = null;
    const timer = setInterval(() => {
      // Tab in the background: the typing waits. Hidden tabs throttle
      // timers anyway; this also stops a burst of catch-up ticks from
      // emptying the whole line the moment the tab comes back.
      if (document.hidden) return;
      setChars((current) => {
        if (current > text.length) return current;
        const step = 2 + Math.floor(Math.random() * 3); // 2–4 characters per beat
        const next = Math.min(text.length, current + step);
        if (next >= text.length && !hold) {
          // One blink's worth of a finished line before the caret dims to
          // "this speaker is done, the next one is winding up".
          hold = setTimeout(() => setChars(text.length + 1), 1200);
        }
        return next;
      });
    }, 48);
    return () => { clearInterval(timer); if (hold) clearTimeout(hold); };
  }, [text, streaming, reduce]);

  // Done derives from props, not from another effect: when the round moves on
  // (`streaming` flips false) the line settles instantly, no state write.
  const done = !streaming || chars > text.length;
  // The caret is a small block that follows the words like a real cursor while
  // they land, then blinks in the agent's colour at the end of the line until
  // the next reply takes over the round. It reads "this line is live".
  return (
    <p className="mt-1.5 max-w-2xl whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground">
      {done ? text : text.slice(0, chars)}
      {streaming ? (
        <span
          aria-hidden="true"
          className={cn(
            "ml-1 inline-block h-[1.05em] w-[0.55ch] translate-y-[0.18em] rounded-[2px] align-baseline",
            toneClass,
            "animate-[team-caret_1.1s_steps(2,jump-none)_infinite]",
            done ? "opacity-35" : "opacity-60",
            "motion-reduce:animate-none",
          )}
        />
      ) : null}
    </p>
  );
}

function ActionList({ actions, item }: { readonly actions: readonly TeamAction[]; readonly item: Variants }) {
  const { t } = useI18n();
  const done = actions.filter((action) => action.status === "done").length;
  const label = done !== actions.length
    ? t("agentTeam.executedPartial", { done, total: actions.length })
    : done === 1 ? t("agentTeam.executedOne") : t("agentTeam.executed", { count: done });
  return (
    <div className="mt-3 max-w-2xl">
      <motion.p variants={item} className={cn(LABEL, "flex items-center gap-1.5")}>
        <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} />
        {label}
      </motion.p>
      <ul className="mt-1.5 space-y-1.5">
        {actions.map((action, index) => {
          const ok = action.status === "done";
          const note = action.type === "contact_note" || action.type === "deal_note";
          return (
            <motion.li
              key={`${action.type}-${action.targetId}-${index}`}
              variants={item}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border px-3 py-2 text-[13px] leading-snug",
                ok
                  ? "border-border/70 border-l-emerald-500 bg-card shadow-[var(--shadow-inset)]"
                  : "border-dashed border-border bg-muted/30",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "mt-px grid size-5 shrink-0 place-items-center rounded-full ring-1",
                  ok
                    ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400 dark:ring-emerald-400/30"
                    : "bg-muted-foreground/10 text-muted-foreground ring-border",
                )}
              >
                <HugeiconsIcon icon={ok ? Tick02Icon : Cancel01Icon} size={11} strokeWidth={2.25} />
              </span>
              <span className="min-w-0 break-words">
                <span className={ok ? "font-medium text-foreground" : "text-muted-foreground"}>{actionText(t, action)}</span>
                {!ok && action.reason ? (
                  <span className="text-muted-foreground"> · {t("agentTeam.skipped")}: {t(`agentTeam.skip.${action.reason}`)}</span>
                ) : null}
                {note ? <span className="mt-1 block border-l-2 border-emerald-500/40 pl-2 text-muted-foreground italic line-clamp-2">“{action.value}”</span> : null}
              </span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

function Thread({ event, team, agents, fill = false }: { readonly event: TeamEvent; readonly team: TeamState; readonly agents: readonly FeedAgent[]; readonly fill?: boolean }) {
  const { t, locale } = useI18n();
  const reduce = useReducedMotion() ?? false;
  const { entry, item, line } = threadVariants(reduce);
  const { expected, pending } = roundPeople(event, team);
  const people = expected.map((id) => persona(agents, id, event.messages.find((m) => m.agentId === id)?.agentName));
  const acted = doneActions(event);
  // The one reply that is still being written. The round hands its turn to a
  // pending agent the moment it starts; the last message on the thread is the
  // one being typed into. Only a live round streams — replaying history should
  // not re-run a conversation that already happened.
  const live = event.status === "running" || event.status === "queued";
  const lastMessage = event.messages.at(-1);
  const writerId = pending[0];
  // The round pet wears the current writer's face, so every turn change
  // reads as a mood change (morph, not a swap).
  const writer = writerId === undefined ? undefined : persona(agents, writerId);
  const writerExpression = writer === undefined ? undefined : petIdentity(writer.id, writer.tone).expression;

  return (
    <div className="flex min-w-0 flex-col">
      <header className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5 sm:px-8",
        fill && "sticky top-0 z-10 bg-background/95 backdrop-blur-sm",
      )}>
        <div className="flex items-center gap-3">
          <PetProgress status={event.status} writing={live && writerId !== undefined} writingExpression={writerExpression} />
          <div className="leading-tight">
            <p className="flex items-center gap-2 text-sm font-medium">
              <StatusDot status={event.status} />
              {t(`agentTeam.status.${event.status}`)}
            </p>
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
              {t("agentTeam.replies", { done: event.messages.length, total: expected.length })}
              {acted > 0 ? ` · ${actionCount(t, acted)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <AvatarStack people={people} size="sm" />
          <time dateTime={event.at} className="text-xs tabular-nums text-muted-foreground">
            {new Date(event.at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
          </time>
        </div>
      </header>

      <ol className="relative space-y-7 px-5 py-6 sm:px-8 sm:py-8" aria-live="polite">
        <li>
          <h3 className={cn(LABEL, "flex items-center gap-2")}>
            <span className="grid size-5 place-items-center rounded-full bg-muted text-muted-foreground">
              <HugeiconsIcon icon={RefreshIcon} size={11} strokeWidth={2} />
            </span>
            {t("agentTeam.changesDetected")}
          </h3>
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {event.changes.map((change) => (
              <li key={`${change.kind}:${change.id}`} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2 py-1 text-xs">
                <HugeiconsIcon icon={KIND_ICON[change.kind] ?? RefreshIcon} size={13} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">{t(`agentTeam.kind.${change.kind}`)}</span>
                <span className="truncate font-medium">{changeName(change)}</span>
                <span className="shrink-0 text-muted-foreground">· {t(`agentTeam.change.${changeVerb(change)}`)}</span>
              </li>
            ))}
          </ul>
        </li>

        {people.length > 0 ? (
          <li>
            <h3 className={cn(LABEL, "flex items-center gap-2")}>
              <AvatarStack people={people} size="xs" />
              {t("agentTeam.convened", { count: people.length })}
            </h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{people.map((who) => who.name).join(", ")}</p>
          </li>
        ) : null}

        {/* popLayout takes a leaving row out of flow at once, so the "writing"
            line and the reply that replaces it never stack for a frame.
            Replies use the `line` variant so one arriving as the writing row
            leaves starts late enough to land after the fade-out — the beat of
            turn-taking. The reply in flight streams live via LiveText. */}
        <AnimatePresence initial={false} mode="popLayout">
          {event.messages.map((message) => {
            const who = persona(agents, message.agentId, message.agentName);
            // Only the thread's last message streams, and only while the round
            // is live and that agent still holds the floor (its pending row
            // exists). Earlier replies are settled history: a growing list that
            // re-types old text would replay a conversation already read.
            const streaming = live && message === lastMessage && who.id === writerId;
            return (
              <motion.li
                key={message.id}
                layout="position"
                variants={streaming ? line : entry}
                initial="hidden"
                animate="show"
                exit="exit"
              >
                <article>
                  <motion.header variants={item} className="flex items-center gap-2">
                    <Avatar
                      who={who}
                      size="xs"
                      expression={streaming ? "attentif" : undefined}
                      live={streaming}
                      avatarClass={streaming ? "rounded-full ring-1 ring-current/60" : undefined}
                      className={streaming ? TONES[who.tone].text : undefined}
                    />
                    <h3 className={LABEL}>
                      {t("agentTeam.messageFrom")} <span className={TONES[who.tone].text}>{who.name}</span>
                    </h3>
                    <time dateTime={message.at} className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground/70">
                      {new Date(message.at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                    </time>
                  </motion.header>
                  {streaming ? (
                    <LiveText
                      key={message.id}
                      text={message.text}
                      streaming={streaming}
                      toneClass={TONES[who.tone].text}
                      reduce={reduce}
                    />
                  ) : (
                    <motion.p variants={item} className="mt-1.5 max-w-2xl whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground">
                      {message.text}
                    </motion.p>
                  )}
                  {message.actions?.length ? <ActionList actions={message.actions} item={item} /> : null}
                </article>
              </motion.li>
            );
          })}

          {pending.map((id, index) => {
            const who = persona(agents, id);
            const writing = (event.status === "running" || event.status === "queued") && index === 0;
            return (
              <motion.li
                key={`pending-${id}`}
                layout="position"
                variants={writing ? line : entry}
                initial="hidden"
                animate="show"
                exit="exit"
                className={cn("flex items-center gap-2 transition-opacity duration-300", !writing && "opacity-60")}
              >
                <Avatar who={who} size="xs" expression={writing ? "attentif" : undefined} live={writing} avatarClass={writing ? "rounded-full ring-1 ring-current/60" : undefined} className={writing ? TONES[who.tone].text : undefined} />
                <span className={cn(LABEL, "flex items-center gap-2 transition-colors duration-300", writing && TONES[who.tone].text)}>
                  {writing ? t("agentTeam.typing", { name: who.name }) : t("agentTeam.pendingAgent", { name: who.name })}
                  {writing ? <TypingDots /> : null}
                </span>
              </motion.li>
            );
          })}

          {event.status === "queued" && !event.error && pending.length > 0 ? (
            <motion.li key="waiting" layout="position" variants={entry} initial="hidden" animate="show" exit="exit" className="text-sm text-muted-foreground">
              {t("agentTeam.waiting")}
            </motion.li>
          ) : null}

          {event.error ? (
            <motion.li
              key="error"
              layout="position"
              variants={entry}
              initial="hidden"
              animate="show"
              exit="exit"
              role="status"
              className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
            >
              <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
              {t(`agentTeam.error.${event.error}`)}
            </motion.li>
          ) : null}
        </AnimatePresence>
      </ol>
    </div>
  );
}

/** `team.events` arrives newest first (see app/api/team/route.ts). */
export function TeamFeed({ team, agents, fill = false }: { readonly team: TeamState; readonly agents: readonly FeedAgent[]; readonly fill?: boolean }) {
  const { t, locale } = useI18n();
  const reduce = useReducedMotion() ?? false;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!team.events.length) {
    return (
      <p
        className={cn(
          "content-enter text-center text-sm text-muted-foreground",
          fill
            ? "flex min-h-0 flex-1 items-center justify-center p-8"
            : "rounded-2xl border border-dashed border-border p-8",
        )}
      >
        {t("agentTeam.empty")}
      </p>
    );
  }

  // Until a round is picked, the view follows the newest one as it arrives.
  const selected = team.events.find((event) => event.id === selectedId) ?? team.events[0];
  const running = team.events.find((event) => event.status === "running");
  const speaking = running ? roundPeople(running, team).pending[0] : undefined;
  const members = team.agentIds.map((id) => persona(agents, id));

  return (
    <div
      className={cn(
        "content-enter grid overflow-hidden md:grid-cols-[18rem_minmax(0,1fr)]",
        // /working (`fill`) sits edge to edge under the shell, the way
        // /calendar does — hairlines only, no floating card. The /runtime
        // team tab keeps the card: its page is a padded column.
        fill
          ? "h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]"
          : "rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]",
      )}
    >
      <aside
        className={cn(
          "flex min-h-0 min-w-0 flex-col border-b border-border bg-muted/30 md:border-r md:border-b-0",
          fill && "max-h-[45dvh] md:max-h-none",
        )}
      >
        {members.length > 0 ? (
          <div className={cn("shrink-0 p-4", fill && "scroll-hover max-h-[45dvh] overflow-y-auto")}>
            <p className={LABEL}>{t("agentTeam.members")}</p>
            <ul className="mt-3 grid grid-cols-3 gap-1.5">
              {members.map((who) => {
                const isSpeaking = speaking === who.id;
                return (
                  <li
                    key={who.id}
                    className={cn(
                      "flex min-w-0 flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 text-center transition-[background-color,box-shadow] duration-300 ease-out",
                      isSpeaking && "bg-card shadow-[var(--shadow-soft)]",
                    )}
                  >
                    <span className="relative">
                      <Avatar who={who} size="lg" expression={isSpeaking ? "attentif" : undefined} live={isSpeaking} />
                      <AnimatePresence initial={false}>
                        {isSpeaking ? (
                            <motion.span
                              key="speaking"
                              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                              transition={{ duration: 0.2, ease: EASE_OUT }}
                              className="absolute right-[10%] bottom-[10%] size-3 rounded-full border-2 border-card bg-emerald-500"
                            />
                        ) : null}
                      </AnimatePresence>
                    </span>
                    <span className="w-full truncate text-xs font-medium">{who.name}</span>
                    {who.description ? (
                      <span className="max-w-full truncate rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{who.description}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <nav
          aria-label={t("agentTeam.rounds")}
          className={cn(
            "border-t border-border px-2 py-3 first:border-t-0",
            // flex-col so the rounds list is a flex item: it grows to take
            // the space left over after Integrantes y la memoria, and scrolls
            // inside itself once the rounds outgrow it — nothing gets clipped.
            fill && "flex min-h-0 flex-1 flex-col",
          )}
        >
          <p className={cn(LABEL, "px-2")}>
            {t("agentTeam.rounds")} <span className="tabular-nums">· {team.events.length}</span>
          </p>
          <ul className={cn("scroll-hover relative mt-2 space-y-0.5 overflow-y-auto", fill ? "min-h-0 flex-1" : "max-h-80 md:max-h-[30rem]")}>
            <AnimatePresence initial={false}>
              {team.events.map((event) => {
                const first = event.changes[0];
                const last = event.messages.at(-1);
                const lead = last
                  ? persona(agents, last.agentId, last.agentName)
                  : persona(agents, event.participants[0] ?? event.id);
                const title = first
                  ? `${t(`agentTeam.kind.${first.kind}`)}: ${changeName(first)}${event.changes.length > 1 ? ` +${event.changes.length - 1}` : ""}`
                  : t("agentTeam.changes", { count: 0 });
                const snippet = last
                  ? `${lead.name}: ${last.text}`
                  : event.error
                    ? t(`agentTeam.error.${event.error}`)
                    : t(`agentTeam.status.${event.status}`);
                const acted = doneActions(event);
                const isSelected = event.id === selected.id;
                return (
                  <motion.li
                    key={event.id}
                    layout="position"
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={ENTER}
                  >
                    <button
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      onClick={() => setSelectedId(event.id)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left outline-none transition-[background-color,box-shadow] duration-200 ease-out hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring",
                        isSelected && "bg-card shadow-[var(--shadow-soft)] hover:bg-card",
                      )}
                    >
                      <span className="relative mt-0.5">
                        <Avatar who={lead} size="sm" />
                        <span className="absolute right-[10%] bottom-[10%] grid size-3 place-items-center rounded-full bg-card">
                          <StatusDot status={event.status} />
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-sm font-medium">{title}</span>
                          <time dateTime={event.at} className="ml-auto shrink-0 text-xs text-muted-foreground">{shortTime(event.at, locale)}</time>
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{snippet}</span>
                          {acted > 0 ? (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-emerald-500/10 px-1 py-px text-[10px] font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                              <HugeiconsIcon icon={Tick02Icon} size={10} strokeWidth={2.5} />
                              <span aria-hidden="true">{acted}</span>
                              <span className="sr-only">{actionCount(t, acted)}</span>
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </nav>

        {team.memory.length > 0 ? (
          <div className={cn("shrink-0 border-t border-border p-4", fill && "scroll-hover max-h-[30dvh] overflow-y-auto")}>
            <p className={cn(LABEL, "flex items-center gap-1.5")}>
              <HugeiconsIcon icon={Brain02Icon} size={12} strokeWidth={1.75} />
              {t("agentTeam.memory")}
            </p>
            <ul className="mt-3 space-y-2.5">
              {team.memory.map((entry, index) => (
                <li key={`${entry.agentId}-${index}`} className="flex gap-2">
                  <Avatar who={persona(agents, entry.agentId)} size="xs" className="mt-0.5 self-start" />
                  <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{entry.text}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>

      <section
        aria-label={t("agentTeam.feed")}
        className={cn("min-w-0", fill ? "scroll-hover min-h-0 overflow-y-auto" : "md:min-h-[32rem]")}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={selected.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14, ease: EASE_OUT }}
          >
            <Thread event={selected} team={team} agents={agents} fill={fill} />
          </motion.div>
        </AnimatePresence>
      </section>
    </div>
  );
}
