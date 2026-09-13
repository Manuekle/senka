"use client";

import createGlobe from "cobe";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useStageLive } from "./use-stage-live";

/**
 * A client, placed on the world. `id` is the cobe marker id; `name` and `logo`
 * are what the rail under the globe sets, not anything drawn on the canvas.
 */
export type GlobeClient = {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly logo?: string;
  readonly name: string;
};

/** Whether `<html>` currently carries `.dark` — `ThemeProvider` toggles this
 *  class directly rather than following `prefers-color-scheme`, so a media
 *  query alone would miss a manual switch. Watched rather than read once:
 *  the globe should recolour the moment `ThemeToggle` flips it, not only on
 *  the next mount. */
function useIsDark(): boolean {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return dark;
}

/** Grayscale only — no accent invented for a globe the rest of the page has no
 *  colour on. `dark` is cobe's own land/ocean contrast dial rather than a
 *  colour, so it sits in here with the two that are: on this page's near-black
 *  ground the sphere is a hole and the dots are the object, and on white it is
 *  the other way round. */
function palette(dark: boolean): {
  baseColor: [number, number, number];
  dark: number;
  glowColor: [number, number, number];
  mapBrightness: number;
} {
  return {
    baseColor: dark ? [0.28, 0.28, 0.28] : [1, 1, 1],
    dark: dark ? 1 : 0,
    // The atmosphere. Kept well under cobe's own demo value, because a rim is
    // a proportion of a radius: what reads as a highlight on the 600px globe
    // in the docs is, at this size, a white ring with a planet inside it.
    glowColor: dark ? [0.12, 0.12, 0.12] : [1, 1, 1],
    mapBrightness: dark ? 8 : 6,
  };
}

/**
 * The globe. Cobe draws the sphere, the dot-mapped landmass and a pin per
 * client, and that is all this draws.
 *
 * Labels used to hang off every pin via CSS Anchor Positioning. The rail
 * under the section names the clients now, and two lists of the same names in
 * one section is one list too many — the pins say "here", the rail says who,
 * and neither has to shout over the other.
 *
 * ── Why labels were a performance problem ────────────────────────────
 *
 * Cobe v2 always calls $.s() inside every update(), unconditionally, which
 * does: `styleEl.textContent = ":root{...}"`. Any write to a <style> element's
 * textContent forces the browser to invalidate and recalculate styles for the
 * entire document — even when the content is just ":root{}" (empty custom
 * properties). At 60fps that is 60 forced style recalculations per second,
 * each one touching every styled element on the page.
 *
 * Two fixes working together:
 *
 *   1. No `id` on markers. Cobe uses marker ids to populate the CSS custom
 *      properties object (`a`). Without ids that object stays empty, so the
 *      string written to the style element is always ":root{}" — semantically
 *      a no-op, but still a write.
 *
 *   2. After `createGlobe()` returns, find the <style> element it injected
 *      into <head> and replace its `textContent` setter with a no-op. Cobe
 *      appends exactly one <style> element synchronously during construction,
 *      so the new element is always the last one in <head> when the call
 *      returns. Silencing it eliminates the forced recalc entirely without
 *      patching cobe itself.
 *
 * This also removes the label divs from the JSX — without them the custom
 * properties cobe would write serve no consumer. It also took with it the
 * labels' one real layout problem: clients cluster, six businesses in one
 * region put their pins within a few dozen pixels of each other, and six
 * labels hanging off that stack into an unreadable pile.
 *
 * CSS Anchor Positioning is also unsupported in Safari and Firefox, so the
 * labels were invisible to most visitors even before this change.
 *
 * ── Other per-frame costs addressed ─────────────────────────────────
 *
 * Cobe draws one frame per `update()` and runs no loop of its own, so the
 * `requestAnimationFrame` below is not the animation — it is the rendering.
 *
 * - `palette()` is cached and only passed to `update()` when the theme
 *   actually changes. Rotation-only frames pass just `{ phi, theta }`.
 * - On coarse-pointer devices the loop is throttled to ~30 fps.
 * - `width`/`height` are sent only on resize, never every frame.
 */
export function ClientGlobe({
  className,
  clients,
}: {
  /**
    * How big the sphere is and where it sits — the caller's decision, because
    * the globe is not always a square in a column. On the proof section it is
    * half off the right edge of the page, which is a size and an offset this
    * component has no way to know and no business hard-coding.
    *
    * Whatever is passed has to resolve to a square: the canvas is sized from
    * `clientWidth` in both directions, so a wrapper wider than it is tall gets
    * a sphere cropped top and bottom rather than an ellipse.
    */
  readonly className?: string;
  readonly clients: readonly GlobeClient[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phiRef = useRef(0);
  const thetaRef = useRef(0.3);
  // The frame loop reads these every frame; refs rather than closing over the
  // values from render, so the loop set up once in the effect below always
  // sees the current ones instead of those from the mount it started in.
  const live = useStageLive(wrapRef);
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);
  const dark = useIsDark();
  const darkRef = useRef(dark);
  useEffect(() => {
    darkRef.current = dark;
  }, [dark]);
  // Set whenever something other than the rotation changes what a frame would
  // look like — the theme, the size, a nudge from the keyboard — so a globe
  // that is holding still still redraws when it has a reason to. A ref rather
  // than a loop-local so the keyboard handler below can raise it too.
  const dirtyRef = useRef(true);
  // Whether a drag is in flight. Read by the frame loop (to hold the
  // auto-rotation) and written by the window-level move/up handlers.
  const draggingRef = useRef(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    // A phone GPU is not a desktop GPU, and this globe is big: cap the pixel
    // ratio lower and sample the land map more coarsely on touch devices. The
    // difference on screen is negligible; the difference in frame cost is not.
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
    let size = wrap.clientWidth;

    // Cached palette for the current theme value — rebuilt only when dark
    // changes, not on every frame. Spreading a freshly-allocated object into
    // `update()` on every frame allocates and then immediately discards it;
    // the theme changes at most once per user interaction, so caching pays
    // nothing and saves an allocation every ~16ms.
    let cachedPalette = palette(darkRef.current);
    let cachedPaletteDark = darkRef.current;

    // Snapshot how many <style> elements are in <head> before we hand control
    // to cobe. It will append exactly one more, synchronously.
    const styleCountBefore = document.head.querySelectorAll("style").length;

    // CSS pixels, not buffer pixels — which is one step off the snippet in
    // cobe's docs, deliberately. That snippet pairs `width: 600 * 2` with
    // `devicePixelRatio: 2`, and cobe then does `canvas.width = width * dpr`
    // itself: the retina doubling lands twice, and a 600px globe gets a
    // 2400×2400 buffer. On a 600px demo that is merely wasteful. This globe is
    // 62rem across, where the same arithmetic is a 16-megapixel buffer redrawn
    // every frame — so `width` is the CSS size and `devicePixelRatio` does the
    // scaling, once.
    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: size,
      height: size,
      phi: 0,
      theta: 0.3,
      diffuse: 0.0,
      mapSamples: coarse ? 12000 : 20000,
      scale: 1,
      offset: [0, 0],
      markerColor: [0.95, 0.95, 0.95],
      // No `id` on markers — see the comment above. Without ids, the custom-
      // property dict cobe would write into the style element stays empty, so
      // the style element no-op patch below is the only thing silencing it.
      markers: clients.map((client) => ({
        location: [client.lat, client.lng] as [number, number],
        size: 0.02,
      })),
      ...cachedPalette,
    });

    // ── Silence the per-frame style injection ──────────────────────────
    //
    // Cobe v2 calls `styleEl.textContent = ":root{...}"` unconditionally on
    // every update(), which forces a full-document style recalculation every
    // frame. We have no markers with ids, so the content is always ":root{}"
    // — a write that changes nothing but still triggers the recalc.
    //
    // After createGlobe() returns, the new <style> element is the last one in
    // <head>. Replace its textContent setter with a no-op. The descriptor is
    // inherited from CharacterData; we override it only on this instance so
    // no other style elements are affected.
    const styleElements = document.head.querySelectorAll("style");
    const cobeStyle = styleElements[styleCountBefore] ?? null;
    if (cobeStyle) {
      // The setter lives on the CharacterData prototype, not on the element
      // itself, so we define it directly on the instance to shadow it.
      Object.defineProperty(cobeStyle, "textContent", {
        set: () => {
          /* no-op: prevents cobe's $.s() from triggering style recalc */
        },
        get: () => "",
        configurable: true,
      });
    }

    // Cobe draws on `update()` and nothing else, so this loop is what puts
    // pixels on the canvas at all — including the first correct frame, which
    // only arrives once the map image has decoded, some milliseconds after
    // creation.
    //
    // What it does *not* do is redraw a globe with no reason to change.
    // `live` is false off screen, in a background tab, and for a visitor who
    // asked for reduced motion — the first two should cost nothing, and the
    // third should still get a globe, just one that holds still. So: a frame
    // whenever the rotation moves, a frame whenever `dirty` says the picture
    // is stale, and an empty callback the rest of the time.
    //
    // Without the per-frame style write, the JS cost per frame is now just
    // two angles going into cobe's WebGL uniforms. On a coarse pointer the
    // loop is still throttled to ~30fps, which reads as smooth for a sphere
    // this slow. And `width`/`height` are deliberately *not* passed per frame:
    // cobe resizes the canvas backing store from them, so sending them every
    // frame risks a reallocation every frame.
    let raf = 0;
    let last = performance.now();
    let lastDrawn = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(now - last, 100);
      last = now;
      // A manual drag always draws — including under reduced motion, where the
      // visitor asked the page not to move on its own, not to be unmovable.
      const dragging = draggingRef.current;
      if (!liveRef.current && !dragging && !dirtyRef.current) return;
      // Seconds-based, not frames-based: 0.0028 rad at 60fps, whatever the
      // display runs at. On a 120Hz phone the per-frame increment used to
      // double the spin speed along with the power draw.
      if (liveRef.current && !dragging) phiRef.current += 0.168 * (dt / 1000);
      else if (!dirtyRef.current && !dragging) return;
      if (coarse && !dirtyRef.current && now - lastDrawn < 33) return;
      lastDrawn = now;
      dirtyRef.current = false;

      // Rebuild the palette cache only when the theme actually changed.
      // Rotation-only frames pass just `phi`/`theta`; a theme-change frame
      // also spreads the four colour values. This halves the object allocation
      // rate in the common case and avoids micro-GC pressure from allocating
      // and immediately discarding a palette object every 16ms.
      const currentDark = darkRef.current;
      if (currentDark !== cachedPaletteDark) {
        cachedPalette = palette(currentDark);
        cachedPaletteDark = currentDark;
        globe.update({
          phi: phiRef.current,
          theta: thetaRef.current,
          ...cachedPalette,
        });
      } else {
        globe.update({
          phi: phiRef.current,
          theta: thetaRef.current,
        });
      }
    };
    raf = requestAnimationFrame(draw);

    // The map arrives asynchronously and cobe raises no event for it. A globe
    // that is off screen at mount is not drawing, so it would have no finished
    // frame to show the moment it scrolls into view — one `dirty` on a short
    // timer covers the decode without keeping a loop running for a picture
    // nobody is looking at. The image is inlined in cobe's bundle as a data-
    // URI, so nothing is fetched; 150ms is enough for the decode.
    const warm = window.setTimeout(() => {
      dirtyRef.current = true;
    }, 150);

    // `ResizeObserver` always fires once right after `observe()`, even with no
    // real change. Skipping the no-op keeps that first callback from marking a
    // fresh frame stale for nothing.
    const resizeObserver = new ResizeObserver(() => {
      const next = wrap.clientWidth;
      if (next === 0 || next === size) return;
      size = next;
      globe.update({ width: size, height: size });
      dirtyRef.current = true;
    });
    resizeObserver.observe(wrap);

    // `useIsDark` above keeps the ref the loop reads up to date; this is the
    // other half of a theme switch — telling a globe that is holding still
    // that its colours just changed under it.
    const themeObserver = new MutationObserver(() => {
      dirtyRef.current = true;
    });
    themeObserver.observe(document.documentElement, {
      attributeFilter: ["class"],
      attributes: true,
    });

    // ── Drag ──────────────────────────────────────────────────────────
    // Native window-level listeners, not React pointer props with
    // `setPointerCapture`. Capture on the wrapper used to own the gesture, and
    // on touch that ownership fights the browser: a vertical scroll starting
    // on the globe either got swallowed (with `touch-action: none`) or
    // cancelled the drag mid-flight without a `pointerup` to end it, leaving
    // the globe stuck to the finger. Here `pointerdown` only *starts* a drag,
    // `pointermove`/`pointerup` ride on `window` so leaving the sphere ends
    // cleanly, and `pointercancel` — what the browser fires when it takes a
    // gesture back for scrolling — ends it too.
    //
    // The hitbox is the sphere, not the square. The wrapper is a box and the
    // globe is a circle inscribed in it; a down in the corners returns early,
    // before any state is set, so taps and scrolls starting on empty canvas
    // behave as if the globe were not there.
    const insideGlobe = (x: number, y: number): boolean => {
      const rect = wrap.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const r = Math.min(rect.width, rect.height) / 2;
      const dx = x - cx;
      const dy = y - cy;
      return dx * dx + dy * dy <= r * r;
    };

    let drag: { id: number; x: number; y: number } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!insideGlobe(e.clientX, e.clientY)) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      draggingRef.current = true;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag = { id: drag.id, x: e.clientX, y: e.clientY };
      phiRef.current += dx / 200;
      thetaRef.current = Math.max(-0.6, Math.min(0.9, thetaRef.current + dy / 300));
    };
    const onPointerEnd = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) {
        drag = null;
        draggingRef.current = false;
      }
    };
    wrap.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);

    return () => {
      window.clearTimeout(warm);
      cancelAnimationFrame(raf);
      themeObserver.disconnect();
      resizeObserver.disconnect();
      wrap.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      draggingRef.current = false;
      globe.destroy();
    };
    // `clients` is static content read from `content/proof.json` — changing it
    // is a redeploy, not a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard drag: the sphere is focusable and the arrows turn it, a step per
  // press, so it is movable without a pointer at all. Marks a frame dirty
  // directly — the loop is the only thing that reads the angles.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = 0.15;
    if (e.key === "ArrowLeft") phiRef.current -= step;
    else if (e.key === "ArrowRight") phiRef.current += step;
    else if (e.key === "ArrowUp") thetaRef.current = Math.max(-0.6, thetaRef.current - step);
    else if (e.key === "ArrowDown") thetaRef.current = Math.min(0.9, thetaRef.current + step);
    else return;
    e.preventDefault();
    dirtyRef.current = true;
  };

  return (
    <div
      // `touch-pan-y`, not `touch-none`: a vertical swipe starting on the globe
      // is a page scroll and the browser should own it outright (it answers
      // with a `pointercancel`, which ends any drag in flight). `none` used to
      // claim every touch for the globe, so on a phone the page would not
      // scroll from the sphere and every scroll attempt arrived as judder.
      // Horizontal drags still reach us and turn the globe.
      className={cn(
        "pointer-events-auto relative aspect-square w-full cursor-grab touch-pan-y select-none active:cursor-grabbing",
        className,
      )}
      ref={wrapRef}
      tabIndex={0}
      role="img"
      aria-label="Globo interactivo con la ubicación de los clientes. Arrastrá o usá las flechas para girarlo."
      onKeyDown={onKeyDown}
    >
      <canvas className="h-full w-full rounded-full" ref={canvasRef} />
    </div>
  );
}
