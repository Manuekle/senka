"use client";

import type { IconSvgElement } from "@/components/icons/icon";
import {
  Activity01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  CpuIcon,
  Database01Icon,
  InternetIcon,
  Key01Icon,
  SecurityCheckIcon,
  SourceCodeIcon,
  WebhookIcon,
} from "@hugeicons/core-free-icons";
import {
  Blueprint,
  blueprintStyles as styles,
  Face,
  Glyph,
  onFace,
  onPlate,
  plateReach,
  Slab,
} from "./blueprint";

/**
 * The glyph for each self-hosted guarantee. The drawing uses them and so does
 * the list under it, so a reader can match a line of text to a part of the
 * machine without either one needing a label.
 */
export const GUARANTEE_ICONS: Record<string, IconSvgElement> = {
  allowlist: InternetIcon,
  database: Database01Icon,
  keys: Key01Icon,
  sandbox: SourceCodeIcon,
  traces: Activity01Icon,
  webhooks: WebhookIcon,
};

const CX = 360;
/** One rack unit's footprint and thickness, in plate units and pixels. */
const UNIT = 150;
const DEPTH = 26;
/** Top-face centres of the three units, top to bottom. */
const LEVELS = { control: 84, runtime: 202, storage: 320 } as const;
/** The small slabs either side of the runtime unit: a webhook in, a host out. */
const SATELLITE = 52;
/** Height of the sandbox's cage above the runtime plate. */
const CAGE = 40;

/** A chevron ending at `(x, y)`, pointing right (`1`) or left (`-1`). */
function arrow(x: number, y: number, direction: 1 | -1 = 1): string {
  return `M${x - 5 * direction} ${y - 3}L${x} ${y}L${x - 5 * direction} ${y + 3}`;
}

/** The front of a unit: drive bays and a light on the left face, vents on the right. */
function UnitFaces({ cy }: { readonly cy: number }) {
  return (
    <>
      <Face cx={CX} cy={cy} side="left" size={UNIT}>
        {Array.from({ length: 10 }, (_, bay) => (
          <rect className={styles.faint} height={14} key={bay} width={9} x={10 + bay * 13} y={6} />
        ))}
        <rect className={styles.solid} height={3} width={3} x={141} y={11.5} />
      </Face>
      <Face cx={CX} cy={cy} side="right" size={UNIT}>
        <path
          className={styles.faint}
          d={Array.from({ length: 23 }, (_, vent) => `M${8 + vent * 6} 6V20`).join("")}
        />
      </Face>
    </>
  );
}

/**
 * The self-hosted install as one machine, exploded into three units.
 *
 * Bottom to top: storage (your database, on disks you own), runtime (the
 * sandbox the model's code runs in, caged, beside the compute) and control
 * (traces, and the keys kept in a vault). The runtime is where the network is,
 * so the two network guarantees hang off its sides: on the left a webhook
 * arrives and passes a signature check before it reaches the machine; on the
 * right one call goes out to a host that is allowed and one is stopped.
 *
 * No words anywhere. Each guarantee is a glyph from `GUARANTEE_ICONS`, and the
 * list under the drawing carries the same glyphs.
 *
 * Units are drawn bottom to top so each covers the back of the one below, the
 * way an exploded view reads.
 */
export function ServerBlueprint() {
  const reach = plateReach(UNIT);
  const satelliteReach = plateReach(SATELLITE);
  const y = LEVELS.runtime;

  const webhook = CX - 200;
  const host = CX + 200;

  const disks = onPlate(CX, LEVELS.storage, -40, 30);
  const sandbox = onPlate(CX, LEVELS.runtime, -40, 32);
  const cage = [
    [-26, -26],
    [26, -26],
    [26, 26],
    [-26, 26],
  ].map(([x, z]) => onPlate(sandbox[0], sandbox[1], x, z));
  const ring = (lift: number) => `M${cage.map(([x, z]) => `${x} ${z - lift}`).join("L")}Z`;

  // The refused call leaves from the runtime's right face, below the allowed one.
  const refused = onFace(CX, LEVELS.runtime, UNIT, "right", 100, 13);
  const stop = { x: 594, y: 292 } as const;

  return (
    <Blueprint height={430} tone="neutral" wide width={720}>
      {/* Alignment of the three units, behind everything. */}
      <path
        className={styles.guide}
        d={`M${CX - reach} ${LEVELS.control}V${LEVELS.storage}M${CX + reach} ${LEVELS.control}V${LEVELS.storage}`}
      />

      {/* ── Storage ── */}
      <Slab cx={CX} cy={LEVELS.storage} depth={DEPTH} size={UNIT}>
        {Array.from({ length: 12 }, (_, bay) => (
          <rect
            className={bay === 4 ? styles.solid : styles.faint}
            height={10}
            key={bay}
            width={8}
            x={10 + (bay % 6) * 11}
            y={24 + Math.floor(bay / 6) * 14}
          />
        ))}
      </Slab>
      <UnitFaces cy={LEVELS.storage} />
      {[0, 1, 2].map((disk) => (
        <Slab cx={disks[0]} cy={disks[1] - 6 - disk * 12} depth={6} key={disk} size={44}>
          {disk === 2 ? <Glyph icon={Database01Icon} size={14} x={-7} y={-7} /> : null}
        </Slab>
      ))}

      {/* ── Runtime ── */}
      <Slab cx={CX} cy={LEVELS.runtime} depth={DEPTH} size={UNIT}>
        <Glyph icon={CpuIcon} size={22} x={18} y={20} />
        <path className={styles.faint} d="M14 52H62M14 60H48" />
      </Slab>
      <UnitFaces cy={LEVELS.runtime} />
      <path className={styles.guide} d={ring(0)} />
      <Slab cx={sandbox[0]} cy={sandbox[1] - 28} depth={28} size={36}>
        <Glyph icon={SourceCodeIcon} size={16} x={-8} y={-8} />
      </Slab>
      {/* The cage: the sandbox's network boundary, drawn round it. */}
      <path
        className={styles.guide}
        d={`${ring(CAGE)}${cage.map(([x, z]) => `M${x} ${z}V${z - CAGE}`).join("")}`}
      />

      {/* ── Control ── */}
      <Slab cx={CX} cy={LEVELS.control} depth={DEPTH} size={UNIT}>
        <Glyph icon={Activity01Icon} size={12} x={-66} y={-68} />
        <rect className={styles.faint} height={56} width={80} x={-66} y={-50} />
        {[
          { w: 64, x: -60 },
          { w: 44, x: -52 },
          { w: 28, x: -44 },
          { w: 14, x: -36 },
        ].map((span, index) => (
          <rect
            className={index === 2 ? styles.solid : styles.ink}
            height={6}
            key={span.x}
            width={span.w}
            x={span.x}
            y={-44 + index * 10}
          />
        ))}
        <rect className={styles.ink} height={42} width={42} x={24} y={-50} />
        <Glyph icon={Key01Icon} size={24} x={33} y={-41} />
        {Array.from({ length: 6 }, (_, dot) => (
          <rect className={styles.solid} height={3} key={dot} width={3} x={24 + dot * 7.8} y={0} />
        ))}
        {Array.from({ length: 10 }, (_, port) => (
          <rect className={styles.faint} height={6} key={port} width={6} x={-60 + port * 12} y={46} />
        ))}
      </Slab>
      <UnitFaces cy={LEVELS.control} />

      {/* ── In: a webhook, checked before it reaches the machine ── */}
      <path
        className={styles.guide}
        d={`M28 ${y}H${webhook - satelliteReach - 3}M${webhook + satelliteReach + 3} ${y}H${CX - reach - 3}`}
      />
      <path className={styles.ink} d={arrow(webhook - satelliteReach - 3, y) + arrow(CX - reach - 3, y)} />
      <Slab cx={webhook} cy={y} depth={6} size={SATELLITE}>
        <Glyph icon={WebhookIcon} size={16} x={-22} y={-8} />
        <Glyph icon={SecurityCheckIcon} size={16} x={2} y={-8} />
      </Slab>

      {/* ── Out: one host allowed, one call refused ── */}
      <path
        className={styles.guide}
        d={`M${CX + reach + 3} ${y}H${host - satelliteReach - 3}M${host + satelliteReach + 3} ${y}H692`}
      />
      <path className={styles.ink} d={arrow(host - satelliteReach - 3, y) + arrow(692, y)} />
      <Slab cx={host} cy={y} depth={6} size={SATELLITE}>
        <Glyph icon={InternetIcon} size={16} x={-22} y={-8} />
        <Glyph icon={CheckmarkCircle02Icon} size={16} x={2} y={-8} />
      </Slab>
      <path className={styles.guide} d={`M${refused[0]} ${refused[1]}L${stop.x - 2} ${stop.y + 8}`} />
      <Glyph icon={Cancel01Icon} size={16} x={stop.x} y={stop.y} />
    </Blueprint>
  );
}
