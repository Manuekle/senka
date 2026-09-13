"use client";

import { ArtLabel, InstrumentArt, instrumentStyles as styles } from "./instrument-art";

export function KnowledgeScene() {
  return <InstrumentArt>{m => <>
    {[0, 1, 2].map(i => <g key={i} transform={`translate(${i * 13} ${-i * 12})`} opacity={.3 + i * .25}>
      <path d="M44 92h47l15 15v62H44Z" fill={m.metal} stroke={m.edge} />
      <path d="M91 92v15h15M55 124h38m-38 8h29m-29 8h35m-35 8h19" stroke={m.edge} />
    </g>)}
    <path d="M132 119c33 0 31-25 62-25m-62 25c33 0 31 25 62 25" stroke={m.edge} />
    <path className={styles.signal} d="M132 119c33 0 31-25 62-25" stroke="var(--art-accent)" />
    <g className={styles.lift}>
      <rect x="184" y="53" width="91" height="117" rx="10" fill={m.metal} stroke={m.edge} />
      <rect x="195" y="67" width="25" height="25" rx="6" fill={m.beam} stroke={m.edge} />
      <path d="m202 79 4 4 7-8" stroke="var(--art-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M197 107h60m-60 8h52m-52 8h58m-58 8h38" stroke="var(--art-ink)" strokeOpacity=".2" strokeLinecap="round" strokeWidth="2" />
      <rect x="195" y="143" width="49" height="13" rx="4" fill={m.beam} />
      <text x="200" y="152" className={styles.detail}>fuente [1]</text>
    </g>
    <ArtLabel>tus documentos → una respuesta</ArtLabel>
  </>}</InstrumentArt>;
}

export function HandoffScene() {
  return <InstrumentArt tone="violet">{m => <>
    <path d="M74 113h167" stroke={m.edge} />
    <path className={styles.signal} d="M74 113h167" stroke="var(--art-accent)" strokeWidth="1.5" />
    <circle cx="83" cy="113" r="34" fill={m.metal} stroke={m.edge} />
    <g stroke="var(--muted-foreground)" strokeWidth="1.4" strokeLinecap="round">
      <rect x="69" y="103" width="28" height="22" rx="6" /><path d="M83 99v4m-7 9v3m14-3v3m-12 5h10" />
    </g>
    <rect x="137" y="98" width="43" height="30" rx="8" fill={m.metal} stroke={m.edge} />
    <path d="M149 113h17m-5-5 5 5-5 5" stroke="var(--art-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="237" cy="113" r="46" stroke={m.edge} strokeDasharray="2 5" />
    <g className={styles.lift}>
      <circle cx="237" cy="113" r="35" fill={m.metal} stroke={m.edge} />
      <circle cx="237" cy="105" r="8" stroke="var(--art-accent)" strokeWidth="1.5" />
      <path d="M222 130v-4c0-14 30-14 30 0v4" stroke="var(--art-accent)" strokeWidth="1.5" />
    </g>
    <path d="M88 159v11q0 8 8 8h136q8 0 8-8v-11" stroke={m.edge} strokeDasharray="2 4" />
    <ArtLabel>agente → persona · con contexto</ArtLabel>
  </>}</InstrumentArt>;
}

export function CalendarScene() {
  return <InstrumentArt tone="amber">{m => <>
    <rect x="64" y="59" width="199" height="121" rx="12" fill={m.metal} stroke={m.edge} opacity=".4" />
    <rect x="57" y="49" width="199" height="121" rx="12" fill={m.metal} stroke={m.edge} />
    <path d="M57 80h199M82 42v16m148-16v16" stroke={m.edge} strokeWidth="1.5" strokeLinecap="round" />
    <text x="75" y="69" className={styles.detail}>ESTA SEMANA</text>
    <path d="m223 63-3 3 3 3m13-6 3 3-3 3" stroke="var(--muted-foreground)" />
    {Array.from({ length: 21 }, (_, i) => <rect key={i} x={73 + (i % 7) * 24} y={92 + Math.floor(i / 7) * 22} width="15" height="13" rx="3" fill={i === 10 ? m.beam : m.metal} stroke={m.edge} strokeOpacity={i === 10 ? 1 : .28} />)}
    <g className={styles.lift}>
      <rect x="130" y="150" width="127" height="35" rx="8" fill={m.metal} stroke={m.edge} />
      <circle cx="146" cy="168" r="7" fill={m.beam} />
      <path d="m143 168 2 2 4-4" stroke="var(--art-accent)" strokeLinecap="round" />
      <text x="160" y="171" className={styles.detail}>jue · 10:30</text>
    </g>
    <ArtLabel>disponibilidad → turno reservado</ArtLabel>
  </>}</InstrumentArt>;
}

export function LeadsScene() {
  return <InstrumentArt>{m => <>
    <rect x="36" y="69" width="73" height="95" rx="10" fill={m.metal} stroke={m.edge} />
    <rect x="44" y="77" width="57" height="43" rx="5" fill={m.beam} />
    <path d="m49 109 12-14 11 8 13-17 11 23" stroke={m.edge} />
    <path d="M47 133h41m-41 8h28" stroke="var(--art-ink)" strokeOpacity=".22" strokeWidth="2" strokeLinecap="round" />
    <path d="M109 116h23q14 0 14-14V87q0-12 12-12h15m-27 29v45q0 12 12 12h15" stroke={m.edge} />
    <path className={styles.signal} d="M109 116h23q14 0 14-14V87q0-12 12-12h15" stroke="var(--art-accent)" strokeWidth="1.4" />
    {[66, 138].map((y, i) => <g key={y} className={i === 0 ? styles.lift : undefined} opacity={i === 0 ? 1 : .6}>
      <rect x="174" y={y - 13} width="111" height="49" rx="9" fill={m.metal} stroke={m.edge} />
      <circle cx="192" cy={y + 10} r="9" fill={m.beam} stroke={m.edge} />
      <path d={`M208 ${y + 5}h57m-57 10h35`} stroke="var(--art-ink)" strokeOpacity=".23" strokeWidth="2" strokeLinecap="round" />
    </g>)}
    <rect x="219" y="90" width="57" height="19" rx="5" fill={m.metal} stroke={m.edge} />
    <text x="226" y="103" className={styles.detail}>hola ↗</text>
    <ArtLabel>campaña → contacto → conversación</ArtLabel>
  </>}</InstrumentArt>;
}

export function PaymentsScene() {
  return <InstrumentArt tone="jade">{m => <>
    <g transform="rotate(-9 130 116)" opacity=".5">
      <rect x="54" y="60" width="143" height="108" rx="12" fill={m.metal} stroke={m.edge} />
      <path d="M68 80h89m-89 12h61" stroke={m.edge} />
    </g>
    <g className={styles.lift}>
      <rect x="86" y="47" width="153" height="137" rx="12" fill={m.metal} stroke={m.edge} />
      <path d="M101 68h31m66 0h25" stroke={m.edge} />
      <text x="102" y="104" fill="var(--art-ink)" fillOpacity=".8" fontSize="24" fontFamily="var(--font-heading)" letterSpacing="-1">$24.500</text>
      <path d="M101 120h122" stroke={m.edge} strokeDasharray="2 4" />
      <text x="102" y="142" className={styles.detail}>link de pago</text>
      <path d="M102 157h67" stroke="var(--art-ink)" strokeOpacity=".15" strokeWidth="3" strokeLinecap="round" />
    </g>
    <circle cx="241" cy="149" r="32" fill={m.metal} stroke={m.edge} />
    <circle cx="241" cy="149" r="25" fill={m.beam} stroke={m.edge} strokeOpacity=".3" />
    <path d="m230 149 7 7 15-16" stroke="var(--art-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <ArtLabel>pago recibido · webhook confirmado</ArtLabel>
  </>}</InstrumentArt>;
}
