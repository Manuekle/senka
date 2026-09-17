"use client";

import type { ComponentProps } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

export type GaugeSize = "sm" | "md" | "lg";

export interface GaugeMeterProps extends Omit<ComponentProps<"div">, "children"> {
  value: number;
  max?: number;
  color?: string;
  size?: GaugeSize;
  thickness?: number;
  showValue?: boolean;
  label?: string;
}

/**
 * Custom blade artwork, drawn in its own frame and rotated into place
 * by the caller. Pivot ≈ the light hub hole; tip ≈ the far end.
 * Estimates from the artwork — nudge the constants if it drifts.
 */
const BLADE_PIVOT = { x: 955, y: 748 } as const;
const BLADE_TIP_DIST = 772.6;
const BLADE_TIP_COMPASS = 290;

const BLADE_SILHOUETTE =
  "M 230 481.079 C 224.831 483.416, 219.540 488.153, 217.246 492.500 C 215.058 496.644, 215.092 506.411, 217.314 512.186 C 219.443 517.719, 225.351 523.408, 231.878 526.209 C 234.420 527.300, 246.175 532.598, 258 537.983 C 269.825 543.368, 283.325 549.460, 288 551.520 C 306.518 559.681, 337.643 573.818, 369.593 588.579 C 379.543 593.177, 396.643 600.951, 407.593 605.855 C 418.542 610.760, 430.200 616.003, 433.500 617.506 C 436.800 619.010, 444 622.261, 449.500 624.730 C 455 627.199, 464.390 631.459, 470.366 634.197 C 476.343 636.935, 484.668 640.671, 488.866 642.498 C 493.065 644.326, 502.125 648.385, 509 651.519 C 515.875 654.654, 525.325 658.916, 530 660.991 C 534.675 663.067, 541.650 666.215, 545.500 667.989 C 551.728 670.857, 573.240 680.649, 578.500 683.010 C 579.600 683.504, 591.075 688.719, 604 694.600 C 616.925 700.481, 631.775 707.202, 637 709.535 C 642.225 711.869, 650.100 715.464, 654.500 717.525 C 658.900 719.586, 667.900 723.639, 674.500 726.532 C 681.100 729.425, 693.025 734.807, 701 738.493 C 719.727 747.147, 724.394 749.275, 736.500 754.683 C 746.206 759.018, 761.325 765.908, 796.500 782.026 C 818.809 792.248, 841.546 802.450, 851.500 806.703 C 862.567 811.432, 867.104 814.180, 877.500 822.449 C 893.553 835.218, 901.991 840.086, 916.698 845.063 C 928.603 849.093, 937.935 850.324, 952.165 849.744 C 966.938 849.143, 976.412 846.827, 989.532 840.612 C 1000.567 835.385, 1006.137 831.727, 1015.243 823.729 C 1028.885 811.747, 1039.989 793.146, 1044.725 774.340 C 1047.140 764.755, 1047.448 761.705, 1047.388 748 C 1047.334 735.508, 1046.913 731.011, 1045.220 724.825 C 1039.071 702.351, 1026.622 683.420, 1008.526 669.020 C 1000.207 662.401, 983.997 654.484, 972.496 651.423 C 960.994 648.362, 946.155 647.042, 935.500 648.133 C 931.100 648.584, 922.550 649.233, 916.500 649.576 C 903.800 650.296, 902.212 649.980, 856 637.535 C 814.874 626.459, 797.457 621.852, 765.500 613.594 C 732.354 605.029, 723.725 602.780, 698 596.004 C 687.825 593.323, 673.425 589.552, 666 587.624 C 658.575 585.695, 644.850 582.097, 635.500 579.629 C 619.372 575.370, 608.028 572.447, 522.500 550.508 C 502.700 545.429, 460.175 534.416, 428 526.034 C 367.397 510.246, 280.735 488.201, 266.138 484.859 C 261.539 483.806, 254.573 482.057, 250.658 480.972 C 241.638 478.473, 235.695 478.503, 230 481.079 Z";

const BLADE_HOLE =
  "M 944 701.126 C 925.090 704.260, 908.532 720.286, 903.994 739.847 C 898.925 761.700, 912.479 786.854, 933.757 795.082 C 941.712 798.158, 955.627 798.832, 963.563 796.525 C 972.805 793.838, 978.969 790.218, 985.536 783.621 C 1005.124 763.943, 1004.738 733.271, 984.658 713.784 C 974.353 703.783, 958.237 698.766, 944 701.126 Z";

const GAUGES: Record<
  GaugeSize,
  {
    width: number;
    height: number;
    needleLength: number;
    fontSize: number;
  }
> = {
  sm: { width: 120, height: 72, needleLength: 30, fontSize: 13 },
  md: { width: 150, height: 88, needleLength: 38, fontSize: 14 },
  lg: { width: 180, height: 104, needleLength: 46, fontSize: 16 },
};

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  // Rounded to 3 decimals: Math.sin/cos can differ in the last ULP
  // between Node (SSR) and the browser, which React flags as a
  // hydration mismatch. Rounding erases that.
  return {
    x: Math.round((cx + radius * Math.cos(angleRad)) * 1000) / 1000,
    y: Math.round((cy + radius * Math.sin(angleRad)) * 1000) / 1000,
  };
}

/**
 * Full semicircle left → top → right. The progress path reuses this exact
 * `d` and reveals with dasharray, so the bbox gradient stays fixed: before,
 * the path only spanned the visible slice and the gradient stretched into
 * it, splitting low values into two tones.
 */
function fullArc(cx: number, cy: number, radius: number) {
  const left = polarToCartesian(cx, cy, radius, 270);
  const right = polarToCartesian(cx, cy, radius, 90);
  return `M ${left.x} ${left.y} A ${radius} ${radius} 0 1 1 ${right.x} ${right.y}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function GaugeMeter({
  value,
  max = 100,
  color = "#10b981",
  size = "sm",
  thickness = 8,
  showValue = false,
  label,
  className,
  style,
  ...props
}: GaugeMeterProps) {
  const gradientId = useId().replace(/:/g, "");

  const config = GAUGES[size] ?? GAUGES.sm;
  const { width, height, fontSize } = config;
  const cx = width / 2;
  const cy = height - 8;
  const radius = Math.min(width / 2 - 12, height - 10);

  const normalized = clamp(value, 0, max);
  const percentage = max > 0 ? normalized / max : 0;

  // Tweened 0…1 — mueve arco y aguja juntos (el path `d` no
  // transiciona por CSS). Instantáneo con reduced motion,
  // anima desde 0 al montar.
  const reduce = useReducedMotion();
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

  // polarToCartesian habla en brújula: 0=arriba, 90=derecha,
  // 180=abajo, 270=izquierda. El gauge barre izquierda (270)
  // → arriba (360) → derecha (450).
  const endAngle = 270 + display * 180;

  const arc = fullArc(cx, cy, radius);

  const tickAngles = Array.from({ length: 17 }, (_, i) => 270 + i * 11.25);

  return (
    <div
      {...props}
      data-slot="gauge-meter"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={normalized}
      aria-label={label ?? `Gauge value ${normalized} of ${max}`}
      className={cn("inline-flex shrink-0 flex-col items-center gap-1", className)}
      style={style}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        style={{ display: "block", overflow: "visible" }}
      >
        <defs>
          {/* Monocromo: el mismo tono, de translúcido a sólido. */}
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="55%" stopColor={color} stopOpacity={0.65} />
            <stop offset="100%" stopColor={color} stopOpacity={1} />
          </linearGradient>
        </defs>

        {tickAngles.map((angle, index) => {
          const outer = polarToCartesian(cx, cy, radius + 2, angle);
          const inner = polarToCartesian(cx, cy, radius - (index % 4 === 0 ? 11 : 7), angle);

          return (
            <line
              key={index}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="var(--border, #d9d9de)"
              strokeWidth={index % 4 === 0 ? 1.6 : 1}
              strokeLinecap="round"
            />
          );
        })}

        <path
          d={arc}
          fill="none"
          stroke="var(--muted, #ececf1)"
          strokeWidth={thickness}
          strokeLinecap="round"
        />

        <path
          d={arc}
          pathLength={100}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${display * 100} 100`}
        />

        <g
          transform={`translate(${cx} ${cy}) rotate(${endAngle - BLADE_TIP_COMPASS}) scale(${config.needleLength / BLADE_TIP_DIST}) translate(${-BLADE_PIVOT.x} ${-BLADE_PIVOT.y})`}
        >
          <defs>
            <clipPath id={`${gradientId}-blade`}>
              <path d={BLADE_SILHOUETTE} />
            </clipPath>
          </defs>
          <path d={BLADE_SILHOUETTE} fill="#45454c" fillRule="evenodd" />
          <g clipPath={`url(#${gradientId}-blade)`}>
            <path d={BLADE_HOLE} fill="#d3d8e0" fillRule="evenodd" />
          </g>
        </g>

        <circle cx={cx} cy={cy} r={5} fill="#45454c" />
        <circle cx={cx} cy={cy} r={2.5} fill="#d3d8e0" />
      </svg>

      {showValue ? (
        <span
          aria-hidden="true"
          style={{
            fontSize,
            fontWeight: 600,
            color: "var(--foreground, #18181b)",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {normalized}
        </span>
      ) : null}
    </div>
  );
}
