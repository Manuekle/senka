"use client";

// The LIVE pet: the same bloub engine (lib/bloub) sampled at 60 fps with
// rAF, like `BloubBot.vue` in the original project. Changing expression,
// shape or color MORPHS (0.45 s, `SHAPE_MORPH`) instead of cutting: the engine
// interpolates eyes, silhouette and gaze from the visible frame.
//
// Difference with `BloubAvatar` (static SMIL): that one is a pregenerated loop
// of ONE expression — blink and drift, still body — and regenerates the SVG
// from scratch on prop change, with no transition. This one keeps ONE
// `BotEngine` instance and feeds every change through dated
// `setExpression`/`setShape`, like the `BloubBot.vue` watchers.
//
// For ONE instance only (the playground): every frame is a setState at 60 fps.
// The catalog grids stay on SMIL, with no JS loops.

import { useEffect, useId, useRef, useState } from "react";
import {
  BotEngine,
  COLOR_BY_ID,
  themeCss,
  DEMI_VIEWBOX,
  EXPRESSION_BY_ID,
  RAYON,
  dotFill,
  SHAPE_BY_ID,
  type BotFrame,
  type ColorId,
  type ExpressionId,
  type ShapeId,
} from "@/lib/bloub";
import { NOTIF_BLUE } from "@/lib/bloub/decor";
import { cn } from "@/lib/utils";

function Dot({ dot }: { readonly dot: BotFrame["dots"][number] }) {
  const fill = dotFill(dot);
  if (dot.d) {
    return (
      <path
        d={dot.d}
        transform={`translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${RAYON})`}
        fill={fill}
        opacity={dot.opacity}
      />
    );
  }
  return <circle cx={dot.x} cy={dot.y} r={dot.r} fill={fill} opacity={dot.opacity} />;
}

export function BloubLive({
  expression = "neutre",
  shape = "nuage",
  color = "encre",
  size = 128,
  className,
  ariaLabel,
  still = false,
}: {
  readonly expression?: ExpressionId;
  readonly shape?: ShapeId;
  readonly color?: ColorId;
  /** width/height bound; the drawing scales by itself. */
  readonly size?: number;
  readonly className?: string;
  /** When set, the SVG is an image for screen readers; without it, decorative. */
  readonly ariaLabel?: string;
  /** No loop: a fixed frame (reduced-motion; changes jump to the final face). */
  readonly still?: boolean;
}) {
  // useId carries colons (":r1:"), invalid in a funciri — only characters
  // safe for `url(#...)` and the id attribute survive.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const maskId = `bloub-live-${uid}`;
  const rootId = `${maskId}-root`;

  const radii = SHAPE_BY_ID.get(shape)?.radii ?? null;
  const expr = EXPRESSION_BY_ID.get(expression) ?? null;
  const ink = COLOR_BY_ID.get(color)?.hex ?? "#0a0a0c";

  // ONE instance for the whole mount lifetime: morphs chain from the visible
  // frame because the engine keeps its history (prev + timestamps).
  const [engine] = useState(() => new BotEngine(RAYON, "idle", radii, expr));
  const clockRef = useRef(0);
  const lastRef = useRef(0);
  const [frame, setFrame] = useState<BotFrame>(() => engine.sample(0));

  // Prop changes on engine time: morph instead of jumping. The setters are
  // no-ops for the same reference, so mounting does nothing. In `still` mode
  // the ARRIVAL frame paints once (direct jump, correct for reduced-motion:
  // no animation but the final face).
  useEffect(() => {
    engine.setExpression(expr, clockRef.current);
    engine.setShape(radii, clockRef.current);
    if (still) setFrame(engine.sample(clockRef.current + BotEngine.SHAPE_MORPH));
  }, [engine, expr, radii, still]);

  // Scene clock with bounded delta, like `BloubBot.vue`: a hidden then
  // reshown tab resumes without jumping (rAF is suspended meanwhile).
  useEffect(() => {
    if (still) return;
    let raf = 0;
    const loop = (ms: number) => {
      raf = requestAnimationFrame(loop);
      const dt = lastRef.current ? Math.min((ms - lastRef.current) / 1000, 0.064) : 0;
      lastRef.current = ms;
      clockRef.current += dt;
      setFrame(engine.sample(clockRef.current));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine, still]);

  const VB = DEMI_VIEWBOX;

  return (
    <span
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      className={cn("inline-block leading-none", className)}
    >
      <svg
        id={rootId}
        className="bloub-root"
        width={size}
        height={size}
        viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`}
      >
        <defs>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x={-VB}
            y={-VB}
            width={VB * 2}
            height={VB * 2}
          >
            <path d={frame.bodyPath} fill="#fff" />
            {frame.eyes.map((eye, i) => (
              <path key={i} d={eye.d} transform={eye.matrix} opacity={eye.alpha} fill="#000" />
            ))}
            {frame.notch ? (
              <circle cx={frame.notch.x} cy={frame.notch.y} r={frame.notch.r} fill="#000" />
            ) : null}
          </mask>
          {frame.arcs.map((arc) => (
            <linearGradient
              key={arc.id}
              id={`${maskId}-${arc.id}`}
              gradientUnits="userSpaceOnUse"
              x1={arc.grad.x1}
              y1={arc.grad.y1}
              x2={arc.grad.x2}
              y2={arc.grad.y2}
            >
              {arc.grad.stops.map((c, i) => (
                <stop key={i} offset={i / (arc.grad.stops.length - 1)} stopColor={c} />
              ))}
            </linearGradient>
          ))}
        </defs>
        <g fill="none" strokeLinecap="round">
          {frame.arcs.map((arc) => (
            <path
              key={`b${arc.id}`}
              d={arc.back}
              stroke={`url(#${maskId}-${arc.id})`}
              strokeWidth={arc.width}
              opacity={arc.opacity}
            />
          ))}
        </g>
        {frame.dotsBehind ? (
          <g>
            {frame.dots.map((dot, i) => (
              <Dot key={`pb${i}`} dot={dot} />
            ))}
          </g>
        ) : null}
        <g opacity={frame.bodyAlpha}>
          {/* Opaque white backing in the body's exact shape. The eyes are
              holes punched through the body (that is what clips them at the
              silhouette edge); a hole shows whatever sits behind, so without
              this backing the back-half rings would reappear inside the eyes.
              White, not theme paper: eyes must read white in both themes. */}
          <path d={frame.bodyPath} fill="#fff" />
          <g mask={`url(#${maskId})`}>
            <rect x={-VB} y={-VB} width={VB * 2} height={VB * 2} fill="var(--bot-ink)" />
          </g>
        </g>
        {!frame.dotsBehind ? (
          <g>
            {frame.dots.map((dot, i) => (
              <Dot key={`pf${i}`} dot={dot} />
            ))}
          </g>
        ) : null}
        {frame.notif ? (
          <circle cx={frame.notif.x} cy={frame.notif.y} r={frame.notif.r} fill={NOTIF_BLUE} />
        ) : null}
        <g fill="none" strokeLinecap="round">
          {frame.arcs.map((arc) => (
            <path
              key={`f${arc.id}`}
              d={arc.front}
              stroke={`url(#${maskId}-${arc.id})`}
              strokeWidth={arc.width}
              opacity={arc.opacity}
            />
          ))}
        </g>
        <style>{themeCss(rootId, ink)}</style>
      </svg>
    </span>
  );
}
