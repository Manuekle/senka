"use client";

import type { ComponentProps, CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

import { ActionSwapText } from "@/components/motion/action-swap";
import { cn } from "@/lib/utils";

export type ScoreRingSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface ScoreRingProps extends Omit<ComponentProps<"div">, "children"> {
  /**
   * Current score.
   * Example: 8.2 with max={10} fills 82% of the ring.
   */
  value: number;

  /**
   * Maximum possible score.
   * @default 10
   */
  max?: number;

  /**
   * Component size.
   * @default "md"
   */
  size?: ScoreRingSize;

  /**
   * Optional custom label.
   * If not provided, the value is shown.
   */
  label?: string;

  /**
   * Optional decimal precision.
   * If omitted, integers show without decimals ("8")
   * and non-integers round to 1 ("8.2").
   */
  decimals?: number;

  /**
   * Custom diameter in px. Overrides `size` when set.
   */
  dimension?: number;

  /**
   * Explicit stroke color. When omitted it follows 3 bands:
   * 0–40 red, 40–80 yellow, 80–100 green.
   */
  tone?: string;
}

const SIZES: Record<
  ScoreRingSize,
  {
    dimension: number;
    strokeWidth: number;
    fontSize: number;
  }
> = {
  xs: { dimension: 48, strokeWidth: 4, fontSize: 15 },
  sm: { dimension: 64, strokeWidth: 5, fontSize: 20 },
  md: { dimension: 88, strokeWidth: 6.5, fontSize: 27 },
  lg: { dimension: 120, strokeWidth: 8, fontSize: 36 },
  xl: { dimension: 160, strokeWidth: 10, fontSize: 48 },
};

/** 3 bands: red 0–40, yellow 40–80, green 80–100. */
function ringToneFor(fraction: number): string {
  if (fraction >= 0.8) return "#10b981";
  if (fraction >= 0.4) return "#f59e0b";
  return "#e11d48";
}

export function ScoreRing({
  value,
  max = 10,
  size = "md",
  label,
  decimals,
  dimension: dimensionProp,
  tone,
  className,
  style,
  ...props
}: ScoreRingProps) {
  const reduce = useReducedMotion();

  const config = SIZES[size] ?? SIZES.md;
  const dimension = dimensionProp ?? config.dimension;
  // Keep proportions when a custom diameter overrides the preset.
  const scale = dimension / config.dimension;
  const strokeWidth = config.strokeWidth * scale;
  const fontSize = config.fontSize * scale;

  const center = dimension / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;

  const normalizedValue = Math.min(Math.max(value, 0), max);
  const progress = max > 0 ? normalizedValue / max : 0;

  // Tweened 0…1 — drives the arc. Instant under reduced motion,
  // animates from 0 on mount so the ring draws itself in.
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);
  useEffect(() => {
    if (reduce) return;
    const controls = animate(shownRef.current, progress, {
      duration: 0.65,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        shownRef.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [progress, reduce]);
  const display = reduce ? progress : shown;

  const displayValue =
    label ??
    (decimals !== undefined
      ? normalizedValue.toFixed(decimals)
      : Number.isInteger(normalizedValue)
        ? String(normalizedValue)
        : String(Math.round(normalizedValue * 10) / 10));

  const color = tone ?? ringToneFor(progress);
  const dashoffset = circumference - display * circumference;

  return (
    <div
      {...props}
      data-slot="score-ring"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={normalizedValue}
      aria-label={`Score ${displayValue} out of ${max}`}
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      style={
        {
          position: "relative",
          width: dimension,
          height: dimension,
          ...style,
        } as CSSProperties
      }
    >
      <svg
        width={dimension}
        height={dimension}
        viewBox={`0 0 ${dimension} ${dimension}`}
        aria-hidden="true"
        style={{
          display: "block",
          overflow: "visible",
          transform: "rotate(-90deg)",
        }}
      >
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--muted, #ECECF1)"
          strokeWidth={strokeWidth}
        />

        {/* Progress — one tone, round cap */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
        />
      </svg>

      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize,
          lineHeight: 1,
          fontWeight: 700,
          letterSpacing: "-0.05em",
          color: "var(--foreground, #20212B)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <ActionSwapText value={displayValue}>{displayValue}</ActionSwapText>
      </span>
    </div>
  );
}
