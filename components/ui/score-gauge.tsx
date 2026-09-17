"use client";

import type { ComponentProps, CSSProperties } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

import { ActionSwapText } from "@/components/motion/action-swap";
import { Badge } from "@/components/ui/badge";
import { SCORE_TONE_SOLID, toneForScore, type ScoreTone } from "@/lib/score-tone";
import { cn } from "@/lib/utils";

export type ScoreGaugeSize = "sm" | "md" | "lg" | "xl";

export type ScoreGaugeTone = ScoreTone;

export interface ScoreGaugeProps extends Omit<ComponentProps<"div">, "children"> {
  value: number;
  max?: number;

  size?: ScoreGaugeSize;

  /** Text under the score. */
  label?: string;

  /** Bottom badge. Omit or pass "" to hide. */
  status?: string;

  /**
   * Badge tone. When omitted it comes from the value:
   * ≥80 green, ≥60 blue, ≥40 purple, below red.
   */
  statusTone?: ScoreGaugeTone;

  /** Show the dot at the end of the progress (hidden at 100%). */
  showDot?: boolean;

  /**
   * Optional decimal precision.
   * If omitted, integers show without decimals ("79")
   * and non-integers round to 1 ("79.5").
   */
  decimals?: number;
}

const SIZES: Record<
  ScoreGaugeSize,
  {
    width: number;
    stroke: number;
    valueSize: number;
    labelSize: number;
    badgeClass: string;
  }
> = {
  sm: { width: 72, stroke: 5, valueSize: 18, labelSize: 8, badgeClass: "px-1.5 py-px text-[9px]" },
  md: { width: 100, stroke: 6, valueSize: 24, labelSize: 9, badgeClass: "px-1.5 py-px text-[10px]" },
  lg: { width: 136, stroke: 7, valueSize: 32, labelSize: 11, badgeClass: "px-2 py-px text-[11px]" },
  xl: { width: 180, stroke: 9, valueSize: 42, labelSize: 12, badgeClass: "" },
};

const TONE_CLASS: Record<ScoreGaugeTone, string> = {
  blue: "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  green: "border-transparent bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  red: "border-transparent bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  purple: "border-transparent bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180;

  // Rounded to 3 decimals: Math.sin/cos can differ in the last ULP
  // between Node (SSR) and the browser, which React flags as a
  // hydration mismatch. Rounding erases that.
  return {
    x: Math.round((cx + radius * Math.cos(radians)) * 1000) / 1000,
    y: Math.round((cy + radius * Math.sin(radians)) * 1000) / 1000,
  };
}

function createArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);

  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
  ].join(" ");
}

export function ScoreGauge({
  value,
  max = 100,
  size = "md",
  label = "Sternify Score",
  status = "To improve",
  statusTone,
  showDot = true,
  decimals,
  className,
  style,
  ...props
}: ScoreGaugeProps) {
  const gradientId = useId().replace(/:/g, "");
  const reduce = useReducedMotion();

  const config = SIZES[size] ?? SIZES.md;

  const width = config.width;
  const height = width * 0.9;

  const cx = width / 2;
  const cy = width / 2;

  const radius = width / 2 - config.stroke / 2 - 4;

  /*
   * Arc (standard math angles, y down):
   * starts bottom-left (140°), travels over the top,
   * ends bottom-right (400°). 260° total, open bottom.
   */
  const startAngle = 140;
  const endAngle = 400;

  const totalAngle = endAngle - startAngle;

  const normalized = clamp(value, 0, max);
  const percentage = max > 0 ? normalized / max : 0;

  // One tween drives arc AND dot together — two separate easings
  // made the dot jump ahead of / behind the arc tip. Instant with
  // reduced motion, draws from 0 on mount.
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);
  useEffect(() => {
    if (reduce) return;
    const controls = animate(shownRef.current, percentage, {
      duration: 0.65,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        shownRef.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [percentage, reduce]);
  const display = reduce ? percentage : shown;

  const arc = createArc(cx, cy, radius, startAngle, endAngle);
  const dot = polarToCartesian(cx, cy, radius, startAngle + totalAngle * display);

  const displayValue =
    decimals !== undefined
      ? normalized.toFixed(decimals)
      : Number.isInteger(normalized)
        ? String(normalized)
        : String(Math.round(normalized * 10) / 10);

  const tone = statusTone ?? toneForScore(percentage);
  const dotColor = SCORE_TONE_SOLID[tone];

  // El bloque central se ancla al centro del círculo (cy) más medio
  // trazo: con un % fijo el texto chocaba con el arco superior en
  // sm/md. Los gaps escalan con el ancho.
  const contentTopPct = ((cy + config.stroke / 2) / height) * 100;
  const labelGap = Math.round(width * 0.035 * 10) / 10;
  const badgeGap = Math.round(width * 0.07 * 10) / 10;

  // Complete at 100%: no dot, clean ring.
  const showEndDot = showDot && display > 0 && percentage < 1;

  return (
    <div
      {...props}
      data-slot="score-gauge"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={normalized}
      aria-label={`${label}: ${displayValue}`}
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      style={{ position: "relative", width, height, ...style } as CSSProperties}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#FA6077" />
            <stop offset="30%" stopColor="#FF7A78" />
            <stop offset="47%" stopColor="#F3C76B" />
            <stop offset="68%" stopColor="#16B9DF" />
            <stop offset="100%" stopColor="#129FEA" />
          </linearGradient>
        </defs>

        {/* Background */}
        <path
          d={arc}
          fill="none"
          stroke="var(--muted, #ECECF1)"
          strokeWidth={config.stroke}
          strokeLinecap="round"
        />

        {/* Progress */}
        <path
          d={arc}
          pathLength={100}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={config.stroke}
          strokeLinecap="round"
          strokeDasharray={`${display * 100} 100`}
        />

        {/* End dot — same tween as the arc, so it never jumps */}
        {showEndDot && (
          <>
            <circle cx={dot.x} cy={dot.y} r={config.stroke * 0.9} fill="#ffffff" />
            <circle cx={dot.x} cy={dot.y} r={config.stroke * 0.45} fill={dotColor} />
          </>
        )}
      </svg>

      {/* Center */}
      <div
        style={{
          position: "absolute",
          top: `${contentTopPct}%`,
          left: "50%",
          transform: "translate(-50%, -50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            color: "var(--foreground, #18181b)",
            fontSize: config.valueSize,
            fontWeight: 700,
            letterSpacing: "-0.055em",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <ActionSwapText value={displayValue}>{displayValue}</ActionSwapText>
        </span>

        <span
          style={{
            marginTop: labelGap,
            fontSize: config.labelSize,
            fontWeight: 500,
            color: "var(--foreground, #27272a)",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>

        {status ? (
          <Badge
            variant="secondary"
            className={cn(config.badgeClass, TONE_CLASS[tone])}
            style={{ marginTop: badgeGap, whiteSpace: "nowrap" }}
          >
            <ActionSwapText value={`${tone}:${status}`}>{status}</ActionSwapText>
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
