"use client";

import { useId, useRef, type ReactNode } from "react";
import { useStageLive } from "./use-stage-live";
import styles from "./instrument-art.module.css";

export { styles as instrumentStyles };

type Material = { metal: string; edge: string; light: string; beam: string };

/** Local SVG IDs remain stable when the capability grid changes order. */
export function InstrumentArt({ children, tone = "blue", className = "" }: {
  readonly children: (material: Material) => ReactNode;
  readonly tone?: "blue" | "jade" | "violet" | "amber";
  readonly className?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const live = useStageLive(ref);
  const material = Object.fromEntries(["metal", "edge", "light", "beam"].map(key => [key, `url(#${id}-${key})`])) as Material;
  return (
    <div aria-hidden="true" className={`${styles.art} ${className}`} data-live={live} data-tone={tone} ref={ref}>
      <svg viewBox="0 0 320 230" fill="none">
        <defs>
          <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="var(--art-metal-top)" />
            <stop offset=".5" stopColor="var(--art-metal)" />
            <stop offset="1" stopColor="var(--art-metal-bottom)" />
          </linearGradient>
          <linearGradient id={`${id}-edge`} x1="0" y1="0" x2=".7" y2="1">
            <stop stopColor="var(--art-ink)" stopOpacity=".12" />
            <stop offset=".45" stopColor="var(--art-accent)" stopOpacity=".65" />
            <stop offset="1" stopColor="var(--art-ink)" stopOpacity=".08" />
          </linearGradient>
          <radialGradient id={`${id}-light`}>
            <stop stopColor="var(--art-accent)" stopOpacity=".19" />
            <stop offset=".5" stopColor="var(--art-accent)" stopOpacity=".065" />
            <stop offset="1" stopColor="var(--art-accent)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}-beam`} x1="0" y1="1" x2="0" y2="0">
            <stop stopColor="var(--art-accent)" stopOpacity=".28" />
            <stop offset="1" stopColor="var(--art-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className={styles.grid}>
          {[64, 112, 160, 208, 256].map(x => <path key={x} d={`M${x} 30V200`} />)}
          {[62, 110, 158].map(y => <path key={y} d={`M24 ${y}H296`} />)}
        </g>
        <ellipse cx="160" cy="125" rx="148" ry="102" fill={material.light} />
        {children(material)}
        <g className={styles.fiducials}>
          <path d="M22 49v-7h7m262 0h7v7M22 181v7h7m262 0h7v-7" />
          <circle cx="47" cy="85" r="1" /><circle cx="280" cy="145" r="1" />
        </g>
      </svg>
    </div>
  );
}

export function ArtLabel({ x = 160, y = 210, children }: { readonly x?: number; readonly y?: number; readonly children: ReactNode }) {
  return <text className={styles.label} x={x} y={y} textAnchor="middle">{children}</text>;
}

export function VoiceInstrument() {
  return (
    <InstrumentArt tone="violet" className={styles.voice}>
      {m => <>
        {/* Incoming voices converge on the agent; the outgoing signal is one voice. */}
        <g stroke={m.edge} strokeWidth=".8">
          {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M10 ${38 + i * 18} C72 ${38 + i * 18}, 72 106, 135 106`} opacity={.35 + i * .05} />)}
        </g>
        <path d="M176 106H311" stroke={m.edge} />
        <g className={styles.wave}>
          {[0, 1, 2].map(i => <path key={i} d={`M181 106 C194 ${87 - i * 8}, 199 ${131 + i * 4}, 211 106 S228 ${81 - i * 5}, 236 106 S250 ${121 + i * 5}, 260 106 S282 98, 310 106`} stroke="var(--art-accent)" strokeOpacity={.65 - i * .2} strokeWidth={i === 0 ? 1.3 : .7} />)}
        </g>
        <circle cx="153" cy="106" r="63" stroke={m.edge} strokeWidth=".6" strokeDasharray="1 6" />
        <circle cx="153" cy="106" r="49" fill={m.metal} stroke={m.edge} />
        <circle cx="153" cy="106" r="48" fill={m.light} />
        <ellipse cx="153" cy="85" rx="29" ry="16" fill={m.light} />
        <circle className={styles.orbit} cx="153" cy="106" r="55" stroke="var(--art-accent)" strokeOpacity=".5" strokeDasharray="23 323" />
        <g stroke="var(--art-accent)" strokeWidth="2" strokeLinecap="round">
          {[14, 26, 39, 24, 15].map((h, i) => <path className={styles.voiceBar} style={{ animationDelay: `${i * -0.31}s` }} key={i} d={`M${135 + i * 9} ${106 - h / 2}v${h}`} />)}
        </g>
        <circle cx="194" cy="75" r="8" fill={m.metal} stroke={m.edge} />
        <circle cx="194" cy="75" r="2.5" fill="var(--art-accent)" />
        <g className={styles.transcript}>
          <rect x="67" y="174" width="186" height="31" rx="8" fill={m.metal} stroke={m.edge} strokeOpacity=".5" />
          <g stroke="var(--art-accent)" strokeLinecap="round" strokeWidth="1.5"><path d="M81 187v5m4-8v11m4-8v5" /></g>
          <path d="M101 186h94m-94 7h63" stroke="var(--art-ink)" strokeOpacity=".2" strokeLinecap="round" strokeWidth="2" />
          <path d="m231 189 3 3 5-6" stroke="var(--art-accent)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </>}
    </InstrumentArt>
  );
}
