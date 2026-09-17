"use client";

import { memo, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { flushSync } from "react-dom";
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
import { Call02Icon, BubbleChatIcon,NotificationBubbleIcon, Clock01Icon, CheckmarkCircle02Icon, Delete01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { useI18n } from "@/lib/i18n/provider";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Contact, ContactStatus } from "@/lib/types";

export const CRM_COLUMNS = ["open", "waiting_human", "followup_due", "closed"] as const;

export type GroupedContacts = Record<ContactStatus, Contact[]>;

export const q = (px: number) => `max(${px}px, ${(px / 1448) * 100}cqw)`;
const EASE_OUT = [0.19, 1, 0.22, 1] as const;
const EASE_SLOT = [0.23, 1, 0.32, 1] as const;
const EASE_LAND = [0.25, 0.7, 0.2, 1] as const;
const DROP_CLICK_GRACE_MS = 350;

type StatusTheme = {
  readonly dot: string;
  readonly chip: string;
  readonly bar: string;
  readonly tone: string;
  readonly icon: typeof Call02Icon;
};

export const STATUS_THEME: Record<ContactStatus, StatusTheme> = {
  open: {
    dot: "bg-[var(--status-progress-fg)]",
    chip: "text-[var(--status-progress-fg)]",
    bar: "bg-[var(--status-progress-fg)]",
    tone: "var(--status-progress-fg)",
    icon: Call02Icon,
  },
  waiting_human: {
    dot: "bg-[var(--status-pending-fg)]",
    chip: "text-[var(--status-pending-fg)]",
    bar: "bg-[var(--status-pending-fg)]",
    tone: "var(--status-pending-fg)",
    icon: NotificationBubbleIcon,
  },
  followup_due: {
    dot: "bg-[var(--status-submitted-fg)]",
    chip: "text-[var(--status-submitted-fg)]",
    bar: "bg-[var(--status-submitted-fg)]",
    tone: "var(--status-submitted-fg)",
    icon: Clock01Icon,
  },
  closed: {
    dot: "bg-[var(--status-success-fg)]",
    chip: "text-[var(--status-success-fg)]",
    bar: "bg-[var(--status-success-fg)]",
    tone: "var(--status-success-fg)",
    icon: CheckmarkCircle02Icon,
  },
};

export function CrmBoard({
  grouped,
  view = "kanban",
  onMove,
  onEdit,
  onDelete,
  onDragActiveChange,
}: {
  readonly grouped: GroupedContacts;
  readonly view?: "kanban" | "list";
  readonly onMove: (id: string, status: ContactStatus, index?: number) => void;
  readonly onEdit: (contact: Contact) => void;
  readonly onDelete: (id: string) => void;
  readonly onDragActiveChange?: (active: boolean) => void;
}) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const zones = useRef(new Map<ContactStatus, HTMLElement>());
  const slots = useRef(new Map<string, HTMLDivElement>());
  const heights = useRef(new Map<string, number>());
  const arrangement = useRef({ from: new Map<string, number>(), to: new Map<string, number>() });
  const dropRef = useRef<{ status: ContactStatus; index: number } | null>(null);
  const droppedAt = useRef(0);
  const rafRef = useRef(0);
  const [drop, setDrop] = useState<{ status: ContactStatus; index: number } | null>(null);
  const [lifted, setLifted] = useState<{ contact: Contact; width: number; height: number; left: number; top: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const session = useRef<{
    contact: Contact;
    home: { status: ContactStatus; index: number };
    start: { x: number; y: number };
    pointer: { x: number; y: number };
    pointerId: number;
    rect: DOMRect;
    root: DOMRect;
    board: DOMRect;
    viewport: DOMRect;
    groups: { status: ContactStatus; rect: DOMRect; rows: { id: string; rect: DOMRect }[] }[];
    scrolls: { el: HTMLElement; x: number; y: number }[];
    windowX: number;
    windowY: number;
    unit: number;
    extent: number;
    active: boolean;
    landing: boolean;
    focused: boolean;
  } | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scrollX = useMotionValue(0);
  const scrollY = useMotionValue(0);
  const overlayX = useTransform(() => x.get() - scrollX.get());
  const overlayY = useTransform(() => y.get() - scrollY.get());
  const screenPosition = useMotionValue(0);
  const velocity = useVelocity(screenPosition);
  const tilt = useSpring(useTransform(velocity, [-1400, 1400], [-7, 7]), { stiffness: 300, damping: 30, mass: 0.6 });
  const gain = useMotionValue(1);
  const rotate = useTransform(() => tilt.get() * gain.get());
  const scale = useMotionValue(1);
  const ring = useMotionValue(0);
  const progress = useMotionValue(1);

  useEffect(() => progress.on("change", (value) => {
    const { from, to } = arrangement.current;
    for (const key of new Set([...from.keys(), ...to.keys()])) {
      const height = (from.get(key) ?? 0) * (1 - value) + (to.get(key) ?? 0) * value;
      heights.current.set(key, height);
      const el = slots.current.get(key);
      if (el) el.style.height = `${height}px`;
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
    const drag = session.current;
    if (!drag) return null;
    const offset = scrollOffset();
    const px = clientX + offset.x;
    const py = clientY + offset.y;
    const margin = 80 * drag.unit;
    if (px < drag.board.left - margin || px > drag.board.right + margin ||
      py < drag.board.top - margin || py > drag.board.bottom + margin) return null;
    const axis = view === "list" ? py : px;
    let nearest = drag.groups[0];
    let distance = Infinity;
    for (const group of drag.groups) {
      const leading = view === "list" ? group.rect.top : group.rect.left;
      const trailing = view === "list" ? group.rect.bottom : group.rect.right;
      const next = Math.max(leading - axis, axis - trailing, 0);
      if (next < distance) { nearest = group; distance = next; }
    }
    if (!nearest) return null;
    let index = nearest.rows.findIndex((row) => py < row.rect.top + row.rect.height / 2);
    if (index < 0) index = nearest.rows.length;
    if (nearest.status === drag.home.status && index > drag.home.index) index--;
    return { status: nearest.status, index };
  }, [scrollOffset, view]);

  const setDropIfChanged = useCallback((next: { status: ContactStatus; index: number } | null) => {
    const drag = session.current;
    if (!drag) return;
    const current = dropRef.current;
    if (current?.status === next?.status && current?.index === next?.index) return;
    progress.stop();
    const from = new Map<string, number>();
    let total = 0;
    for (const [key, el] of slots.current) {
      const height = el.getBoundingClientRect().height;
      if (height > 0) { from.set(key, height); total += height; }
    }
    if (total > 0) {
      for (const [key, height] of from) from.set(key, height / total * drag.extent);
    } else {
      from.set(`${drag.home.status}:${drag.home.index}`, drag.extent);
    }
    const predicted = next ?? drag.home;
    arrangement.current = { from, to: new Map([[`${predicted.status}:${predicted.index}`, drag.extent]]) };
    progress.jump(0);
    dropRef.current = next;
    setDrop(next);
    if (reduce) { progress.jump(1); ring.jump(next ? 1 : 0); }
    else {
      void animate(progress, 1, { duration: 0.24, ease: EASE_SLOT });
      void animate(ring, next ? 1 : 0, { duration: 0.12, ease: EASE_OUT });
    }
  }, [progress, reduce, ring]);

  const step = useCallback(() => {
    const drag = session.current;
    if (!drag?.active || drag.landing) return;
    const scroller = scrollerRef.current;
    const target = slotAt(drag.pointer.x, drag.pointer.y);
    if (scroller && target) {
      const offset = scrollOffset();
      const own = drag.scrolls.find((scroll) => scroll.el === scroller);
      const shift = view === "list" ? offset.y - (scroller.scrollTop - (own?.y ?? 0)) : offset.x - (scroller.scrollLeft - (own?.x ?? 0));
      const leading = (view === "list" ? drag.viewport.top : drag.viewport.left) - shift;
      const trailing = (view === "list" ? drag.viewport.bottom : drag.viewport.right) - shift;
      const pointer = view === "list" ? drag.pointer.y : drag.pointer.x;
      const edge = Math.max(drag.unit, Math.min(90 * drag.unit, (trailing - leading) / 2));
      const depth = pointer < leading + edge ? -Math.min(1, (leading + edge - pointer) / edge)
        : pointer > trailing - edge ? Math.min(1, (pointer - trailing + edge) / edge) : 0;
      scroller[view === "list" ? "scrollTop" : "scrollLeft"] += depth * 22 * drag.unit;
    }
    const offset = scrollOffset();
    const left = drag.rect.left + drag.pointer.x - drag.start.x;
    const top = drag.rect.top + drag.pointer.y - drag.start.y;
    const own = drag.scrolls.find((scroll) => scroll.el === scroller);
    scrollX.set((scroller?.scrollLeft ?? 0) - (own?.x ?? 0));
    scrollY.set((scroller?.scrollTop ?? 0) - (own?.y ?? 0));
    screenPosition.set(view === "list" ? top : left);
    x.set(left - drag.board.left + offset.x);
    y.set(top - drag.board.top + offset.y);
    setDropIfChanged(slotAt(drag.pointer.x, drag.pointer.y));
    rafRef.current = requestAnimationFrame(step);
  }, [scrollOffset, scrollX, scrollY, screenPosition, setDropIfChanged, slotAt, view, x, y]);

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    x.stop(); y.stop(); scale.stop(); gain.stop(); ring.stop(); progress.stop();
    const drag = session.current;
    session.current = null;
    if (drag && rootRef.current?.hasPointerCapture(drag.pointerId)) rootRef.current.releasePointerCapture(drag.pointerId);
    heights.current.clear();
    for (const el of slots.current.values()) el.style.height = "0px";
    dropRef.current = null;
    setDrop(null);
    setLifted(null);
    onDragActiveChange?.(false);
  }, [gain, onDragActiveChange, progress, ring, scale, x, y]);

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary || session.current) return;
    const element = event.target as HTMLElement;
    if (element.closest("button, select, input, a")) return;
    const row = element.closest<HTMLElement>("[data-card-id]");
    const board = boardRef.current;
    const viewport = scrollerRef.current;
    if (!row || !board || !viewport) return;
    const contact = CRM_COLUMNS.flatMap((status) => grouped[status]).find((c) => c.id === row.dataset.cardId);
    if (!contact) return;
    const scrolls: { el: HTMLElement; x: number; y: number }[] = [];
    let ancestor = board.parentElement;
    while (ancestor && ancestor !== document.scrollingElement) {
      scrolls.push({ el: ancestor, x: ancestor.scrollLeft, y: ancestor.scrollTop });
      ancestor = ancestor.parentElement;
    }
    const rect = row.getBoundingClientRect();
    const unit = (rootRef.current?.clientWidth ?? 1448) / 1448;
    session.current = {
      contact, rect, root: rootRef.current!.getBoundingClientRect(), board: board.getBoundingClientRect(), viewport: viewport.getBoundingClientRect(),
      home: { status: contact.status, index: grouped[contact.status].findIndex((c) => c.id === contact.id) },
      start: { x: event.clientX, y: event.clientY }, pointer: { x: event.clientX, y: event.clientY },
      pointerId: event.pointerId, scrolls, windowX: window.scrollX, windowY: window.scrollY, unit,
      extent: rect.height + parseFloat(getComputedStyle(row).marginBottom || "0"), active: false, landing: false,
      focused: row.contains(document.activeElement),
      groups: CRM_COLUMNS.flatMap((status) => {
        const zone = zones.current.get(status);
        return zone ? [{ status, rect: zone.getBoundingClientRect(), rows: Array.from(zone.querySelectorAll<HTMLElement>("[data-card-id]"))
          .map((el) => ({ id: el.dataset.cardId!, rect: el.getBoundingClientRect() })) }] : [];
      }),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    onDragActiveChange?.(true);
  };

  const handleDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = session.current;
    if (!drag || drag.landing || event.pointerId !== drag.pointerId) return;
    drag.pointer = { x: event.clientX, y: event.clientY };
    if (drag.active || Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) < 4 * drag.unit) return;
    drag.active = true;
    drag.focused ||= document.activeElement?.closest<HTMLElement>("[data-card-id]")?.dataset.cardId === drag.contact.id;
    screenPosition.jump(view === "list" ? drag.rect.top : drag.rect.left);
    x.jump(drag.rect.left - drag.board.left);
    y.jump(drag.rect.top - drag.board.top);
    scrollX.jump(0); scrollY.jump(0);
    scale.jump(1); gain.jump(reduce ? 0 : 1); ring.jump(1);
    const homeKey = `${drag.home.status}:${drag.home.index}`;
    heights.current = new Map([[homeKey, drag.extent]]);
    arrangement.current = { from: new Map(heights.current), to: new Map(heights.current) };
    progress.jump(1);
    dropRef.current = drag.home;
    setDrop(drag.home);
    setLifted({ contact: drag.contact, width: drag.rect.width, height: drag.rect.height, left: drag.board.left - drag.root.left, top: drag.board.top - drag.root.top });
    if (!reduce) void animate(scale, 1.04, { duration: 0.18, ease: EASE_OUT });
    rafRef.current = requestAnimationFrame(step);
  };

  const handleDragEnd = useCallback(async (cancelled = false) => {
    const drag = session.current;
    if (!drag || drag.landing) return;
    if (!drag.active) {
      reset();
      if (!cancelled) onEdit(drag.contact);
      return;
    }
    drag.landing = true;
    cancelAnimationFrame(rafRef.current);
    droppedAt.current = Date.now();
    const target = (cancelled ? null : slotAt(drag.pointer.x, drag.pointer.y)) ?? drag.home;
    flushSync(() => setDropIfChanged(target));
    const list = zones.current.get(target.status)?.querySelector<HTMLElement>("[data-stage-list]");
    const hole = Array.from(list?.querySelectorAll<HTMLElement>("[data-slot-key]") ?? [])
      .find((el) => el.dataset.slotKey === `${target.status}:${target.index}`);
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
      void animate(progress, 1, { duration: duration * 0.85, ease: EASE_SLOT });
      void animate(gain, 0, { duration: duration * 0.55, ease: EASE_OUT });
      void animate(scale, 1, { duration: duration * 0.85, ease: EASE_LAND });
      void animate(ring, 0, { duration: duration * 0.85, ease: EASE_OUT });
      await Promise.all([
        animate(x, left, { type: "tween", duration, ease: EASE_LAND }),
        animate(y, top, { type: "tween", duration, ease: EASE_LAND }),
      ]);
    }
    if (session.current !== drag) return;
    flushSync(() => {
      if (target.status !== drag.home.status || target.index !== drag.home.index) onMove(drag.contact.id, target.status, target.index);
      reset();
      droppedAt.current = Date.now();
      setAnnouncement(`${drag.contact.name}: ${t(`contactStatus.${target.status}`)}`);
    });
    if (drag.focused) {
      Array.from(boardRef.current?.querySelectorAll<HTMLElement>("[data-card-id]") ?? [])
        .find((el) => el.dataset.cardId === drag.contact.id)?.focus({ preventScroll: true });
    }
  }, [gain, onEdit, onMove, progress, reduce, reset, ring, scale, scrollOffset, setDropIfChanged, slotAt, t, x, y]);

  useEffect(() => {
    const cancel = () => { void handleDragEnd(true); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && session.current) { event.preventDefault(); cancel(); } };
    window.addEventListener("keydown", key);
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", reset);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", reset);
    };
  }, [handleDragEnd, reset]);

  useEffect(() => () => reset(), [reset, view]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let width = root.getBoundingClientRect().width;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || Math.abs(entry.contentRect.width - width) < 0.5) return;
      width = entry.contentRect.width;
      reset();
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [reset]);

  return (
    <div
      ref={rootRef}
      style={{ containerType: "inline-size" }}
      onPointerDown={handleDragStart}
      onPointerMove={handleDrag}
      onPointerUp={(event) => {
        const drag = session.current;
        if (!drag || event.pointerId !== drag.pointerId) return;
        drag.pointer = { x: event.clientX, y: event.clientY };
        void handleDragEnd();
      }}
      onPointerCancel={(event) => { if (event.pointerId === session.current?.pointerId) void handleDragEnd(true); }}
      onLostPointerCapture={() => { if (session.current && !session.current.landing) void handleDragEnd(true); }}
      onClickCapture={(event) => {
        if (session.current?.active || Date.now() - droppedAt.current < DROP_CLICK_GRACE_MS) {
          event.preventDefault(); event.stopPropagation();
        }
      }}
      onKeyDown={(event) => {
        if (session.current || !event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
        const element = event.target as HTMLElement;
        if (element.closest("button, select, input, a")) return;
        const id = element.closest<HTMLElement>("[data-card-id]")?.dataset.cardId;
        if (!id) return;
        for (const status of CRM_COLUMNS) {
          const index = grouped[status].findIndex((contact) => contact.id === id);
          if (index < 0) continue;
          event.preventDefault();
          const next = Math.max(0, Math.min(grouped[status].length - 1, index + (event.key === "ArrowUp" ? -1 : 1)));
          if (next !== index) onMove(id, status, next);
          break;
        }
      }}
      className="relative w-full min-w-0"
    >
      <p className="sr-only" role="status">{announcement}</p>
      {/* The kanban board needs horizontal scroll on small screens so columns
          don't collapse to unusable widths. In list mode no overflow is needed —
          sharing the wrapper would capture scroll events even when there's
          nothing to scroll horizontally. */}
      <div ref={scrollerRef}
        className={view === "kanban" ? "x-fade overscroll-x-contain overflow-x-auto overflow-y-clip scrollbar-hide" : "overscroll-contain w-full"}
        style={{ padding: q(8) }}
        onScroll={(event) => {
          const scroller = event.currentTarget;
          const max = scroller.scrollWidth - scroller.clientWidth;
          scroller.style.setProperty("--x-fade-start", scroller.scrollLeft > 4 ? "40px" : "0px");
          scroller.style.setProperty("--x-fade-end", scroller.scrollLeft < max - 4 ? "40px" : "0px");
          const own = session.current?.scrolls.find((scroll) => scroll.el === event.currentTarget);
          if (own) { scrollX.set(event.currentTarget.scrollLeft - own.x); scrollY.set(event.currentTarget.scrollTop - own.y); }
        }}
      >
        <div
          ref={boardRef}
          className={view === "kanban" ? "relative flex min-w-max items-start select-none" : "relative grid w-full items-start select-none"}
          style={{ gap: q(view === "list" ? 10 : 12), gridTemplateColumns: view === "list" ? "minmax(0, 1fr)" : undefined }}
        >
          {CRM_COLUMNS.map((status) => {
            const theme = STATUS_THEME[status];
            const cards = grouped[status].filter((contact) => contact.id !== lifted?.contact.id);
            const count = cards.length + (lifted && drop?.status === status ? 1 : 0);
            return (
              <section key={status} ref={(el) => { if (el) zones.current.set(status, el); else zones.current.delete(status); }}
                className={cn("kpi-card min-w-0 border border-border bg-card", view === "list" && "@container")}
                style={{
                  borderRadius: q(18),
                  padding: q(8),
                  boxShadow: "var(--shadow-soft)",
                  width: view === "list" ? undefined : q(300),
                  flex: view === "list" ? undefined : "0 0 auto",
                  // Override height:100% from .kpi-card in list mode — sections stack vertically
                  height: view === "list" ? "auto" : undefined,
                }}>
                <header className="kpi-header flex items-center" style={{ minHeight: q(44), height: q(44), gap: q(8), paddingInline: q(8), paddingBlock: 0 }}>
                  <HugeiconsIcon icon={theme.icon} size={q(14)} strokeWidth={1.75} style={{ color: theme.tone, flexShrink: 0 }} />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-medium text-foreground" style={{ fontSize: q(13), lineHeight: q(17), fontFamily: "inherit" }}>{t(`contactStatus.${status}`)}</h2>
                    <div className="mt-1 flex h-[3px] gap-[2px]" aria-hidden="true">
                      {Array.from({ length: 8 }, (_, index) => <span key={index} className="flex-1 rounded-full" style={{ background: index < Math.min(count, 8) ? theme.tone : "var(--muted)" }} />)}
                    </div>
                  </div>
                  <span className="relative ml-auto overflow-hidden text-right font-medium text-foreground tabular-nums" style={{ minWidth: q(24), height: q(20), fontSize: q(14), lineHeight: q(20) }}>
                    <AnimatePresence initial={false} mode="popLayout">
                      <motion.span key={count} className="block" initial={{ y: reduce ? 0 : q(-8), opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: reduce ? 0 : q(8), opacity: 0 }} transition={{ duration: reduce ? 0 : 0.2, ease: EASE_OUT }}>{count}</motion.span>
                    </AnimatePresence>
                  </span>
                </header>
                <div data-stage-list className={cn("relative min-w-0", view === "list" && "overflow-hidden")}
                  style={{ minHeight: q(88), padding: q(8), marginTop: q(2) }}>
                  {count === 0 ? <p className="flex min-h-16 items-center justify-center text-center text-muted-foreground" style={{ fontSize: q(12), lineHeight: q(16) }}>{t("crm.columnEmpty")}</p> : null}
                  {Array.from({ length: cards.length + 1 }, (_, index) => {
                    const key = `${status}:${index}`;
                    const contact = cards[index];
                    return (
                      <div key={contact?.id ?? "end"} className="flow-root">
                        <div data-slot-key={key} aria-hidden className="relative overflow-hidden" ref={(el) => {
                          if (el) { slots.current.set(key, el); el.style.height = `${heights.current.get(key) ?? 0}px`; }
                          else slots.current.delete(key);
                        }}>
                          {lifted && drop?.status === status && drop.index === index ? <div className="absolute inset-x-0 top-0 border border-dashed" style={{ height: lifted.height, borderRadius: q(20), background: `color-mix(in oklch, ${theme.tone} 8%, var(--card))`, borderColor: `color-mix(in oklch, ${theme.tone} 45%, var(--border))` }} /> : null}
                        </div>
                        {contact ? <ContactCard contact={contact} view={view} moving={!!lifted} onEdit={onEdit} onDelete={onDelete} onMove={onMove} /> : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {lifted ? <motion.div aria-hidden inert className="pointer-events-none absolute z-50 shadow-[var(--shadow-float)]" style={{ left: lifted.left, top: lifted.top, x: overlayX, y: overlayY, rotate: reduce ? 0 : rotate, scale, width: lifted.width, height: lifted.height, borderRadius: q(20) }}>
        <ContactCard contact={lifted.contact} view={view} overlay moving onEdit={onEdit} onDelete={onDelete} onMove={onMove} />
        <motion.div className="absolute inset-0" style={{ opacity: ring, borderRadius: q(20), boxShadow: `0 0 0 ${q(1.5)} ${STATUS_THEME[drop?.status ?? lifted.contact.status].tone}` }} />
      </motion.div> : null}
    </div>
  );
}

const ContactCard = memo(function ContactCard({
  contact,
  view,
  moving,
  overlay = false,
  onEdit,
  onDelete,
  onMove,
}: {
  readonly contact: Contact;
  readonly view: "kanban" | "list";
  readonly moving: boolean;
  readonly overlay?: boolean;
  readonly onEdit: (contact: Contact) => void;
  readonly onDelete: (id: string) => void;
  readonly onMove: (id: string, status: ContactStatus, index?: number) => void;
}) {
  const { locale, t } = useI18n();
  const reduce = useReducedMotion();
  const list = view === "list";
  const note = contact.notes || contact.lastMessage || "";
  const detail = contact.phone || contact.email || "—";

  return (
    <motion.article
      data-card-id={overlay ? undefined : contact.id}
      layout={!moving && !overlay && !reduce ? "position" : false}
      initial={false}
      transition={{ duration: reduce ? 0 : 0.24, ease: EASE_SLOT }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || moving) return;
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onEdit(contact); }
      }}
      role={overlay ? undefined : "group"}
      tabIndex={overlay ? -1 : 0}
      aria-label={contact.name}
      aria-keyshortcuts={overlay ? undefined : "Alt+ArrowUp Alt+ArrowDown"}
      className={cn(
        "group relative min-w-0 touch-none select-none text-left text-card-foreground",
        "focus-visible:outline-solid focus-visible:outline-[color:var(--ring)]",
        !overlay && "cursor-grab",
      )}
      style={{
        outlineWidth: q(2),
        outlineOffset: q(-2),
        borderRadius: list ? q(16) : q(20),
        marginBottom: overlay ? 0 : q(8),
      }}
    >
      {list ? (
        <>
          {/* List mode: outer border + inner content/actions layout matching kanban double-border style */}
          <div
            className="min-w-0 border border-border/70 bg-muted/40 @container"
            style={{ borderRadius: q(16), padding: q(5), boxShadow: "var(--shadow-soft)" }}
          >
            <div
              className="min-w-0 border border-border/50 bg-card"
              style={{
                borderRadius: q(12),
                paddingInline: q(14),
                paddingBlock: q(8),
                display: "grid",
                gridTemplateColumns: `minmax(0, 1.6fr) minmax(0, 1.4fr) minmax(0, 2fr) auto auto`,
                gridTemplateRows: "minmax(0, 1fr)",
                columnGap: q(10),
                alignItems: "center",
              }}
            >
              <span title={contact.name} className="min-w-0 truncate font-medium text-foreground" style={{ fontSize: q(13), lineHeight: q(17), gridColumn: 1 }}>
                {contact.name}
              </span>
              <span title={detail} className="flex min-w-0 items-center text-muted-foreground tabular-nums" style={{ gap: q(6), fontSize: q(12), lineHeight: q(17), gridColumn: 2 }}>
                <HugeiconsIcon icon={contact.phone ? Call02Icon : BubbleChatIcon} size={q(11)} strokeWidth={1.5} className="shrink-0 opacity-60" />
                <span className="min-w-0 truncate">{detail}</span>
              </span>
              <span title={note} className="min-w-0 truncate text-muted-foreground/70" style={{ fontSize: q(12), lineHeight: q(17), gridColumn: 3 }}>
                {note || "\u00a0"}
              </span>
              <span title={relativeTime(contact.lastMessageAt, locale)} className="shrink-0 text-right text-muted-foreground tabular-nums" style={{ fontSize: q(10), lineHeight: q(17), gridColumn: 4 }}>
                {relativeTime(contact.lastMessageAt, locale)}
              </span>
              <div
                data-card-actions
                inert={overlay || moving}
                className="flex shrink-0 items-center"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                style={{ gridColumn: 5, gap: q(4) }}
              >
                <Select disabled={overlay || moving} value={contact.status} onValueChange={(status) => onMove(contact.id, status as ContactStatus)}>
                  <SelectTrigger size="sm" aria-label={locale === "es" ? `Cambiar etapa de ${contact.name}` : `Change stage for ${contact.name}`} onPointerDown={(event) => event.stopPropagation()} className="min-w-0 rounded-lg border-transparent bg-transparent shadow-none hover:bg-accent/60" style={{ height: q(28), fontSize: q(11), paddingInline: q(6) }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {CRM_COLUMNS.map((status) => (
                      <SelectItem key={status} value={status}>{t(`contactStatus.${status}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="ghost" size="icon-xs" disabled={overlay || moving} aria-label={locale === "es" ? `Abrir ${contact.name}` : `Open ${contact.name}`} onClick={() => onEdit(contact)} onPointerDown={(event) => event.stopPropagation()} className="text-muted-foreground hover:bg-accent/70 hover:text-foreground" style={{ width: q(28), height: q(28) }}>
                  <HugeiconsIcon icon={ArrowRight01Icon} size={q(13)} strokeWidth={1.75} />
                </Button>
                <Button type="button" variant="ghost" size="icon-xs" disabled={overlay || moving} aria-label={t("crm.delete")} onClick={() => onDelete(contact.id)} onPointerDown={(event) => event.stopPropagation()} className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive" style={{ width: q(28), height: q(28) }}>
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
            style={{
              borderRadius: q(20),
              padding: q(6),
              boxShadow: "var(--shadow-float)",
            }}
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
              {/* Name */}
              <span
                title={contact.name}
                className="min-w-0 truncate font-medium text-foreground"
                style={{ fontSize: q(13), lineHeight: q(18), gridColumn: 1, gridRow: 1 }}
              >
                {contact.name}
              </span>
              {/* Time — top right */}
              <span
                title={relativeTime(contact.lastMessageAt, locale)}
                className="shrink-0 text-right text-muted-foreground tabular-nums"
                style={{ fontSize: q(10), lineHeight: q(18), gridColumn: 2, gridRow: 1 }}
              >
                {relativeTime(contact.lastMessageAt, locale)}
              </span>
              {/* Phone/email */}
              <span
                title={detail}
                className="col-span-2 flex min-w-0 items-center text-muted-foreground"
                style={{ gap: q(5), fontSize: q(11.5), lineHeight: q(16), gridColumn: "1 / -1", gridRow: 2 }}
              >
                <HugeiconsIcon icon={contact.phone ? Call02Icon : BubbleChatIcon} size={q(11)} strokeWidth={1.5} className="shrink-0 opacity-60" />
                <span className="min-w-0 truncate">{detail}</span>
              </span>
              {/* Note / last message */}
              {(contact.notes || contact.lastMessage) ? (
                <span
                  title={note}
                  className="col-span-2 min-w-0 truncate text-muted-foreground/60"
                  style={{ fontSize: q(11), lineHeight: q(15), gridColumn: "1 / -1", gridRow: 3 }}
                >
                  {note}
                </span>
              ) : null}
            </div>
            {/* Actions — below inner border, flush with outer card, no separator */}
            <div
              data-card-actions
              inert={overlay || moving}
              className="flex min-w-0 items-center"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              style={{ gap: q(4), paddingInline: q(6), paddingTop: q(6), paddingBottom: q(2) }}
            >
              <Select disabled={overlay || moving} value={contact.status} onValueChange={(status) => onMove(contact.id, status as ContactStatus)}>
                <SelectTrigger
                  size="sm"
                  aria-label={locale === "es" ? `Cambiar etapa de ${contact.name}` : `Change stage for ${contact.name}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="min-w-0 flex-1 rounded-lg border-transparent bg-transparent shadow-none hover:bg-accent/60"
                  style={{ height: q(28), fontSize: q(11), paddingInline: q(6) }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {CRM_COLUMNS.map((status) => (
                    <SelectItem key={status} value={status}>{t(`contactStatus.${status}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button" variant="ghost" size="icon-xs"
                disabled={overlay || moving}
                aria-label={locale === "es" ? `Abrir ${contact.name}` : `Open ${contact.name}`}
                onClick={() => onEdit(contact)}
                onPointerDown={(event) => event.stopPropagation()}
                className="shrink-0 text-muted-foreground hover:bg-accent/70 hover:text-foreground"
                style={{ width: q(28), height: q(28) }}
              >
                <HugeiconsIcon icon={ArrowRight01Icon} size={q(13)} strokeWidth={1.75} />
              </Button>
              <Button
                type="button" variant="ghost" size="icon-xs"
                disabled={overlay || moving}
                aria-label={t("crm.delete")}
                onClick={() => onDelete(contact.id)}
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
