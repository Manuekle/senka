"use client";

/**
 * The pieces every landing scene is built from.
 *
 * Extracted the moment a second family of scenes appeared (the security cards
 * next to the capability ones). Two files with their own private copy of
 * `Plate` and `Row` is two card languages that look identical on the day they
 * are written and drift by the second edit — the page has one set of surfaces
 * and this is it.
 *
 * The vocabulary is deliberately small: a raised plate for an icon, a recessed
 * row for a record, a pill for a status, mono for a label, and a wash for the
 * edge a scene runs off. Anything a scene needs beyond these five is either a
 * one-off worth writing inline, or a sixth piece that belongs here.
 *
 * ── The motion contract ──────────────────────────────────────────────
 *
 * Everything animates on `group-hover` and nothing animates on its own. The
 * resting frame is the *before* and hover plays the *after*, so a card is
 * never mid-thought when still. `prefers-reduced-motion` cuts every transition
 * in globals.css, which leaves that resting frame — already complete.
 */

import { HugeiconsIcon, type IconSvgElement } from "@/components/icons/icon";
import type { CSSProperties, ReactNode } from "react";

/**
 * Which plate in a scene is the lit one.
 *
 * These six names were six accent hues — blue for knowledge, amber for the
 * calendar, one per card. The scenes are monochrome now and `[data-tint]`
 * selects the *lit* plate rather than a colour: a brighter edge and a bloom
 * behind it, which is how the reference says "this one" on a black page. The
 * names survive because each scene still has exactly one hero plate and the
 * word at the call site still means the same thing; what changed is what the
 * stylesheet does with it.
 */
export type Tint = "amber" | "blue" | "cyan" | "emerald" | "rose" | "violet";

/**
 * The stage's contents.
 *
 * In flow, not absolutely positioned. It used to be `absolute inset-0`, which
 * meant a scene taller than its stage simply overflowed and got sliced by the
 * card — rows cut through the middle, a calendar with its last week missing, a
 * fade pressed into service as a lid on content that was never meant to run
 * off. Half the section looked like a screenshot that had been cropped wrong,
 * and no amount of edge treatment fixes that.
 *
 * Now the stage grows to hold what is in it and the row equalises the cards
 * beside it. A scene that wants to bleed says so by asking for a fade; a scene
 * that does not, fits.
 *
 * The horizontal inset is here rather than in each scene: twelve scenes each
 * choosing their own is twelve chances for one to be four pixels out of line
 * with the heading above it.
 */
export function Scene({ children }: { readonly children: ReactNode }) {
  // `relative` and a stacking context of its own: every scene has a `Bloom`
  // sitting behind its contents at `-z-10`, and without something to be
  // negative *inside*, that lands behind the card and disappears.
  return (
    <div className="relative isolate flex h-full w-full flex-col justify-center px-7">{children}</div>
  );
}

/** Shorthand for the one inline style every animated part of a scene needs. */
export function at(ms: number): CSSProperties {
  return { transitionDelay: `${ms}ms` };
}

/**
 * The plate an icon sits on — glass with a hairline ring and a specular along
 * its top edge. `active` lifts the glyph to full contrast on hover, for the
 * one plate a scene is about; `tint` marks the plate the light is on.
 */
export function Plate({
  active,
  className = "",
  icon,
  size = 14,
  tint,
}: {
  readonly active?: boolean;
  readonly className?: string;
  readonly icon: IconSvgElement;
  readonly size?: number;
  /** Colours the plate — the one hero icon a card is allowed to light up. */
  readonly tint?: Tint;
}) {
  return (
    <span
      className={`lp-plate flex shrink-0 items-center justify-center rounded-[10px] transition-colors duration-200 ${
        tint ? "" : active ? "text-muted-foreground group-hover:text-foreground" : "text-muted-foreground"
      } ${className}`}
      data-tint={tint}
    >
      <HugeiconsIcon icon={icon} size={size} strokeWidth={1.75} />
    </span>
  );
}

/**
 * A plate that swaps its icon on hover, cross-faded in place. Half these
 * scenes turn on exactly this — a file becoming a tick, a timer becoming an
 * alarm — and doing it by hand each time is four elements and two delays that
 * drift apart.
 */
export function SwapPlate({
  className = "",
  delay = 0,
  from,
  size = 14,
  tint,
  to,
}: {
  readonly className?: string;
  readonly delay?: number;
  readonly from: IconSvgElement;
  readonly size?: number;
  /** Colours the resting ("from") plate only — the "to" state already has its
   *  own tick/cross meaning and stays neutral. */
  readonly tint?: Tint;
  readonly to: IconSvgElement;
}) {
  return (
    <span className={`relative shrink-0 ${className}`}>
      <Plate
        className="absolute inset-0 transition-opacity duration-500 group-hover:opacity-0"
        icon={from}
        size={size}
        tint={tint}
      />
      <span
        className="lp-plate absolute inset-0 flex items-center justify-center rounded-[10px] text-foreground opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={at(delay)}
      >
        <HugeiconsIcon icon={to} size={size} strokeWidth={2} />
      </span>
    </span>
  );
}

/**
 * Light pooling on the surface behind an object.
 *
 * Every scene has one, and only one. The reference the section is drawn from
 * is a black page with a single lamp in it: what makes those images read as
 * expensive is not the objects, it is that all of them are lit from the same
 * place and only one of them is in the light. A scene with two blooms in it
 * has no subject.
 *
 * Sized and placed by the caller because "where the light is" is the one
 * compositional decision each scene has to make for itself. It is behind
 * everything (`-z-10` against the scene's own stacking context) and it never
 * takes the pointer.
 */
export function Bloom({ className = "", style }: { readonly className?: string; readonly style?: CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      className={`lp-bloom pointer-events-none absolute -z-10 rounded-full ${className}`}
      style={style}
    />
  );
}

/**
 * The number a scene is about, drawn as an edge rather than as ink.
 *
 * The one thing the reference does that a UI screenshot never does: a figure
 * at display size, cut out of the dark, legible only because its stroke
 * catches the light. It is decoration with a value in it — the amount, the
 * score, the status code — so it carries the meaning the card would otherwise
 * spend a label on.
 *
 * `aria-hidden` when the same number is already in the copy beside it; the
 * caller decides, because sometimes this *is* the only place it appears.
 */
export function Figure({
  children,
  className = "",
  muted,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  /** Hide it from the accessibility tree — the value is stated elsewhere. */
  readonly muted?: boolean;
}) {
  return (
    <span
      aria-hidden={muted ? "true" : undefined}
      className={`lp-figure select-none font-heading text-[clamp(3rem,7vw,4.5rem)] leading-none tracking-[-0.04em] ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Four corner ticks around a region — the drafting mark that says "this is the
 * frame", without drawing the frame. A full hairline box around a scene is a
 * second card inside the card; four corners is the same statement at a
 * quarter of the ink.
 */
export function Brackets({ className = "" }: { readonly className?: string }) {
  const corners = [
    "top-0 left-0 border-t border-l",
    "top-0 right-0 border-t border-r",
    "bottom-0 left-0 border-b border-l",
    "bottom-0 right-0 border-b border-r",
  ];

  return (
    <span aria-hidden="true" className={`pointer-events-none absolute inset-0 ${className}`}>
      {corners.map((corner) => (
        <span className={`absolute size-2.5 border-[var(--lp-glass-edge-lit)] ${corner}`} key={corner} />
      ))}
    </span>
  );
}

/** A recessed row — the shape of a contact, a document, a booking. */
export function Row({
  children,
  className = "",
  style,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}) {
  return (
    <div
      className={`lp-panel flex items-center gap-3 rounded-xl px-3.5 py-3 ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

/** A pill. The status the scene is arguing for, usually arriving on hover. */
export function Chip({
  children,
  className = "",
  icon,
  style,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly icon?: IconSvgElement;
  readonly style?: CSSProperties;
}) {
  return (
    <span
      className={`lp-panel inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 font-mono text-[10px] ${className}`}
      style={style}
    >
      {icon ? <HugeiconsIcon icon={icon} size={11} strokeWidth={2.25} /> : null}
      {children}
    </span>
  );
}

/** Mono micro-copy, the size every scene labels itself at. */
export function Mono({
  children,
  className = "",
  style,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}) {
  return (
    <span className={`font-mono text-[10px] ${className}`} style={style}>
      {children}
    </span>
  );
}

/**
 * The washes that dissolve a scene into the card at the edges it runs off.
 *
 * Both edges, not just the bottom. A scene is a fragment of a longer interface
 * — a list that continues, a week with more days in it — and cutting it off
 * with a hard line says "cropped screenshot" where the fade says "there is
 * more of this". Which edge a card needs depends on where its copy sits, so a
 * scene asks for the one it wants rather than getting both by default.
 */
export function FadeBottom() {
  return <div className="lp-fade-b pointer-events-none absolute inset-x-0 bottom-0 z-30 h-10" />;
}

export function FadeTop() {
  return <div className="lp-fade-t pointer-events-none absolute inset-x-0 top-0 z-30 h-9" />;
}

