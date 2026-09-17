"use client";

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal, flushSync } from "react-dom";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Add01Icon,
  AlertCircleIcon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Call02Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Coins01Icon,
  Delete01Icon,
  File01Icon,
  Target01Icon,
} from "@hugeicons/core-free-icons";
import { useI18n } from "@/lib/i18n/provider";
import { timeUntil } from "@/lib/format";
import { STAGE_PROBABILITY, formatMoney, isOverdue, isStale } from "@/lib/deals";
import { cn } from "@/lib/utils";
import type { Deal, DealStage } from "@/lib/types";

export const DEAL_COLUMNS = [
  "lead",
  "qualified",
  "meeting",
  "proposal",
  "negotiation",
  "won",
  "lost",
] as const;

/** Same container-query ruler as the CRM board: every size below is a
 *  fraction of the board's own width, so kanban cards and list rows share
 *  one scale and both views start at the same px. */
// CRM scales with its container, but never below its desktop card geometry.
// Pipeline has a horizontal viewport, so using raw cqw here made a 300px
// column collapse to ~180px when the page was narrower than CRM.
export const q = (px: number) => `max(${px}px, ${(px / 1448) * 100}cqw)`;

const EASE_OUT = [0.19, 1, 0.22, 1] as const;

type DealTheme = {
  readonly bar: string;
  readonly tone: string;
  readonly icon: typeof Call02Icon;
};

export const DEAL_THEME: Record<DealStage, DealTheme> = {
  lead: {
    bar: "bg-[var(--status-progress-fg)]",
    tone: "var(--status-progress-fg)",
    icon: Add01Icon,
  },
  qualified: {
    bar: "bg-[var(--status-progress-fg)]",
    tone: "var(--status-progress-fg)",
    icon: Target01Icon,
  },
  meeting: {
    bar: "bg-[var(--status-submitted-fg)]",
    tone: "var(--status-submitted-fg)",
    icon: Call02Icon,
  },
  proposal: {
    bar: "bg-[var(--status-submitted-fg)]",
    tone: "var(--status-submitted-fg)",
    icon: File01Icon,
  },
  negotiation: {
    bar: "bg-[var(--status-pending-fg)]",
    tone: "var(--status-pending-fg)",
    icon: Coins01Icon,
  },
  won: {
    bar: "bg-[var(--status-success-fg)]",
    tone: "var(--status-success-fg)",
    icon: CheckmarkCircle02Icon,
  },
  lost: {
    bar: "bg-destructive/60",
    tone: "var(--destructive)",
    icon: Cancel01Icon,
  },
};

export type GroupedDeals = Record<DealStage, Deal[]>;

export function DealBoard({
  grouped,
  view = "kanban",
  contactName,
  now,
  locale,
  onMove,
  onEdit,
  onDelete,
  onDragActiveChange,
}: {
  readonly grouped: GroupedDeals;
  readonly view?: "kanban" | "list";
  readonly contactName: ReadonlyMap<string, string>;
  readonly now: Date;
  readonly locale: "es" | "en";
  readonly onMove: (id: string, stage: DealStage) => void;
  readonly onEdit: (deal: Deal) => void;
  readonly onDelete: (deal: Deal) => void;
  readonly onDragActiveChange?: (active: boolean) => void;
}) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const boardId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const zones = useRef(new Map<DealStage, HTMLElement>());
  const lists = useRef(new Map<DealStage, HTMLElement>());
  const slots = useRef(new Map<string, HTMLDivElement>());
  const heights = useRef(new Map<string, number>());
  const arrangement = useRef({ from: new Map<string, number>(), to: new Map<string, number>() });
  const dropRef = useRef<{ stage: DealStage; index: number } | null>(null);
  const droppedAt = useRef(0);
  const rafRef = useRef(0);
  const [lifted, setLifted] = useState<{ deal: Deal; width: number; height: number; left: number; top: number } | null>(null);
  const [drop, setDrop] = useState<{ stage: DealStage; index: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const session = useRef<{
    deal: Deal; start: { x: number; y: number }; pointer: { x: number; y: number }; pointerId: number;
    rect: DOMRect; board: DOMRect; root: DOMRect; viewport: DOMRect; active: boolean; landing: boolean;
    home: { stage: DealStage; index: number }; unit: number; extent: number; focused: boolean;
    scrolls: { el: HTMLElement; x: number; y: number }[]; windowX: number; windowY: number;
    groups: { stage: DealStage; rect: DOMRect; rows: { id: string; rect: DOMRect }[] }[];
  } | null>(null);
  const x = useMotionValue(0); const y = useMotionValue(0); const scrollX = useMotionValue(0); const scrollY = useMotionValue(0);
  const overlayX = useTransform(() => x.get() - scrollX.get()); const overlayY = useTransform(() => y.get() - scrollY.get());
  const screenPosition = useMotionValue(0); const velocity = useVelocity(screenPosition);
  const tilt = useSpring(useTransform(velocity, [-1400, 1400], [-7, 7]), { stiffness: 300, damping: 30, mass: 0.6 });
  const gain = useMotionValue(1); const rotate = useTransform(() => tilt.get() * gain.get());
  const scale = useMotionValue(1); const ring = useMotionValue(0); const progress = useMotionValue(1);

  useEffect(() => progress.on("change", (value) => {
    const { from, to } = arrangement.current;
    for (const key of new Set([...from.keys(), ...to.keys()])) {
      const height = (from.get(key) ?? 0) * (1 - value) + (to.get(key) ?? 0) * value;
      heights.current.set(key, height);
      slots.current.get(key)?.style.setProperty("height", `${height}px`);
    }
  }), [progress]);

  const scrollOffset = useCallback(() => {
    const drag = session.current;
    if (!drag) return { x: 0, y: 0 };
    return drag.scrolls.reduce((sum, scroll) => ({
      x: sum.x + scroll.el.scrollLeft - scroll.x,
      y: sum.y + scroll.el.scrollTop - scroll.y,
    }), { x: window.scrollX - drag.windowX, y: window.scrollY - drag.windowY });
  }, []);

  const slotAt = useCallback((clientX: number, clientY: number) => {
    const drag = session.current; if (!drag) return null;
    const offset = scrollOffset(); const px = clientX + offset.x; const py = clientY + offset.y; const margin = 80 * drag.unit;
    if (px < drag.board.left - margin || px > drag.board.right + margin || py < drag.board.top - margin || py > drag.board.bottom + margin) return null;
    const axis = view === "list" ? py : px;
    let nearest = drag.groups[0]; let distance = Infinity;
    for (const group of drag.groups) {
      const leading = view === "list" ? group.rect.top : group.rect.left;
      const trailing = view === "list" ? group.rect.bottom : group.rect.right;
      const next = Math.max(leading - axis, axis - trailing, 0);
      if (next < distance) { nearest = group; distance = next; }
    }
    if (!nearest) return null;
    let index = nearest.rows.findIndex((row) => py < row.rect.top + row.rect.height / 2);
    if (index < 0) index = nearest.rows.length;
    if (nearest.stage === drag.home.stage && index > drag.home.index) index--;
    return { stage: nearest.stage, index };
  }, [scrollOffset, view]);
  const setDropIfChanged = useCallback((next: { stage: DealStage; index: number } | null) => {
    const drag = session.current; if (!drag) return; const current = dropRef.current;
    if (current?.stage === next?.stage && current?.index === next?.index) return;
    progress.stop(); const from = new Map<string, number>(); let total = 0;
    for (const [key, el] of slots.current) { const height = el.getBoundingClientRect().height; if (height > 0) { from.set(key, height); total += height; } }
    if (total > 0) for (const [key, height] of from) from.set(key, height / total * drag.extent);
    else from.set(`${drag.home.stage}:${drag.home.index}`, drag.extent);
    const predicted = next ?? drag.home;
    arrangement.current = { from, to: new Map([[`${predicted.stage}:${predicted.index}`, drag.extent]]) };
    progress.jump(0); dropRef.current = next; setDrop(next);
    if (reduce) { progress.jump(1); ring.jump(next ? 1 : 0); } else { void animate(progress, 1, { duration: 0.24, ease: [0.23, 1, 0.32, 1] }); void animate(ring, next ? 1 : 0, { duration: 0.12, ease: [0.19, 1, 0.22, 1] }); }
  }, [progress, reduce, ring]);
  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current); rafRef.current = 0;
    x.stop(); y.stop(); scale.stop(); gain.stop(); ring.stop(); progress.stop();
    const drag = session.current; session.current = null;
    if (drag && rootRef.current?.hasPointerCapture(drag.pointerId)) rootRef.current.releasePointerCapture(drag.pointerId);
    heights.current.clear(); for (const slot of slots.current.values()) slot.style.height = "0px";
    dropRef.current = null; setDrop(null); setLifted(null); onDragActiveChange?.(false);
  }, [gain, onDragActiveChange, progress, ring, scale, x, y]);
  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary || session.current) return;
    const element = event.target as HTMLElement;
    if (element.closest("button, select, input, a")) return;
    const row = element.closest<HTMLElement>("[data-card-id]");
    const board = boardRef.current;
    const viewport = scrollerRef.current;
    if (!row || !board || !viewport) return;
    const dealId = row.dataset.cardId;
    const stage = DEAL_COLUMNS.find((s) => grouped[s].some((d) => d.id === dealId));
    const deal = stage && grouped[stage].find((d) => d.id === dealId);
    if (!stage || !deal) return;
    const scrolls: { el: HTMLElement; x: number; y: number }[] = [];
    let ancestor = board.parentElement;
    while (ancestor && ancestor !== document.scrollingElement) {
      scrolls.push({ el: ancestor, x: ancestor.scrollLeft, y: ancestor.scrollTop });
      ancestor = ancestor.parentElement;
    }
    const rect = row.getBoundingClientRect();
    const unit = (rootRef.current?.clientWidth ?? 1448) / 1448;
    session.current = {
      deal,
      start: { x: event.clientX, y: event.clientY },
      pointer: { x: event.clientX, y: event.clientY },
      pointerId: event.pointerId,
      rect,
      board: board.getBoundingClientRect(),
      root: rootRef.current!.getBoundingClientRect(),
      viewport: viewport.getBoundingClientRect(),
      active: false,
      landing: false,
      home: { stage, index: grouped[stage].findIndex((d) => d.id === deal.id) },
      unit,
      extent: rect.height + parseFloat(getComputedStyle(row).marginBottom || "0"),
      focused: row.contains(document.activeElement),
      scrolls,
      windowX: window.scrollX,
      windowY: window.scrollY,
      groups: DEAL_COLUMNS.flatMap((stage) => {
        const zone = zones.current.get(stage);
        return zone ? [{ stage, rect: zone.getBoundingClientRect(), rows: Array.from(zone.querySelectorAll<HTMLElement>("[data-card-id]"))
          .map((el) => ({ id: el.dataset.cardId!, rect: el.getBoundingClientRect() })) }] : [];
      }),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    onDragActiveChange?.(true);
  };
  const step = useCallback(() => {
    const drag = session.current;
    if (!drag?.active || drag.landing) return;
    const scroller = scrollerRef.current;
    const target = slotAt(drag.pointer.x, drag.pointer.y);
    if (scroller && target) {
      const own = drag.scrolls.find((scroll) => scroll.el === scroller);
      const offset = scrollOffset();
      const shift = view === "list"
        ? offset.y - (scroller.scrollTop - (own?.y ?? 0))
        : offset.x - (scroller.scrollLeft - (own?.x ?? 0));
      const leading = (view === "list" ? drag.viewport.top : drag.viewport.left) - shift;
      const trailing = (view === "list" ? drag.viewport.bottom : drag.viewport.right) - shift;
      const pointer = view === "list" ? drag.pointer.y : drag.pointer.x;
      const edge = Math.max(drag.unit, Math.min(90 * drag.unit, (trailing - leading) / 2));
      const depth = pointer < leading + edge ? -Math.min(1, (leading + edge - pointer) / edge)
        : pointer > trailing - edge ? Math.min(1, (pointer - trailing + edge) / edge) : 0;
      scroller[view === "list" ? "scrollTop" : "scrollLeft"] += depth * 22 * drag.unit;
    }
    const offset = scrollOffset();
    const own = drag.scrolls.find((scroll) => scroll.el === scroller);
    scrollX.set((scroller?.scrollLeft ?? 0) - (own?.x ?? 0));
    scrollY.set((scroller?.scrollTop ?? 0) - (own?.y ?? 0));
    const left = drag.rect.left + drag.pointer.x - drag.start.x;
    const top = drag.rect.top + drag.pointer.y - drag.start.y;
    x.set(left - drag.board.left + offset.x);
    y.set(top - drag.board.top + offset.y);
    screenPosition.set(view === "list" ? top : left);
    setDropIfChanged(slotAt(drag.pointer.x, drag.pointer.y));
    rafRef.current = requestAnimationFrame(step);
  }, [screenPosition, scrollOffset, scrollX, scrollY, setDropIfChanged, slotAt, view, x, y]);
  const handleDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = session.current;
    if (!drag || drag.landing || event.pointerId !== drag.pointerId) return;
    drag.pointer = { x: event.clientX, y: event.clientY };
    if (drag.active || Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) < 4 * drag.unit) return;
    drag.active = true;
    drag.focused ||= document.activeElement?.closest<HTMLElement>("[data-card-id]")?.dataset.cardId === drag.deal.id;
    screenPosition.jump(view === "list" ? drag.rect.top : drag.rect.left);
    x.jump(drag.rect.left - drag.board.left);
    y.jump(drag.rect.top - drag.board.top);
    scrollX.jump(0);
    scrollY.jump(0);
    scale.jump(1);
    gain.jump(reduce ? 0 : 1);
    ring.jump(1);
    const homeKey = `${drag.home.stage}:${drag.home.index}`;
    heights.current = new Map([[homeKey, drag.extent]]);
    arrangement.current = { from: new Map(heights.current), to: new Map(heights.current) };
    progress.jump(1);
    dropRef.current = drag.home;
    setDrop(drag.home);
    setLifted({ deal: drag.deal, width: drag.rect.width, height: drag.rect.height, left: drag.board.left - drag.root.left, top: drag.board.top - drag.root.top });
    if (!reduce) void animate(scale, 1.04, { duration: 0.18, ease: EASE_OUT });
    rafRef.current = requestAnimationFrame(step);
  };
  const handleDragEnd = useCallback(async (cancelled = false) => {
    const drag = session.current;
    if (!drag || drag.landing) return;
    if (!drag.active) {
      reset();
      if (!cancelled) onEdit(drag.deal);
      return;
    }
    drag.landing = true;
    cancelAnimationFrame(rafRef.current);
    droppedAt.current = Date.now();
    const target = (cancelled ? null : slotAt(drag.pointer.x, drag.pointer.y)) ?? drag.home;
    flushSync(() => setDropIfChanged(target));
    const list = zones.current.get(target.stage)?.querySelector<HTMLElement>("[data-stage-list]");
    const hole = Array.from(list?.querySelectorAll<HTMLElement>("[data-slot-key]") ?? [])
      .find((el) => el.dataset.slotKey === `${target.stage}:${target.index}`);
    if (!hole) { reset(); return; }
    const rect = hole.getBoundingClientRect();
    let closingAbove = 0;
    for (const el of slots.current.values()) {
      if (el === hole) continue;
      const other = el.getBoundingClientRect();
      if (other.top < rect.top && other.left < rect.right && other.right > rect.left) closingAbove += other.height;
    }
    const offset = scrollOffset();
    const left = rect.left - drag.board.left + offset.x;
    const top = rect.top - closingAbove - drag.board.top + offset.y;
    const distance = Math.hypot(left - x.get(), top - y.get());
    const duration = Math.min(0.32, 0.18 + distance / 2400);
    if (!reduce) {
      void animate(progress, 1, { duration: duration * 0.85, ease: [0.23, 1, 0.32, 1] });
      void animate(gain, 0, { duration: duration * 0.55, ease: [0.19, 1, 0.22, 1] });
      void animate(scale, 1, { duration: duration * 0.85, ease: [0.25, 0.7, 0.2, 1] });
      void animate(ring, 0, { duration: duration * 0.85, ease: [0.19, 1, 0.22, 1] });
      await Promise.all([
        animate(x, left, { type: "tween", duration, ease: [0.25, 0.7, 0.2, 1] }),
        animate(y, top, { type: "tween", duration, ease: [0.25, 0.7, 0.2, 1] }),
      ]);
    }
    if (session.current !== drag) return;
    flushSync(() => {
      if (target.stage !== drag.home.stage || target.index !== drag.home.index) onMove(drag.deal.id, target.stage);
      reset();
      droppedAt.current = Date.now();
      setAnnouncement(`${drag.deal.title}: ${t(`pipeline.stage.${target.stage}`)}`);
    });
    if (drag.focused) {
      Array.from(boardRef.current?.querySelectorAll<HTMLElement>("[data-card-id]") ?? [])
        .find((el) => el.dataset.cardId === drag.deal.id)?.focus({ preventScroll: true });
    }
  }, [gain, onEdit, onMove, progress, reduce, reset, ring, scale, scrollOffset, setDropIfChanged, slotAt, t, x, y]);

  useEffect(() => { const cancel = () => void handleDragEnd(true); const key = (e: KeyboardEvent) => { if (e.key === "Escape" && session.current) cancel(); }; window.addEventListener("keydown", key); window.addEventListener("blur", cancel); window.addEventListener("resize", reset); return () => { window.removeEventListener("keydown", key); window.removeEventListener("blur", cancel); window.removeEventListener("resize", reset); }; }, [handleDragEnd, reset]);

  useEffect(() => () => reset(), [reset, view]);

  // ── Custom kanban slider ─────────────────────────────────────
  // A real control instead of the native pill: a floating shuttle pinned to
  // the bottom that mirrors scrollLeft and drives it back. `scroll` +
  // ResizeObserver keep it honest; pointer capture makes the drag unlosable.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const thumbDrag = useRef<{ startX: number; startScroll: number } | null>(null);
  const [shuttle, setShuttle] = useState({ x: 0, w: 0, frac: 0, max: 0 });
  // Portal + visibility for the page-bottom slider (below).
  const [sliderVisible, setSliderVisible] = useState(true);

  const measureSlider = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const max = scroller.scrollWidth - scroller.clientWidth;
    // Edge fade: a side only dissolves while there is content past it — a
    // permanent both-sides mask would dim the first column before scrolling.
    scroller.style.setProperty("--x-fade-start", scroller.scrollLeft > 4 ? "56px" : "0px");
    scroller.style.setProperty("--x-fade-end", scroller.scrollLeft < max - 4 ? "56px" : "0px");
    // The track only exists once the slider renders (max > 0), so max is
    // reported first and the thumb measured on the re-run the render
    // triggers — measuring both or neither deadlocks the slider away.
    const track = trackRef.current;
    if (!track || max <= 0) {
      setShuttle((s) => (s.max === max && s.w === 0 ? s : { x: 0, w: 0, frac: 0, max }));
      return;
    }
    const trackW = track.clientWidth;
    if (trackW <= 0) return;
    const w = Math.max((scroller.clientWidth / scroller.scrollWidth) * trackW, 44);
    const frac = scroller.scrollLeft / max;
    const x = frac * (trackW - w);
    setShuttle((s) =>
      Math.abs(s.x - x) < 0.5 && Math.abs(s.w - w) < 0.5 && s.max === max
        ? s
        : { x, w, frac, max },
    );
  }, []);

  useEffect(() => {
    if (view !== "kanban") return;
    measureSlider();
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    const onScroll = () => measureSlider();
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measureSlider);
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measureSlider()) : null;
    if (scroller) ro?.observe(scroller);
    if (track) ro?.observe(track);
    // The slider floats at the page bottom: hide it while the board is off
    // screen instead of parking a pill over unrelated content.
    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(([entry]) => setSliderVisible(entry.isIntersecting), {
            threshold: 0.05,
          })
        : null;
    if (scroller) io?.observe(scroller);
    // Layout settles after first paint (fonts, container queries).
    const settled = setTimeout(measureSlider, 300);
    return () => {
      scroller?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measureSlider);
      ro?.disconnect();
      io?.disconnect();
      clearTimeout(settled);
    };
  }, [measureSlider, view, grouped]);

  const onThumbDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    if (!scroller || shuttle.max <= 0) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    thumbDrag.current = { startX: event.clientX, startScroll: scroller.scrollLeft };
  };
  const onThumbMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = thumbDrag.current;
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!drag || !scroller || !track) return;
    const travel = track.clientWidth - shuttle.w;
    if (travel <= 0) return;
    // eslint-disable-next-line react-hooks/immutability
    scroller.scrollLeft = drag.startScroll + ((event.clientX - drag.startX) / travel) * shuttle.max;
  };
  const endThumbDrag = () => {
    thumbDrag.current = null;
  };
  const onTrackDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!scroller || !track || shuttle.max <= 0) return;
    const rect = track.getBoundingClientRect();
    const travel = rect.width - shuttle.w;
    if (travel <= 0) return;
    const frac = Math.min(1, Math.max(0, (event.clientX - rect.left - shuttle.w / 2) / travel));
    scroller.scrollTo({ left: frac * shuttle.max, behavior: "smooth" });
  };
  const onThumbKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const step = scroller.clientWidth * 0.25;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      scroller.scrollBy({ left: step });
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      scroller.scrollBy({ left: -step });
    } else if (event.key === "Home") {
      event.preventDefault();
      scroller.scrollTo({ left: 0 });
    } else if (event.key === "End") {
      event.preventDefault();
      scroller.scrollTo({ left: shuttle.max });
    }
  };
  const nudge = (direction: -1 | 1) => {
    scrollerRef.current?.scrollBy({
      left: direction * scrollerRef.current.clientWidth * 0.6,
      behavior: "smooth",
    });
  };

  return (
    <div ref={rootRef} style={{ containerType: "inline-size" }} className="relative min-w-0" onPointerDown={handleDragStart} onPointerMove={handleDrag} onPointerUp={(event) => { if (event.pointerId === session.current?.pointerId) void handleDragEnd(); }} onPointerCancel={(event) => { if (event.pointerId === session.current?.pointerId) void handleDragEnd(true); }} onLostPointerCapture={() => { if (session.current && !session.current.landing) void handleDragEnd(true); }} onClickCapture={(event) => { if (session.current?.active || Date.now() - droppedAt.current < 350) { event.preventDefault(); event.stopPropagation(); } }} onKeyDown={(event) => {
      if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
      const id = (event.target as HTMLElement).closest<HTMLElement>("[data-card-id]")?.dataset.cardId;
      if (!id) return;
      const stage = DEAL_COLUMNS.find((candidate) => grouped[candidate].some((deal) => deal.id === id));
      if (!stage) return;
      const index = grouped[stage].findIndex((deal) => deal.id === id);
      const next = event.key === "ArrowUp" ? DEAL_COLUMNS[Math.max(0, DEAL_COLUMNS.indexOf(stage) - 1)] : DEAL_COLUMNS[Math.min(DEAL_COLUMNS.length - 1, DEAL_COLUMNS.indexOf(stage) + 1)];
      event.preventDefault();
      if (next !== stage) onMove(id, next);
      void index;
    }}>
      <p className="sr-only" role="status">{announcement}</p>
      {/* The kanban owns a real horizontal scroller (driven by the custom
          slider below); the list is a plain stack. They must not share the
          wrapper: `overflow-x-auto` + `overscroll-contain` turns it into a
          scroll container that swallows the wheel even with nothing to
          scroll, which is why in list view the page only moved when the
          pointer was off the cards. */}
      <div
        ref={scrollerRef}
        id={`${boardId}-scroller`}
        className={
          view === "kanban"
            ? "x-fade overscroll-x-contain overflow-x-auto overflow-y-clip scrollbar-hide"
            : "overscroll-contain w-full"
        }
        style={{ padding: q(8), paddingBottom: view === "kanban" ? q(12) : undefined }}
      >
        <div
          ref={boardRef}
          className={view === "list" ? "grid min-w-0 items-start" : "flex min-w-max items-start"}
          style={{ gap: q(12) }}
        >
          {DEAL_COLUMNS.map((stage) => {
            const theme = DEAL_THEME[stage];
            const cards = grouped[stage].filter((deal) => deal.id !== lifted?.deal.id);
            const count = cards.length + (lifted && drop?.stage === stage ? 1 : 0);
            const currencies = [...new Set(grouped[stage].map((deal) => deal.currency))];

            return (
              <section
                key={stage}
                aria-label={t(`pipeline.stage.${stage}`)}
                ref={(el) => { if (el) zones.current.set(stage, el); else zones.current.delete(stage); }}
                className={cn("kpi-card min-w-0 border border-border bg-card", view === "list" && "@container")}
                style={{
                  borderRadius: q(18),
                  padding: q(8),
                  boxShadow: "var(--shadow-soft)",
                  width: view === "list" ? undefined : q(300),
                  flex: view === "list" ? undefined : "0 0 auto",
                }}
              >
                <header
                  className="kpi-header flex items-center"
                  style={{ minHeight: q(44), height: "auto", gap: q(8), paddingInline: q(8), paddingBlock: q(4) }}
                >
                  <HugeiconsIcon
                    icon={theme.icon}
                    size={q(14)}
                    strokeWidth={1.75}
                    style={{ color: theme.tone, flexShrink: 0 }}
                  />
                  <div className="min-w-0 flex-1">
                    <h2
                      className="truncate font-medium text-foreground"
                      style={{ fontSize: q(13), lineHeight: q(17), fontFamily: "inherit" }}
                    >
                      {t(`pipeline.stage.${stage}`)}
                    </h2>
                    <div className="mt-1 flex h-[3px] gap-[2px]" aria-hidden="true">
                      {Array.from({ length: 8 }, (_, index) => (
                        <span
                          key={index}
                          className="flex-1 rounded-full"
                          style={{
                            background:
                              index < Math.min(count, 8) ? theme.tone : "var(--muted)",
                          }}
                        />
                      ))}
                    </div>
                    <p
                      className="mt-1 truncate text-muted-foreground tabular-nums"
                      style={{ fontSize: q(11), lineHeight: q(14) }}
                    >
                      {currencies.length === 0
                        ? "—"
                        : currencies
                            .map((code) =>
                              formatMoney(
                                grouped[stage]
                                  .filter((deal) => deal.currency === code)
                                  .reduce((sum, deal) => sum + deal.value, 0),
                                code,
                                locale,
                              ),
                            )
                            .join(" · ")}
                      {stage !== "won" && stage !== "lost" ? (
                        <span className="ml-1.5 font-mono tabular-nums">
                          {Math.round(STAGE_PROBABILITY[stage] * 100)}%
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <span
                    className="relative ml-auto overflow-hidden text-right font-medium text-foreground tabular-nums"
                    style={{ minWidth: q(24), height: q(20), fontSize: q(14), lineHeight: q(20) }}
                  >
                    <AnimatePresence initial={false} mode="popLayout">
                      <motion.span
                        key={count}
                        className="block"
                        initial={{ y: reduce ? 0 : q(-8), opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: reduce ? 0 : q(8), opacity: 0 }}
                        transition={{ duration: reduce ? 0 : 0.2, ease: EASE_OUT }}
                      >
                        {count}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                </header>
                <div
                  data-stage-list
                  className={cn("relative min-w-0", view === "list" && "overflow-hidden")}
                  style={{ minHeight: q(view === "list" ? 40 : 88), padding: q(8), marginTop: q(2) }}
                >
                  {count === 0 ? (
                    <p
                      className="flex min-h-16 items-center justify-center text-center text-muted-foreground"
                      style={{ fontSize: q(12), lineHeight: q(16) }}
                    >
                      {t("pipeline.stageEmpty")}
                    </p>
                  ) : null}
                  {Array.from({ length: cards.length + 1 }, (_, index) => {
                    const key = `${stage}:${index}`;
                    const deal = cards[index];
                    return (
                      <div key={deal?.id ?? "end"} className="flow-root">
                        <div
                          data-slot-key={key}
                          aria-hidden
                          className="relative overflow-hidden"
                          ref={(el) => {
                            if (el) {
                              slots.current.set(key, el);
                              el.style.height = `${heights.current.get(key) ?? 0}px`;
                            } else slots.current.delete(key);
                          }}
                        >
                          {lifted && drop?.stage === stage && drop.index === index ? (
                            <div
                              className="absolute inset-x-0 top-0 border border-dashed"
                              style={{
                                height: lifted.height,
                                borderRadius: q(20),
                                background: `color-mix(in oklch, ${theme.tone} 8%, var(--card))`,
                                borderColor: `color-mix(in oklch, ${theme.tone} 45%, var(--border))`,
                              }}
                            />
                          ) : null}
                        </div>
                        {deal ? (
                          <DealCard
                            deal={deal}
                            view={view}
                            locale={locale}
                            now={now}
                            contactName={contactName.get(deal.contactId)}
                            dimmed={lifted?.deal.id === deal.id}
                            moving={!!lifted}
                            onMove={onMove}
                            onEdit={onEdit}
                            onDelete={onDelete}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {lifted ? <motion.div aria-hidden inert className="pointer-events-none absolute z-50 shadow-[var(--shadow-float)]" style={{ left: lifted.left, top: lifted.top, x: overlayX, y: overlayY, rotate: reduce ? 0 : rotate, scale, width: lifted.width, height: lifted.height, borderRadius: q(20) }}><DealCard deal={lifted.deal} view={view} locale={locale} now={now} contactName={contactName.get(lifted.deal.contactId)} moving overlay onMove={onMove} onEdit={onEdit} onDelete={onDelete} /><motion.div className="absolute inset-0" style={{ opacity: ring, borderRadius: q(20), boxShadow: `0 0 0 ${q(1.5)} ${DEAL_THEME[drop?.stage ?? lifted.deal.stage].tone}` }} /></motion.div> : null}
      {/* Page-bottom slider via portal: the board root is a container-query
          container, which would re-anchor `fixed` to itself instead of the
          viewport. It only lives while the kanban overflows, and fades out
          while the board is off screen. */}
      {view === "kanban" && shuttle.max > 0 && typeof document !== "undefined"
        ? createPortal(
            <div
              className={cn(
                "fixed bottom-5 left-1/2 z-40 -translate-x-1/2 transition duration-300",
                sliderVisible
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-3 opacity-0",
              )}
            >
              <div className="flex items-center gap-1 rounded-full border border-border bg-card/90 py-1.5 pr-3 pl-1.5 shadow-[var(--shadow-float)] backdrop-blur-sm">
                <SliderButton
                  icon={ArrowLeft01Icon}
                  label={locale === "es" ? "Anterior" : "Previous"}
                  disabled={shuttle.frac <= 0}
                  onClick={() => nudge(-1)}
                />
                <div
                  ref={trackRef}
                  onPointerDown={onTrackDown}
                  className="relative h-1.5 w-[min(300px,50vw)] cursor-pointer rounded-full bg-muted"
                >
                  <div
                    role="scrollbar"
                    aria-controls={`${boardId}-scroller`}
                    aria-orientation="horizontal"
                    aria-label={locale === "es" ? "Desplazar tablero" : "Scroll board"}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(shuttle.frac * 100)}
                    tabIndex={0}
                    onPointerDown={onThumbDown}
                    onPointerMove={onThumbMove}
                    onPointerUp={endThumbDrag}
                    onPointerCancel={endThumbDrag}
                    onKeyDown={onThumbKey}
                    className="absolute top-1/2 h-3.5 -translate-y-1/2 cursor-grab touch-none rounded-full bg-foreground/30 transition-colors duration-150 outline-none hover:bg-foreground/55 focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] active:cursor-grabbing active:bg-foreground/70"
                    style={{ left: shuttle.x, width: shuttle.w }}
                  />
                </div>
                <SliderButton
                  icon={ArrowRight01Icon}
                  label={locale === "es" ? "Siguiente" : "Next"}
                  disabled={shuttle.frac >= 1}
                  onClick={() => nudge(1)}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function SliderButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  readonly icon: typeof Call02Icon;
  readonly label: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors duration-150 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:pointer-events-none disabled:opacity-30"
    >
      <HugeiconsIcon icon={icon} size={14} strokeWidth={1.75} />
    </button>
  );
}

const DealCard = memo(function DealCard({
  deal,
  view,
  locale,
  now,
  contactName,
  dimmed,
  moving,
  onMove,
  onEdit,
  onDelete,
  overlay,
}: {
  readonly deal: Deal;
  readonly view: "kanban" | "list";
  readonly locale: "es" | "en";
  readonly now: Date;
  readonly contactName?: string;
  readonly dimmed?: boolean;
  readonly moving?: boolean;
  readonly onMove: (id: string, stage: DealStage) => void;
  readonly onEdit: (deal: Deal) => void;
  readonly onDelete: (deal: Deal) => void;
  readonly overlay?: boolean;
}) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const list = view === "list";
  const stale = isStale(deal, now);
  const overdue = isOverdue(deal, now);

  return (
    <motion.article
      data-card-id={overlay ? undefined : deal.id}
      layout={reduce ? false : "position"}
      initial={false}
      transition={{ duration: reduce ? 0 : 0.24, ease: EASE_OUT }}
      draggable={false}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit(deal);
        }
      }}
      role="group"
      tabIndex={0}
      aria-label={deal.title}
      style={{
        outlineWidth: q(2),
        outlineOffset: q(-2),
        borderRadius: list ? q(16) : q(20),
        marginBottom: q(8),
        opacity: dimmed && !overlay ? 0.4 : 1,
        boxShadow: dimmed && !overlay ? `0 0 0 2px ${DEAL_THEME[deal.stage].tone}` : undefined,
      }}
      className={cn(
        "group relative min-w-0 cursor-grab touch-none select-none text-left text-card-foreground active:cursor-grabbing",
        "focus-visible:outline-solid focus-visible:outline-[color:var(--ring)]",
      )}
    >
      {list ? (
        <>
          {/* List mode: double-border matching kanban style */}
          <div
            className="min-w-0 border border-border/70 bg-muted/40"
            style={{ borderRadius: q(16), padding: q(5), boxShadow: "var(--shadow-soft)" }}
          >
            <div
              className="min-w-0 border border-border/50 bg-card"
              style={{
                borderRadius: q(12),
                paddingInline: q(14),
                paddingBlock: q(8),
                display: "grid",
                gridTemplateColumns: `minmax(0, 1.5fr) minmax(0, 0.9fr) minmax(0, 1.2fr) minmax(0, 1fr) auto`,
                gridTemplateRows: "minmax(0, 1fr)",
                columnGap: q(10),
                alignItems: "center",
              }}
            >
              <span title={deal.title} className="min-w-0 truncate font-medium text-foreground" style={{ fontSize: q(13), lineHeight: q(17), gridColumn: 1 }}>
                {deal.title}
              </span>
              <span title={formatMoney(deal.value, deal.currency, locale)} className="min-w-0 truncate font-semibold tabular-nums" style={{ fontSize: q(12), lineHeight: q(17), gridColumn: 2, color: `color-mix(in oklch, ${DEAL_THEME[deal.stage].tone} 85%, var(--foreground))` }}>
                {formatMoney(deal.value, deal.currency, locale)}
              </span>
              <span title={contactName ?? ""} className="min-w-0 truncate text-muted-foreground" style={{ fontSize: q(12), lineHeight: q(17), gridColumn: 3 }}>
                {contactName ?? "—"}
              </span>
              <span className="flex min-w-0 flex-wrap items-center" style={{ gap: q(4), gridColumn: 4, fontSize: q(10), lineHeight: q(17) }}>
                {overdue ? (
                  <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5" style={{ fontSize: q(10), background: "var(--status-review-bg)", color: "var(--status-review-fg)" }}>
                    <HugeiconsIcon icon={AlertCircleIcon} size={q(9)} strokeWidth={1.75} />
                    {t("pipeline.flag.overdue")}
                  </span>
                ) : null}
                {stale ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground" style={{ fontSize: q(10) }}>
                    <HugeiconsIcon icon={Clock01Icon} size={q(9)} strokeWidth={1.75} />
                    {t("pipeline.flag.stale")}
                  </span>
                ) : null}
                {deal.expectedCloseAt && !overdue ? (
                  <span className="truncate text-muted-foreground/70" style={{ fontSize: q(10) }}>{t("pipeline.closesIn", { when: timeUntil(deal.expectedCloseAt, locale) })}</span>
                ) : null}
                {!overdue && !stale && !deal.expectedCloseAt ? <span className="text-muted-foreground/0">{"\u00a0"}</span> : null}
              </span>
              <div
                data-card-actions
                aria-hidden={moving || undefined}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                draggable={false}
                className={cn("flex shrink-0 items-center", moving && "pointer-events-none opacity-50")}
                style={{ gridColumn: 5, gap: q(4) }}
              >
                <Select value={deal.stage} onValueChange={(stage) => onMove(deal.id, stage as DealStage)}>
                  <SelectTrigger size="sm" aria-label={locale === "es" ? `Cambiar etapa de ${deal.title}` : `Change stage for ${deal.title}`} onPointerDown={(event) => event.stopPropagation()} className="min-w-0 rounded-lg border-transparent bg-transparent shadow-none hover:bg-accent/60" style={{ height: q(28), fontSize: q(11), paddingInline: q(6) }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {DEAL_COLUMNS.map((stage) => <SelectItem key={stage} value={stage}>{t(`pipeline.stage.${stage}`)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="ghost" size="icon-xs" aria-label={locale === "es" ? `Abrir ${deal.title}` : `Open ${deal.title}`} onClick={() => onEdit(deal)} onPointerDown={(event) => event.stopPropagation()} className="text-muted-foreground hover:bg-accent/70 hover:text-foreground" style={{ width: q(28), height: q(28) }}>
                  <HugeiconsIcon icon={ArrowRight01Icon} size={q(13)} strokeWidth={1.75} />
                </Button>
                <Button type="button" variant="ghost" size="icon-xs" aria-label={t("pipeline.delete")} onClick={() => onDelete(deal)} onPointerDown={(event) => event.stopPropagation()} className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive" style={{ width: q(28), height: q(28) }}>
                  <HugeiconsIcon icon={Delete01Icon} size={q(13)} strokeWidth={1.75} />
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Kanban mode: outer border + inner content border, actions at bottom — matches /agents card style */}
          <div
            className="min-w-0 border border-border/70 bg-muted/40"
            style={{ borderRadius: q(20), padding: q(6), boxShadow: "var(--shadow-float)" }}
          >
            {/* Inner content block */}
            <div
              className="min-w-0 border border-border/50 bg-card"
              style={{
                borderRadius: q(14),
                padding: `${q(12)} ${q(14)}`,
                boxShadow: "var(--shadow-xs, 0 1px 2px rgba(0,0,0,.06))",
                display: "grid",
                gridTemplateColumns: `minmax(0, 1fr) auto`,
                rowGap: q(5),
                columnGap: q(8),
              }}
            >
              {/* Title */}
              <span
                title={deal.title}
                className="min-w-0 truncate font-medium text-foreground"
                style={{ fontSize: q(13), lineHeight: q(18), gridColumn: 1, gridRow: 1 }}
              >
                {deal.title}
              </span>
              {/* Value — top right, tinted by stage */}
              <span
                title={formatMoney(deal.value, deal.currency, locale)}
                className="shrink-0 text-right font-semibold tabular-nums"
                style={{
                  fontSize: q(12),
                  lineHeight: q(18),
                  gridColumn: 2,
                  gridRow: 1,
                  color: `color-mix(in oklch, ${DEAL_THEME[deal.stage].tone} 85%, var(--foreground))`,
                }}
              >
                {formatMoney(deal.value, deal.currency, locale)}
              </span>
              {/* Contact name */}
              <span
                title={contactName ?? ""}
                className="col-span-2 min-w-0 truncate text-muted-foreground"
                style={{ fontSize: q(11.5), lineHeight: q(16), gridColumn: "1 / -1", gridRow: 2 }}
              >
                {contactName ?? "—"}
              </span>
              {/* Status tags — only rendered when there's something to show */}
              {(overdue || stale || deal.expectedCloseAt || (deal.stage === "lost" && deal.lostReason)) ? (
                <div
                  className="col-span-2 flex min-w-0 flex-wrap items-center"
                  style={{ gap: q(4), gridColumn: "1 / -1", gridRow: 3 }}
                >
                  {overdue ? (
                    <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5" style={{ fontSize: q(10), background: "var(--status-review-bg)", color: "var(--status-review-fg)" }}>
                      <HugeiconsIcon icon={AlertCircleIcon} size={q(9)} strokeWidth={1.75} />
                      {t("pipeline.flag.overdue")}
                    </span>
                  ) : null}
                  {stale ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground" style={{ fontSize: q(10) }}>
                      <HugeiconsIcon icon={Clock01Icon} size={q(9)} strokeWidth={1.75} />
                      {t("pipeline.flag.stale")}
                    </span>
                  ) : null}
                  {deal.expectedCloseAt && !overdue ? (
                    <span className="truncate text-muted-foreground/60" style={{ fontSize: q(10) }}>
                      {t("pipeline.closesIn", { when: timeUntil(deal.expectedCloseAt, locale) })}
                    </span>
                  ) : null}
                  {deal.stage === "lost" && deal.lostReason ? (
                    <span className="min-w-0 truncate text-muted-foreground/60" title={deal.lostReason} style={{ fontSize: q(10) }}>
                      {deal.lostReason}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            {/* Actions — below inner border, no separator */}
            <div
              data-card-actions
              aria-hidden={moving || undefined}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              draggable={false}
              className={cn("flex min-w-0 items-center", moving && "pointer-events-none")}
              style={{ gap: q(4), paddingInline: q(6), paddingTop: q(6), paddingBottom: q(2) }}
            >
              <Select value={deal.stage} onValueChange={(stage) => onMove(deal.id, stage as DealStage)}>
                <SelectTrigger
                  size="sm"
                  aria-label={locale === "es" ? `Cambiar etapa de ${deal.title}` : `Change stage for ${deal.title}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="min-w-0 flex-1 rounded-lg border-transparent bg-transparent shadow-none hover:bg-accent/60"
                  style={{ height: q(28), fontSize: q(11), paddingInline: q(6) }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {DEAL_COLUMNS.map((stage) => (
                    <SelectItem key={stage} value={stage}>{t(`pipeline.stage.${stage}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button" variant="ghost" size="icon-xs"
                aria-label={locale === "es" ? `Abrir ${deal.title}` : `Open ${deal.title}`}
                onClick={() => onEdit(deal)}
                onPointerDown={(event) => event.stopPropagation()}
                className="shrink-0 text-muted-foreground hover:bg-accent/70 hover:text-foreground"
                style={{ width: q(28), height: q(28) }}
              >
                <HugeiconsIcon icon={ArrowRight01Icon} size={q(13)} strokeWidth={1.75} />
              </Button>
              <Button
                type="button" variant="ghost" size="icon-xs"
                aria-label={t("pipeline.delete")}
                onClick={() => onDelete(deal)}
                onPointerDown={(event) => event.stopPropagation()}
                className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                style={{ width: q(28), height: q(28) }}
              >
                <HugeiconsIcon icon={Delete01Icon} size={q(13)} strokeWidth={1.75} />
              </Button>
            </div>
          </div>
        </>
      )}
    </motion.article>
  );
});
