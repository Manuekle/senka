"use client";

import type { ReactNode } from "react";
import { ArtLabel, InstrumentArt, instrumentStyles as styles } from "./instrument-art";

/** These illustrations describe existing guarantees, without adding metrics or certifications. */
export function DatabaseScene() {
  return <InstrumentArt>{m => <>
    <path d="m50 151 110-56 110 56-110 57Z" stroke={m.edge} fill={m.metal} opacity=".55" />
    <path d="m68 152 92-46 92 46-92 45Z" stroke={m.edge} opacity=".4" />
    <g className={styles.lift}>
      {[116, 90, 64].map((y, i) => <g key={y}>
        <path d={`M107 ${y}v27c0 26 106 26 106 0V${y}`} fill={m.metal} stroke={m.edge} />
        <ellipse cx="160" cy={y} rx="53" ry="17" fill={m.metal} stroke={m.edge} />
        <path d={`M117 ${y + 26}q43 20 86 0`} stroke="var(--art-accent)" strokeOpacity=".22" />
        <circle cx="192" cy={y + 26} r="1.8" fill="var(--art-accent)" opacity={1 - i * .2} />
      </g>)}
      <ellipse cx="160" cy="64" rx="40" ry="11" stroke={m.edge} strokeOpacity=".5" />
    </g>
    <path d="M42 110h29l36 18M213 128l28-18h36" stroke={m.edge} />
    <path className={styles.signal} d="M42 110h29l36 18" stroke="var(--art-accent)" />
    <ArtLabel>PostgreSQL · localhost</ArtLabel>
  </>}</InstrumentArt>;
}

export function SandboxScene() {
  return <InstrumentArt tone="violet">{m => <>
    <path d="m59 153 101-54 101 54-101 55Z" fill={m.metal} stroke={m.edge} />
    <path d="m75 149 85-45 85 45-85 46Z" stroke={m.edge} opacity=".5" />
    <path d="M100 125V59l60-32 60 32v66l-60 32Z" fill={m.beam} stroke={m.edge} strokeOpacity=".5" />
    <path d="m100 59 60 33 60-33M160 92v65" stroke={m.edge} strokeDasharray="3 4" />
    <g className={styles.lift}>
      <path d="m124 111 36-20 36 20v33l-36 20-36-20Z" fill={m.metal} stroke={m.edge} />
      <path d="m124 111 36 20 36-20m-36 20v33" stroke={m.edge} />
      <path d="m149 108-7 4 7 4m22-8 7 4-7 4m-8-12-6 17" stroke="var(--art-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
    <path d="M220 110h22m10 0h25" stroke={m.edge} strokeDasharray="2 4" />
    <path d="m242 105 9 10m0-10-9 10" stroke="var(--art-accent)" strokeWidth="1.3" />
    <ArtLabel>Docker · network: deny-all</ArtLabel>
  </>}</InstrumentArt>;
}

export function WebhookScene() {
  return <InstrumentArt tone="jade">{m => <>
    {[0, 1, 2].map(i => <g key={i} transform={`translate(${i * 8} ${-i * 9})`} opacity={.35 + i * .2}>
      <rect x="39" y="87" width="61" height="76" rx="8" fill={m.metal} stroke={m.edge} />
      <path d="M51 104h24m-24 8h34m-34 8h28" stroke="var(--art-ink)" strokeOpacity=".25" />
      <text x="51" y="143" className={styles.detail}>{'{…}'}</text>
    </g>)}
    <path d="M115 113h45m18 0h42" stroke={m.edge} />
    <path className={styles.signal} d="M115 113h105" stroke="var(--art-accent)" strokeWidth="1.5" />
    <rect x="155" y="52" width="13" height="122" rx="6.5" fill={m.metal} stroke={m.edge} />
    <rect className={styles.scan} x="160" y="61" width="3" height="104" rx="1.5" fill="var(--art-accent)" />
    <circle cx="243" cy="113" r="38" stroke={m.edge} strokeWidth=".7" />
    <circle cx="243" cy="113" r="28" fill={m.metal} stroke={m.edge} />
    <path d="m230 112 9 9 17-18" stroke="var(--art-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <ArtLabel>payload → HMAC → verificado</ArtLabel>
  </>}</InstrumentArt>;
}

export function KeysScene() {
  return <InstrumentArt tone="amber">{m => <>
    <rect x="78" y="52" width="164" height="126" rx="16" fill={m.metal} stroke={m.edge} opacity=".5" />
    <rect x="84" y="45" width="152" height="126" rx="13" fill={m.metal} stroke={m.edge} />
    <path d="M98 66h24m77 0h23M99 151h123" stroke={m.edge} />
    <circle cx="160" cy="107" r="41" fill={m.metal} stroke={m.edge} />
    <circle cx="160" cy="107" r="34" stroke={m.edge} strokeDasharray="1 4" />
    <g className={styles.lift} stroke="var(--art-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="150" cy="103" r="9" />
      <path d="m157 109 17 17m-5-5 5-5m-10 0 5-5" />
    </g>
    <g fill="var(--art-accent)" opacity=".45">{[0, 1, 2, 3, 4, 5, 6, 7].map(i => <circle key={i} cx={133 + i * 8} cy="151" r="1.3" />)}</g>
    <path d="M44 111h34m164 0h34" stroke={m.edge} strokeDasharray="2 5" />
    <ArtLabel>credenciales · en tu servidor</ArtLabel>
  </>}</InstrumentArt>;
}

export function AllowlistScene() {
  return <InstrumentArt tone="jade">{m => <>
    <path d="M50 114h59q17 0 17-17V85q0-17 17-17h66M109 114q17 0 17 17v10q0 17 17 17h66" stroke={m.edge} />
    <path className={styles.signal} d="M50 114h59q17 0 17-17V85q0-17 17-17h66" stroke="var(--art-accent)" strokeWidth="1.3" />
    <path d="m64 91 22 9v21q0 16-22 27-22-11-22-27v-21Z" fill={m.metal} stroke={m.edge} />
    <path d="m55 117 7 7 12-14" stroke="var(--art-accent)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="181" y="49" width="105" height="39" rx="9" fill={m.metal} stroke={m.edge} />
    <circle cx="197" cy="68" r="4" fill="var(--art-accent)" opacity=".55" />
    <text x="208" y="71" className={styles.detail}>HTTPS :443</text>
    <rect x="181" y="138" width="105" height="39" rx="9" fill={m.metal} stroke={m.edge} opacity=".5" />
    <path d="m193 154 7 7m0-7-7 7" stroke="var(--muted-foreground)" />
    <text x="208" y="161" className={styles.detail}>10.0.0.5</text>
    <ArtLabel>hosts autorizados · acceso selectivo</ArtLabel>
  </>}</InstrumentArt>;
}

export function TracesScene() {
  return <InstrumentArt tone="blue">{m => <>
    <rect x="42" y="42" width="236" height="141" rx="12" fill={m.metal} stroke={m.edge} />
    <path d="M42 70h236" stroke={m.edge} strokeOpacity=".5" />
    <circle cx="56" cy="56" r="2" fill="var(--art-accent)" /><path d="M65 56h46" stroke="var(--art-ink)" strokeOpacity=".25" />
    <text x="215" y="59" className={styles.detail}>trace_id</text>
    {[92, 132, 172, 212, 252].map(x => <path key={x} d={`M${x} 80v87`} stroke="var(--art-ink)" strokeOpacity=".055" />)}
    {[{ x: 61, w: 189 }, { x: 86, w: 127 }, { x: 113, w: 79 }, { x: 143, w: 40 }].map((bar, i) => <g key={bar.x}>
      {i > 0 && <path d={`M${bar.x - 14} ${84 + i * 21}v12h10`} stroke={m.edge} />}
      <rect x={bar.x} y={82 + i * 21} width={bar.w} height="11" rx="3" fill={m.beam} stroke={m.edge} />
      <path className={styles.scan} style={{ animationDelay: `${i * -.8}s` }} d={`M${bar.x + 4} ${85 + i * 21}h${bar.w - 8}`} stroke="var(--art-accent)" strokeOpacity=".6" strokeLinecap="round" />
    </g>)}
    <ArtLabel>OpenTelemetry · tu colector</ArtLabel>
  </>}</InstrumentArt>;
}

export const SECURITY_ART: Record<string, () => ReactNode> = {
  database: DatabaseScene,
  sandbox: SandboxScene,
  webhooks: WebhookScene,
  keys: KeysScene,
  allowlist: AllowlistScene,
  traces: TracesScene,
};
