"use client";

import gsap from "gsap";
import { type RefObject, useEffect, useRef, useState } from "react";
export { useStageLive } from "./use-stage-live";

/**
 * The hand that drives the screens.
 *
 * The mockups on this page render the product's own components over a fixed
 * dataset, and until recently they rendered one frame of it: a conversation
 * that had already happened. A still of an agent cannot show the thing being
 * claimed — that it takes a turn, calls a tool and comes back — so the screens
 * play: a cursor travels the mockup, clicks the controls a person would click,
 * and the screen answers the way the app answers.
 *
 * ── Why GSAP, and why none of this is React state ────────────────────
 *
 * The first version animated the pointer by putting its position in React
 * state and letting a spring pick it up. That is the wrong shape for this
 * twice over. The pointer moved on a re-render, so every frame of travel
 * re-rendered the whole mockup — sidebar, nav, every card — and the press
 * animation was a second piece of state racing the first: the ring could fire
 * while the cursor was still travelling, so the click landed on nothing.
 *
 * Now the pointer is a DOM node GSAP writes transforms onto. React renders it
 * once and never again, the travel and the press are one timeline each so a
 * press cannot start before its travel finished, and a lap of the script costs
 * the fifteen re-renders its fifteen phases are worth instead of one per
 * frame.
 *
 * Four pieces, and every flow needs the same four:
 *
 *   `useDemoLoop`   the script — ordered phases and how long each one holds
 *   `useStageLive`  when it may run: on screen, tab in front, motion allowed
 *   `DemoCursor`    the pointer, driven through a `CursorApi` handle
 *   `useTypewriter` text typed straight into an input, no render per letter
 *
 * The frame is `inert` (see `ScreenFrame`), so none of this competes with a
 * real cursor: what the visitor's own pointer does over the mockup is nothing,
 * which is what makes a simulated one honest rather than confusing. `inert`
 * also keeps the mockup's hundred-odd buttons out of the tab order and the
 * accessibility tree, which `pointer-events-none` — what used to be here —
 * never did.
 *
 * None of the steps below dispatch events or move focus: the cursor is a
 * rendered element and `useTypewriter` writes to the node directly, so an
 * inert subtree animates exactly as it did.
 */

// ── The script ──────────────────────────────────────────────────────

export type DemoStep<TPhase extends string> = {
  readonly phase: TPhase;
  /** How long this phase holds, in ms. */
  readonly ms: number;
};

/**
 * Walks a script on a timer and starts over at the end.
 *
 * `cycle` counts laps. Anything that has to be rebuilt per lap — a typed
 * string, a stream — keys off it rather than trying to detect the wrap.
 *
 * Held at the first step while `live` is false, so a flow that is off screen
 * is not quietly running a timer and a re-render every 700ms.
 */
export function useDemoLoop<TPhase extends string>(
  script: readonly DemoStep<TPhase>[],
  live: boolean,
): { readonly phase: TPhase; readonly step: number; readonly cycle: number } {
  const [state, setState] = useState({ step: 0, cycle: 0 });

  useEffect(() => {
    if (!live) return;
    const timer = window.setTimeout(() => {
      setState((prev) => {
        const next = prev.step + 1;
        return next >= script.length
          ? { step: 0, cycle: prev.cycle + 1 }
          : { step: next, cycle: prev.cycle };
      });
    }, script[state.step]?.ms ?? 1000);
    return () => window.clearTimeout(timer);
  }, [live, script, state.step]);

  return {
    phase: script[state.step]?.phase ?? script[0].phase,
    step: state.step,
    cycle: state.cycle,
  };
}

// ── Where the pointer goes ──────────────────────────────────────────

export type Point = { readonly x: number; readonly y: number };

/**
 * The point inside `target` the cursor should sit on, in the stage's own
 * coordinates.
 *
 * `bias` is where in the control the tip lands, 0–1 on each axis. The default
 * is not the centre: a pointer parked dead centre on a button reads as a
 * screenshot with an icon pasted on it, and a real one lands a little above
 * and left of the middle on its way in.
 */
export function pointAt(
  stage: HTMLElement | null,
  target: HTMLElement | null,
  bias: Point = { x: 0.42, y: 0.45 },
): Point | null {
  if (!stage || !target) return null;
  const box = target.getBoundingClientRect();
  const frame = stage.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return null;
  return {
    x: box.left - frame.left + box.width * bias.x,
    y: box.top - frame.top + box.height * bias.y,
  };
}

// ── The pointer ─────────────────────────────────────────────────────

/* One glyph for the whole flow. The pointer used to swap between an arrow, a
   hand and a magic-selection cursor by phase, which is three shapes competing
   for attention on a screen that already has a dialog opening and text
   arriving — and a pointer changing costume mid-travel reads as a glitch
   rather than as intent. The travel and the press say everything the shape
   was trying to. */

/** What a flow drives the pointer with. */
export type CursorApi = {
  /**
   * Moves to a target and resolves when it lands. The first call places the
   * pointer rather than flying it in from the corner.
   */
  readonly travelTo: (
    target: HTMLElement | null,
    options?: { readonly bias?: Point; readonly ms?: number },
  ) => void;
  /** The press: the ring lands, the cursor dips and comes back. */
  readonly press: () => void;
  /** Whether the pointer is on screen at all. */
  readonly show: (visible: boolean) => void;
};

export function DemoCursor({
  api,
  stage,
}: {
  /** Filled in with the handle a flow drives the pointer through. */
  readonly api: RefObject<CursorApi | null>;
  /** The element the pointer's coordinates are measured against. */
  readonly stage: RefObject<HTMLElement | null>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const icon = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = root.current;
    const iconNode = icon.current;
    const ringNode = ring.current;
    if (!node || !iconNode || !ringNode) return;

    // The tip is the top-left of the glyph, so that is what a press scales
    // around: scaling from the centre slides the tip off whatever it is
    // pressing, which is exactly the thing that read as "the click missed".
    gsap.set(iconNode, { transformOrigin: "0% 0%" });
    gsap.set(ringNode, { opacity: 0, scale: 0.35 });

    let placed = false;

    api.current = {
      travelTo(target, options) {
        const point = pointAt(stage.current, target, options?.bias);
        if (!point) return;

        if (!placed) {
          // No flight in from 0,0 on the first move — the pointer simply is
          // where the flow starts.
          gsap.set(node, { x: point.x, y: point.y, opacity: 1 });
          placed = true;
          return;
        }

        const duration = Math.max(0.28, (options?.ms ?? 700) / 1000);
        // Two tweens, two eases, one curve. A hand does not travel in a
        // straight line: giving x a sharper ease than y bends the path, and
        // `overwrite` means a phase that starts early takes the pointer with
        // it instead of fighting the tween already running.
        gsap.to(node, { x: point.x, duration, ease: "power3.inOut", overwrite: "auto" });
        gsap.to(node, {
          y: point.y,
          duration,
          ease: "power1.inOut",
          overwrite: "auto",
        });
      },

      press() {
        // Fast. A click is an event, not a gesture: the whole thing lands in
        // 260ms, the dip is over in 50, and the ring is gone before the screen
        // has finished reacting to what was clicked. The first pass ran half a
        // second and read as the pointer labouring over every control.
        gsap
          .timeline()
          .to(iconNode, { scale: 0.8, duration: 0.05, ease: "power3.in" })
          .fromTo(
            ringNode,
            { scale: 0.3, opacity: 0.85 },
            { scale: 2, opacity: 0, duration: 0.26, ease: "power2.out" },
            0,
          )
          .to(iconNode, { scale: 1, duration: 0.16, ease: "back.out(3)" }, 0.05);
      },

      show(visible) {
        gsap.to(node, { opacity: visible ? 1 : 0, duration: 0.22, ease: "power2.out" });
      },
    };

    return () => {
      api.current = null;
      gsap.killTweensOf([node, iconNode, ringNode]);
    };
  }, [api, stage]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 z-50 opacity-0 will-change-transform"
      ref={root}
    >
      {/* The press ring. Its own layer, centred on the tip, so it can grow out
          from under the cursor without moving it. */}
      <span
        className="-top-3.5 -left-3.5 absolute size-7 rounded-full border border-foreground/40 bg-foreground/10"
        ref={ring}
      />
      <span
        className="relative block text-foreground drop-shadow-[0_1px_3px_oklch(0_0_0/0.35)]"
        ref={icon}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width={22} height={22}>
          <polygon fill="#FFFFFF" points="8.2,20.9 8.2,4.9 19.8,16.5 13,16.5 12.6,16.6 "/>
          <polygon fill="#FFFFFF" points="17.3,21.6 13.7,23.1 9,12 12.7,10.5 "/>
          <rect x="12.5" y="13.6" transform="matrix(0.9221 -0.3871 0.3871 0.9221 -5.7605 6.5909)" width="2" height="8"/>
          <polygon points="9.2,7.3 9.2,18.5 12.2,15.6 12.6,15.5 17.4,15.5 "/>
        </svg>
      </span>
    </div>
  );
}

// ── Text that arrives a character at a time ─────────────────────────

/**
 * Types `text` into an input, letter by letter, without a single React render.
 *
 * The value is written straight onto the node: a controlled textarea would
 * re-render the whole screen sixty times for one sentence, which is the
 * difference between a mockup that plays and a page that stutters while it
 * does. Nothing else reads this value — it is a demo, and the only consumer
 * is the pixels.
 */
export function useTypewriter(
  target: RefObject<HTMLTextAreaElement | null>,
  text: string,
  {
    active,
    done,
    ms,
    resetKey,
  }: { active: boolean; done: boolean; ms: number; resetKey: unknown },
) {
  useEffect(() => {
    const node = target.current;
    if (!node) return;

    if (done) {
      node.value = text;
      return;
    }
    if (!active) {
      node.value = "";
      return;
    }

    const state = { count: 0 };
    const tween = gsap.to(state, {
      count: text.length,
      duration: ms / 1000,
      ease: "none",
      onUpdate: () => {
        node.value = text.slice(0, Math.round(state.count));
      },
    });

    return () => {
      tween.kill();
    };
  }, [active, done, ms, resetKey, target, text]);
}

/**
 * The same idea for text React does have to render — an answer arriving in a
 * message bubble, which is markdown and cannot be poked into the DOM.
 *
 * By word rather than by letter, and that is the whole optimisation: a
 * hundred-and-ten character answer is twenty-odd renders instead of a hundred
 * and ten, and at reading speed nobody can tell the difference between a
 * sentence that arrives in words and one that arrives in letters.
 */
export function useStreamedWords(
  text: string,
  { active, done, ms, resetKey }: { active: boolean; done: boolean; ms: number; resetKey: unknown },
): string {
  const words = useRef<readonly string[]>([]);
  const [count, setCount] = useState(0);

  if (words.current.join(" ") !== text) words.current = text.split(" ");

  useEffect(() => {
    setCount(0);
  }, [resetKey]);

  useEffect(() => {
    if (!active) return;
    const total = words.current.length;
    const state = { count: 0 };
    const tween = gsap.to(state, {
      count: total,
      duration: ms / 1000,
      ease: "none",
      onUpdate: () => setCount(Math.round(state.count)),
    });
    return () => {
      tween.kill();
    };
  }, [active, ms]);

  if (done) return text;
  if (!active) return "";
  return words.current.slice(0, count).join(" ");
}
