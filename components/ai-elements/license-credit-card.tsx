"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { SenkaMark } from "@/components/icons/senka-mark";
import { SPRING_MOUSE } from "@/lib/ease";
import { useHoverCapable } from "@/lib/hooks/use-hover-capable";
import { useI18n } from "@/lib/i18n/provider";
import type { LicenseInfo } from "@/lib/license/types";
import { cn } from "@/lib/utils";

// The Enterprise license, drawn as an identity card.
//
// The face carries a sigil and a name, both derived from the license id — so
// two licenses never look alike and the same license always looks the same —
// the holder, and a field of dots that thickens toward one corner, with a few
// of the sigil's own shapes set into it. The edition and the validity sit in a
// clearing at the foot of the field. The full ids are on the back.
//
// Two card stocks, one per theme: near-white with dark ink in light mode, a
// neutral charcoal with light-grey ink in dark mode. Neither end of the
// scale — the card is never pure white-on-white nor black with white ink.
// Tokens live in globals.css (`--license-card-*`) so the themed values
// resolve from CSS before paint, with no theme-flash from React state.
//
// Nothing here gates anything — see lib/license/verify.ts. This is a picture
// of a fact, not a check.

export type LicenseCardTone = "valid-active" | "valid-inactive" | "missing" | "invalid";

export function licenseTone(info: LicenseInfo | null): LicenseCardTone {
  if (!info) return "missing";
  if (info.status === "missing") return "missing";
  if (info.status !== "valid") return "invalid";
  return info.maintenanceActive ? "valid-active" : "valid-inactive";
}

/** How far the card leans, in degrees, at the edge of a full drag. */
const MAX_TILT = 22;
/** Drag pixels per degree of lean. A whole card-width of travel ≈ full tilt. */
const DRAG_TO_DEG = 0.13;
/** Lean from hover alone, which should read as lighter than a drag. */
const HOVER_TILT = 11;

const SPRING_TILT = { stiffness: 260, damping: 22, mass: 0.5 } as const;
const SPRING_FLIP = { type: "spring", stiffness: 220, damping: 26, mass: 0.7 } as const;
const DRAG_RETURN = { bounceStiffness: 320, bounceDamping: 26 } as const;

/** The card stock, stripe, ink, and edge — themed via CSS vars in globals.css. */
const CARD = "var(--license-card-bg)";
/** The stripe on the back, one step down from the stock. */
const STRIPE = "var(--license-card-stripe)";
const INK = "var(--license-card-ink)";
const INK_MUTED = "var(--license-card-ink-muted)";
const EDGE = "var(--license-card-edge)";

/** Syllables for the card name, one per hex digit. */
const PREFIX = ["dos", "ris", "bal", "mig", "sam", "lit", "wan", "pol", "fid", "nat", "tob", "sar", "hol", "rid", "lap", "mod"];
const SUFFIX = ["zod", "nec", "bud", "wes", "sev", "per", "sut", "let", "ful", "pen", "syt", "dur", "wep", "ser", "wyl", "sun"];

/** The id as 32 digits, 0 where it has none. The seed for everything drawn. */
function digitsOf(licenseId: string | undefined): number[] {
  const hex = (licenseId ?? "").replace(/[^0-9a-f]/gi, "").toLowerCase();
  return Array.from({ length: 32 }, (_, index) => Number.parseInt(hex[index] ?? "0", 16) || 0);
}

function nameOf(digits: readonly number[]): string {
  return `~${PREFIX[digits[0]]}${SUFFIX[digits[1]]}-${PREFIX[digits[2]]}${SUFFIX[digits[3]]}`;
}

/** A small deterministic generator, so the server and the client draw the same field. */
function generator(digits: readonly number[]): () => number {
  let state = digits.reduce((acc, digit, index) => (Math.imul(acc, 31) + digit + index) >>> 0, 2166136261);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** MM/YY, the way it is printed on a card. `Intl` will not be pinned to two
 *  digits here — `{ month: "2-digit", year: "2-digit" }` still resolves to a
 *  bare "2/27" in es-AR. */
function monthYear(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "––/––";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${month}/${String(date.getFullYear()).slice(-2)}`;
}

/** One of the eight shapes the sigil and the field are built from, in a 20-unit cell. */
function shape(kind: number): ReactNode {
  switch (kind % 8) {
    case 0:
      return <path d="M0 0H20A20 20 0 0 1 0 20Z" />;
    case 1:
      return <path d="M0 10A10 10 0 0 1 20 10V20H0Z" />;
    case 2:
      return <circle cx="10" cy="10" r="9" />;
    case 3:
      return (
        <>
          <rect height="20" width="20" />
          <circle cx="10" cy="10" r="3.2" style={{ fill: CARD }} />
        </>
      );
    case 4:
      return <path d="M0 0H20V20Z" />;
    case 5:
      return (
        <>
          <circle cx="10" cy="10" fill="none" r="8.25" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="10" cy="10" r="2" />
        </>
      );
    case 6:
      return (
        <>
          <circle cx="5" cy="5" r="2.2" />
          <circle cx="15" cy="5" r="2.2" />
          <circle cx="5" cy="15" r="2.2" />
          <circle cx="15" cy="15" r="2.2" />
        </>
      );
    default:
      return <path d="M0 20A20 20 0 0 1 20 0A20 20 0 0 1 0 20Z" />;
  }
}

function Tile({ kind, turn, x, y, scale = 1 }: { kind: number; turn: number; x: number; y: number; scale?: number }) {
  return (
    <g fill="currentColor" transform={`translate(${x} ${y}) scale(${scale}) rotate(${turn * 90} 10 10)`}>
      {shape(kind)}
    </g>
  );
}

/** Four tiles, two by two. Without a license, four empty frames. */
function Sigil({ className, digits, empty }: { className?: string; digits: readonly number[]; empty: boolean }) {
  const cells = [
    [0, 0],
    [20, 0],
    [0, 20],
    [20, 20],
  ] as const;
  return (
    <svg aria-hidden className={className} viewBox="0 0 40 40">
      {cells.map(([x, y], index) =>
        empty ? (
          <rect
            fill="none"
            height="18"
            key={index}
            stroke="currentColor"
            strokeOpacity="0.35"
            strokeWidth="1"
            width="18"
            x={x + 1}
            y={y + 1}
          />
        ) : (
          <Tile key={index} kind={digits[4 + index]} turn={digits[8 + index]} x={x} y={y} />
        ),
      )}
    </svg>
  );
}

const FIELD_COLUMNS = 36;
const FIELD_ROWS = 12;

/**
 * The dot field. Every cell has a dot; the dots grow and brighten toward the
 * bottom right, and a handful of cells there hold a small tile instead. It
 * fills the height it is given and crops at the sides, so a narrow card shows
 * less of the field rather than a smaller one.
 */
function DotField({ digits, empty }: { digits: readonly number[]; empty: boolean }) {
  const { dots, tiles } = useMemo(() => {
    const random = generator(digits);
    const taken = new Set<string>();
    const tiles: { column: number; kind: number; row: number; turn: number }[] = [];
    if (!empty) {
      for (let index = 0; index < 9; index++) {
        const column = 14 + Math.floor(random() * (FIELD_COLUMNS - 14));
        const row = 2 + Math.floor(random() * (FIELD_ROWS - 2));
        if (taken.has(`${column}-${row}`)) continue;
        taken.add(`${column}-${row}`);
        tiles.push({ column, kind: Math.floor(random() * 8), row, turn: Math.floor(random() * 4) });
      }
    }
    const dots: { alpha: number; column: number; radius: number; row: number }[] = [];
    for (let row = 0; row < FIELD_ROWS; row++) {
      for (let column = 0; column < FIELD_COLUMNS; column++) {
        if (taken.has(`${column}-${row}`)) continue;
        const weight = (column / (FIELD_COLUMNS - 1)) * 0.65 + (row / (FIELD_ROWS - 1)) * 0.35;
        const roll = random();
        const radius = empty ? 0.8 : roll < weight * weight * 0.35 ? 2.4 : roll < weight * 0.5 ? 1.5 : 0.8;
        dots.push({ alpha: (0.14 + 0.6 * weight) * (empty ? 0.45 : 1), column, radius, row });
      }
    }
    return { dots, tiles };
  }, [digits, empty]);

  return (
    <svg
      aria-hidden
      className="block w-full"
      preserveAspectRatio="xMidYMax meet"
      viewBox={`0 0 ${FIELD_COLUMNS * 10} ${FIELD_ROWS * 10}`}
    >
      <g fill="currentColor">
        {dots.map((dot) => (
          <circle
            cx={dot.column * 10 + 5}
            cy={dot.row * 10 + 5}
            fillOpacity={dot.alpha}
            key={`${dot.column}-${dot.row}`}
            r={dot.radius}
          />
        ))}
      </g>
      {tiles.map((tile) => (
        <Tile
          key={`${tile.column}-${tile.row}`}
          kind={tile.kind}
          scale={0.45}
          turn={tile.turn}
          x={tile.column * 10 + 0.5}
          y={tile.row * 10 + 0.5}
        />
      ))}
    </svg>
  );
}

export function LicenseCreditCard({
  info,
  installationId,
  className,
  flipOnly = false,
}: {
  readonly info: LicenseInfo | null;
  readonly installationId: string | null;
  readonly className?: string;
  /**
   * The card turns over and does nothing else: no drag, no lean under the
   * pointer. For a page where the card is a picture of the licence, not the
   * licence in your hand — the landing, where a drag would fight the scroll.
   */
  readonly flipOnly?: boolean;
}) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const canHover = useHoverCapable();
  const node = useRef<HTMLDivElement>(null);
  const [flipped, setFlipped] = useState(false);
  /** Set while a drag is in flight so the release does not also read as a
   *  click and flip the card the user was only moving. */
  const dragging = useRef(false);

  const payload = info?.payload ?? null;
  // Drag and tilt. The flip is separate and survives both switches.
  const interactive = !reduce && !flipOnly;
  const licenseId = payload?.licenseId;
  const digits = useMemo(() => digitsOf(licenseId), [licenseId]);
  const empty = !payload;

  // ── Physics ──
  // x/y are the drag offset; hoverX/hoverY are the pointer's position inside
  // the card, -1..1. Both feed the same two rotations, so a card being
  // dragged and a card being hovered lean the same way and never fight.
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const hoverX = useMotionValue(0);
  const hoverY = useMotionValue(0);

  const clampTilt = (value: number) => Math.max(-MAX_TILT, Math.min(MAX_TILT, value));
  const rotateY = useSpring(
    useTransform([x, hoverX], ([dx, hx]: number[]) => clampTilt(dx * DRAG_TO_DEG + hx * HOVER_TILT)),
    SPRING_TILT,
  );
  const rotateX = useSpring(
    useTransform([y, hoverY], ([dy, hy]: number[]) => clampTilt(-(dy * DRAG_TO_DEG) - hy * HOVER_TILT)),
    SPRING_TILT,
  );
  // A dragged card leans into the direction it is thrown. Small, and only
  // from horizontal travel — roll from vertical drag reads as a glitch.
  const rotateZ = useSpring(
    useTransform(x, (dx: number) => Math.max(-5, Math.min(5, dx * 0.022))),
    SPRING_MOUSE,
  );

  // The cast shadow moves opposite the lean, so the card looks lit from one
  // fixed place rather than carrying its own lamp around. It belongs on the
  // faces, not on the wrapper: a shadow on the wrapper never turns, so the
  // flip left a flat rectangle hanging in the air behind the moving card.
  const shadowX = useTransform(rotateY, [-MAX_TILT, MAX_TILT], [18, -18]);
  const shadowY = useTransform(rotateX, [-MAX_TILT, MAX_TILT], [8, 28]);
  const boxShadow = useMotionTemplate`${shadowX}px ${shadowY}px 40px -18px oklch(0 0 0 / 0.45), 0 2px 5px oklch(0 0 0 / 0.16)`;

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!interactive || !canHover || dragging.current) return;
      const rect = node.current?.getBoundingClientRect();
      if (!rect) return;
      hoverX.set(((event.clientX - rect.left) / rect.width) * 2 - 1);
      hoverY.set(((event.clientY - rect.top) / rect.height) * 2 - 1);
    },
    [canHover, hoverX, hoverY, interactive],
  );

  const onPointerLeave = useCallback(() => {
    hoverX.set(0);
    hoverY.set(0);
  }, [hoverX, hoverY]);

  const face = "absolute inset-0 overflow-hidden rounded-[14px] [backface-visibility:hidden]";
  const edge = (
    <div
      className="pointer-events-none absolute inset-0 rounded-[14px]"
      style={{ boxShadow: `inset 0 0 0 1px ${EDGE}` }}
    />
  );
  const surface = { background: CARD, boxShadow, color: INK } as const;

  return (
    <div className={cn("select-none", className)}>
      <div className="[perspective:1200px]">
        <motion.div
          ref={node}
          drag={interactive}
          dragSnapToOrigin
          dragElastic={0.16}
          dragMomentum={false}
          dragTransition={DRAG_RETURN}
          whileDrag={{ scale: 1.03, cursor: "grabbing" }}
          onDragStart={() => {
            dragging.current = true;
            hoverX.set(0);
            hoverY.set(0);
          }}
          onDragEnd={() => {
            // One frame is not enough — the synthetic click lands after the
            // pointerup that ends the drag, so the flag has to outlive it.
            setTimeout(() => {
              dragging.current = false;
            }, 60);
          }}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onClick={() => {
            // Pointer users flip by clicking the card itself; keyboard and
            // screen-reader users get the real button under it. Making the
            // card a role="button" instead put the copy control on its back
            // inside another button, which is a thing no assistive tech can
            // describe.
            if (dragging.current) return;
            setFlipped((open) => !open);
          }}
          style={{ x, y, rotateX, rotateY, rotateZ, transformStyle: "preserve-3d" }}
          className={cn(
            "relative mx-auto aspect-[1.586] w-full max-w-[23rem]",
            // `touch-none` only while the card can be dragged: on a flip-only
            // card it would swallow the swipe that scrolls the page.
            interactive ? "cursor-grab touch-none" : "cursor-pointer",
          )}
        >
          <motion.div
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={reduce ? { duration: 0 } : SPRING_FLIP}
            style={{ transformStyle: "preserve-3d" }}
            className="absolute inset-0"
          >
            {/* ── Front ── */}
            <motion.div style={surface} className={face}>
              {edge}

              <div className="relative flex h-full flex-col">
                <div className="flex items-start gap-3 px-5 pt-5">
                  <Sigil className="size-10 shrink-0" digits={digits} empty={empty} />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="truncate font-mono text-[14px] leading-tight tracking-[0.01em]">
                      {empty ? t("license.card.noHolder") : nameOf(digits)}
                    </p>
                    <p className="mt-1.5 truncate font-mono text-[10.5px]" style={{ color: INK_MUTED }}>
                      {payload?.company ?? "—"}
                    </p>
                  </div>
                  <SenkaMark className="mt-0.5 h-[13px] w-auto shrink-0 opacity-50" />
                </div>

                {/* The field takes whatever height the header and the footer
                    line leave, and crops at the sides rather than pushing the
                    line off the card on a narrow one. */}
                <div className="min-h-0 flex-1 overflow-hidden px-3 pt-2">
                  <DotField digits={digits} empty={empty} />
                </div>

                <p
                  className="truncate px-5 pt-1.5 pb-4 font-mono text-[9.5px] uppercase tracking-[0.08em] tabular-nums"
                  style={{ color: INK_MUTED }}
                >
                  {payload?.edition ?? "—"} · {t("license.card.validThru")}{" "}
                  {payload ? monthYear(payload.maintenanceUntil) : "––/––"}
                </p>
              </div>
            </motion.div>

            {/* ── Back ── */}
            <motion.div style={surface} className={cn(face, "[transform:rotateY(180deg)]")}>
              {edge}

              <div className="relative flex h-full flex-col">
                <div className="mt-5 h-8 w-full" style={{ background: STRIPE }} />

                <div className="flex min-h-0 flex-1 flex-col justify-center gap-3.5 px-5">
                  {/* Reference only. Copying the installation id happens where
                      it is actually needed — inside "replace this license", next
                      to the box you paste the new token into. */}
                  <div>
                    <p className="text-[9px]" style={{ color: INK_MUTED }}>
                      {t("settings.license.installationIdLabel")}
                    </p>
                    <p className="mt-1 break-all font-mono text-[11px]">{installationId ?? "…"}</p>
                  </div>

                  <div>
                    <p className="text-[9px]" style={{ color: INK_MUTED }}>
                      {t("license.card.licenseId")}
                    </p>
                    <p className="mt-1 break-all font-mono text-[11px]">{payload?.licenseId ?? "—"}</p>
                  </div>
                </div>

                <div className="flex items-end justify-between px-5 pb-5" style={{ color: INK_MUTED }}>
                  <Sigil className="size-5" digits={digits} empty={empty} />
                  <SenkaMark className="h-[13px] w-auto" />
                </div>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <button
          type="button"
          aria-pressed={flipped}
          onClick={() => setFlipped((open) => !open)}
          className="rounded-md px-1.5 py-0.5 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t(flipped ? "license.card.showFront" : "license.card.showBack")}
        </button>
        {interactive ? <span>· {t("license.card.dragHint")}</span> : null}
      </div>
    </div>
  );
}
