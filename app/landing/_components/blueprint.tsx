"use client";

import type { IconSvgElement } from "@/components/icons/icon";
import { createElement, type ReactNode } from "react";
import styles from "./blueprint.module.css";

export { styles as blueprintStyles };

/**
 * The drawing kit for the capability cards: exploded isometric slabs, dashed
 * projection guides and arrowed callouts, the way a technical manual draws a
 * part.
 *
 * It replaces the lit-glass instruments for these cards. Those were gradients,
 * glows and loops; this is one blue line on the page's own ground. Nothing here
 * animates — a plate is read, not watched.
 */

/** cos 30°: the foreshortening of every plane. */
const COS = 0.866;

/**
 * Where a point on a plate lands on screen.
 *
 * Plate coordinates read like a page lying on a table: `x` runs up and to the
 * right, `y` down and to the right, `(0, 0)` is the plate's centre.
 */
export function onPlate(cx: number, cy: number, x: number, y: number): readonly [number, number] {
  return [cx + COS * (x + y), cy + 0.5 * (y - x)];
}

/** Half the on-screen width of a plate of `size` — where its side corners sit. */
export function plateReach(size: number): number {
  return COS * size;
}

export function Blueprint({
  children,
  height = 260,
  tone = "blue",
  wide = false,
  width = 360,
}: {
  readonly children: ReactNode;
  readonly height?: number;
  /** Blue ink for the capability cards; `neutral` is a grey that follows the theme. */
  readonly tone?: "blue" | "neutral";
  /** Fill the container instead of stopping at a card-sized measure. */
  readonly wide?: boolean;
  readonly width?: number;
}) {
  return (
    <div aria-hidden="true" className={styles.plane} data-tone={tone} data-wide={wide || undefined}>
      <svg fill="none" viewBox={`0 0 ${width} ${height}`}>
        {children}
      </svg>
    </div>
  );
}

/**
 * The floor a slab stands on, without the slab: children are drawn in plate
 * coordinates around `(cx, cy)`. For what lies on the ground between slabs —
 * an arrow from one to the next — so it foreshortens the way the slabs do.
 */
export function Plane({ children, cx, cy }: { readonly children: ReactNode; readonly cx: number; readonly cy: number }) {
  return <g transform={`matrix(${COS} -0.5 ${COS} 0.5 ${cx} ${cy})`}>{children}</g>;
}

/**
 * Where a point on one of a slab's two visible side faces lands on screen.
 * `u` runs along the face's top edge from its left end, `v` runs down it.
 */
export function onFace(
  cx: number,
  cy: number,
  size: number,
  side: "left" | "right",
  u: number,
  v: number,
): readonly [number, number] {
  return side === "left"
    ? [cx - COS * size + COS * u, cy + 0.5 * u + v]
    : [cx + COS * u, cy + size / 2 - 0.5 * u + v];
}

/**
 * One of a slab's visible side faces as a drawing surface, in the same `u`/`v`
 * as `onFace` — for what is mounted on the front of a unit: bays, vents, a
 * light. The slab has to be drawn first; this only draws on top of it.
 */
export function Face({
  children,
  cx,
  cy,
  side,
  size = 88,
}: {
  readonly children: ReactNode;
  readonly cx: number;
  readonly cy: number;
  readonly side: "left" | "right";
  readonly size?: number;
}) {
  const transform =
    side === "left"
      ? `matrix(${COS} 0.5 0 1 ${cx - COS * size} ${cy})`
      : `matrix(${COS} -0.5 0 1 ${cx} ${cy + size / 2})`;
  return <g transform={transform}>{children}</g>;
}

/**
 * A square slab seen in isometric: two side faces and a top, opaque, so a slab
 * drawn later hides the part of an earlier one it sits over. Children are drawn
 * on the top face in plate coordinates.
 */
export function Slab({
  children,
  cx,
  cy,
  depth = 5,
  size = 88,
}: {
  readonly children?: ReactNode;
  readonly cx: number;
  readonly cy: number;
  readonly depth?: number;
  readonly size?: number;
}) {
  const reach = plateReach(size);
  const half = size / 2;

  return (
    <g>
      <path
        className={styles.body}
        d={`M${cx - reach} ${cy}L${cx} ${cy + half}V${cy + half + depth}L${cx - reach} ${cy + depth}Z`}
      />
      <path
        className={styles.body}
        d={`M${cx} ${cy + half}L${cx + reach} ${cy}V${cy + depth}L${cx} ${cy + half + depth}Z`}
      />
      <g transform={`matrix(${COS} -0.5 ${COS} 0.5 ${cx} ${cy})`}>
        <rect className={styles.body} height={size} width={size} x={-half} y={-half} />
        {children}
      </g>
    </g>
  );
}

/** A Hugeicons glyph drawn inline, so it can sit on a plate and shear with it. */
export function Glyph({
  icon,
  size = 16,
  x,
  y,
}: {
  readonly icon: IconSvgElement;
  readonly size?: number;
  readonly x: number;
  readonly y: number;
}) {
  return (
    <g className={styles.glyph} transform={`translate(${x} ${y}) scale(${size / 24})`}>
      {icon.map(([tag, attrs], index) => createElement(tag, { ...attrs, key: index }))}
    </g>
  );
}

/**
 * Advance of one character of the 9px mono label, letter-spacing included —
 * Geist Mono is 0.6em a glyph plus the label's 0.08em tracking. Measured, not
 * guessed: the leader starts where the text ends, so a wrong advance puts the
 * line through the last letter.
 */
const LABEL_ADVANCE = 6.12;

/**
 * A label with a leader and an arrowhead, reading into the drawing from the
 * margin. `x` is where the label is anchored (its start on the left, its end on
 * the right) and `tip` is where the arrow lands, on the same line.
 */
export function Callout({
  label,
  side,
  tip,
  x,
  y,
}: {
  readonly label: string;
  readonly side: "left" | "right";
  readonly tip: number;
  readonly x: number;
  readonly y: number;
}) {
  const text = label.length * LABEL_ADVANCE + 6;
  const start = side === "left" ? x + text : x - text;
  const back = side === "left" ? -5 : 5;

  return (
    <g>
      <text
        className={styles.label}
        textAnchor={side === "left" ? "start" : "end"}
        x={x}
        y={y + 2.8}
      >
        {label}
      </text>
      <path className={styles.ink} d={`M${start} ${y}H${tip}M${tip + back} ${y - 3}L${tip} ${y}L${tip + back} ${y + 3}`} />
    </g>
  );
}

/** A small square marker where a guide meets the thing it points at. */
export function Node({ x, y }: { readonly x: number; readonly y: number }) {
  return <rect className={styles.solid} height={3} width={3} x={x - 1.5} y={y - 1.5} />;
}
