"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import styles from "./dither-terrain.module.css";

/**
 * A stretch of ground drawn as an ordered dither: square cells on a fixed grid,
 * each one either inked or bare, scattered along a skyline and closing up into
 * solid ink the further below it they sit. A halftone print, not a gradient —
 * the page already has a lighting rig, and one more soft glow behind a section
 * is not texture, it is fog.
 *
 * It covers part of its box and never the whole of it. Everything above the
 * skyline stays the page's own ground, which is where the caller puts copy.
 *
 * ── Why a canvas, and why such a small one ─────────────────────────────
 *
 * One canvas pixel per cell: a 1440px section at 4px cells is a bitmap 360
 * pixels wide, and CSS scales it up with `image-rendering: pixelated`, so every
 * cell lands as a hard-edged square at any pixel ratio. The alternatives both
 * cost more for the same picture — a `fillRect` per cell at device resolution,
 * or an SVG with ten thousand `<rect>`s the browser has to keep as DOM.
 *
 * Drawn once, when the box comes near the viewport, and again only when the
 * box resizes or the theme flips. Nothing here runs per frame: the globe in the
 * same section is a live WebGL loop already, and ground does not move.
 *
 * ── Colour ─────────────────────────────────────────────────────────────
 *
 * The cells are laid down as a bare alpha mask and then filled `source-in`
 * with the canvas's own computed `color`, which the CSS module sets to
 * `--foreground`. So the ink is the page's ink in either theme, and how hard it
 * sits on the ground is an opacity per theme in the stylesheet, not a colour
 * this file has to know.
 */

/** A point on the skyline: `u` across the box and `v` down it, both 0–1. */
export type RidgePoint = readonly [u: number, v: number];

/** One cell, in CSS pixels. Fine enough to read as print grain rather than a
 *  grey slab, while staying coarser than the globe's own dot-mapped land —
 *  that stays the finer texture in the section. */
const CELL = 4;

/** How far below the skyline the ground takes to close up, in CSS pixels. One
 *  of these down it is about seven-tenths ink; the first few rows under the
 *  line are single scattered cells. */
const FALLOFF = 210;

/** The last stretch above the box's floor, in CSS pixels, over which the ground
 *  thins back out to a third of its density. The floor of a section is not the
 *  edge of a poster: a dense mass cut dead straight where the next section
 *  starts reads as a rectangle somebody clipped, not as ground that ends. */
const FLOOR = 110;

/** The 8×8 Bayer matrix as thresholds in (0, 1), built by doubling the 2×2
 *  one. Sixty-four levels, and an ordered pattern rather than error diffusion,
 *  so a resize redraws the same cells instead of reshuffling the whole field. */
const BAYER = (() => {
  let matrix = [[0]];
  while (matrix.length < 8) {
    matrix = [
      ...matrix.map((row) => [...row.map((v) => 4 * v), ...row.map((v) => 4 * v + 2)]),
      ...matrix.map((row) => [...row.map((v) => 4 * v + 3), ...row.map((v) => 4 * v + 1)]),
    ];
  }
  return Float32Array.from(matrix.flat(), (v) => (v + 0.5) / 64);
})();

/** Integer lattice hash to [0, 1). Deterministic, so the ground is the same
 *  shape on every load and every screen. */
function hash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smoothed value noise. */
function noise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Three octaves of it, weights summing to one, so the result stays in 0–1. */
function fbm(x: number, y: number): number {
  return (
    noise(x, y) * 0.57 +
    noise(x * 2.03 + 17.1, y * 2.03 - 9.4) * 0.29 +
    noise(x * 4.1 - 31.7, y * 4.1 + 5.2) * 0.14
  );
}

/** The skyline's `v` at `u`, as a Catmull-Rom curve through the points — a
 *  polyline gives the ground corners, and a hillside has none. */
function ridgeAt(points: readonly RidgePoint[], u: number): number {
  const last = points.length - 1;
  if (u <= points[0][0]) return points[0][1];
  if (u >= points[last][0]) return points[last][1];
  let i = 0;
  while (u > points[i + 1][0]) i++;
  const p0 = points[Math.max(i - 1, 0)][1];
  const p1 = points[i][1];
  const p2 = points[i + 1][1];
  const p3 = points[Math.min(i + 2, last)][1];
  const t = (u - points[i][0]) / (points[i + 1][0] - points[i][0]);
  return (
    0.5 *
    (2 * p1 +
      (p2 - p0) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
      (3 * p1 - p0 - 3 * p2 + p3) * t * t * t)
  );
}

function paint(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  ridge: readonly RidgePoint[],
): void {
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  // Sized to whole cells and pinned bottom-left, so the grid starts on the
  // box's left edge and its floor: a partial cell is cropped off the top,
  // where the skyline keeps everything bare anyway.
  canvas.width = cols;
  canvas.height = rows;
  canvas.style.width = `${cols * CELL}px`;
  canvas.style.height = `${rows * CELL}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const image = ctx.createImageData(cols, rows);
  const data = image.data;
  for (let col = 0; col < cols; col++) {
    const x = (col + 0.5) * CELL;
    // The drawn line wanders ±30px off the curve, so the skyline reads as
    // land rather than as a spline somebody plotted.
    const skyline = ridgeAt(ridge, x / width) * height + (fbm(x / 240, 7.31) - 0.5) * 60;
    // Bottom up, stopping at the skyline: nothing above it is ever inked.
    for (let fromFloor = 0; fromFloor < rows; fromFloor++) {
      const y = height - (fromFloor + 0.5) * CELL;
      const depth = (y - skyline) / FALLOFF;
      if (depth <= 0) break;
      // Density climbs fast off the line and levels out, and big soft blobs
      // of noise push parts of it heavier and let parts open up — the masses
      // that make a halftone look printed. Scaled by depth, so the skyline
      // itself stays single scattered cells.
      //
      // Capped short of solid. A field left to saturate is a flat slab of grey
      // with no grid in it, which is the one thing a dither must not become;
      // at the cap the heaviest ground still has a hole in every 8×8 block.
      // Lowered for the finer cell: smaller squares close up faster, so the
      // same cap reads denser than it did at 6px.
      const lift = Math.min(((fromFloor + 0.5) * CELL) / FLOOR, 1);
      const tone =
        Math.min(
          0.8,
          0.8 * (1 - Math.exp(-2.2 * depth)) +
            (fbm(x / 260, y / 200) - 0.5) * 1.5 * Math.min(depth, 1),
        ) *
        (0.35 + 0.65 * lift * lift * (3 - 2 * lift));
      if (tone <= BAYER[(col & 7) | ((fromFloor & 7) << 3)]) continue;
      data[((rows - 1 - fromFloor) * cols + col) * 4 + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = getComputedStyle(canvas).color;
  ctx.fillRect(0, 0, cols, rows);
}

/**
 * The ground, filling whatever box `className` gives it — position, size and
 * breakpoints are the caller's, the same way `ClientGlobe` leaves them.
 *
 * `ridge` is an effect dependency: pass a module-level constant, not an inline
 * array, or every render redraws the field.
 */
export function DitherTerrain({
  className,
  ridge,
}: {
  readonly className?: string;
  readonly ridge: readonly RidgePoint[];
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;

    // Paint lazily: the section sits most of the way down a long page, and a
    // field computed at load is main-thread time spent on a picture nobody is
    // looking at yet.
    let near = typeof IntersectionObserver === "undefined";
    let stale = true;

    const draw = () => {
      if (!near || !stale) return;
      const width = box.clientWidth;
      const height = box.clientHeight;
      // Zero while a breakpoint class hides the box. It stays stale, and the
      // resize that shows it again is what draws it.
      if (!width || !height) return;
      stale = false;
      paint(canvas, width, height, ridge);
      canvas.dataset.painted = "";
    };
    const invalidate = () => {
      stale = true;
      draw();
    };

    const intersection =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              near = entries.some((entry) => entry.isIntersecting);
              draw();
            },
            { rootMargin: "600px 0px" },
          );
    intersection?.observe(box);
    // The canvas is absolutely positioned inside the box, so resizing it here
    // never feeds back into the box this is observing.
    const resize = new ResizeObserver(invalidate);
    resize.observe(box);
    // `ThemeProvider` flips `.dark` on `<html>`; the ink is read from CSS at
    // paint time, so a theme switch is a repaint.
    const theme = new MutationObserver(invalidate);
    theme.observe(document.documentElement, { attributeFilter: ["class"], attributes: true });

    return () => {
      intersection?.disconnect();
      resize.disconnect();
      theme.disconnect();
    };
  }, [ridge]);

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute overflow-hidden", className)}
      ref={boxRef}
    >
      <canvas className={styles.canvas} ref={canvasRef} />
    </div>
  );
}
