"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { UpcomingEvent } from "@/lib/calendar";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import styles from "./calendar.module.css";
import { EventChip } from "./month-view";
import {
  HOUR_HEIGHT,
  SNAP_MINUTES,
  addDays,
  atMinutes,
  dayKey,
  eventBounds,
  eventColorStyle,
  eventsOnDay,
  hourLabel,
  layoutDay,
  minutesIntoDay,
  startOfDay,
  timeLabel,
  type EditorDraft,
  type Locale,
} from "./calendar-utils";

const DAY_MINUTES = 24 * 60;
/** All-day events a column shows before folding the rest into "N más". */
const ALL_DAY_LINES = 2;
/** How far a finger can travel and still be a tap rather than a scroll. */
const TAP_SLOP_PX = 8;

type Drag = {
  day: number;
  anchor: number;
  from: number;
  to: number;
  moved: boolean;
  pointerType: string;
  x: number;
  y: number;
};

/**
 * The day and week views: a column of hours per day.
 *
 * Making an event is direct manipulation, as in Apple's Calendar — drag down
 * a column to draw one, double-click for an hour, or tap on a touch screen
 * (where a drag has to stay a scroll). Whatever the gesture, it ends in the
 * editor, so nothing reaches Google until the person presses save.
 */
export function TimeGrid({
  days,
  locale,
  events,
  now,
  onCreate,
  onOpenEvent,
  onShowDay,
}: {
  readonly days: readonly Date[];
  readonly locale: Locale;
  readonly events: readonly UpcomingEvent[];
  readonly now: Date;
  readonly onCreate: (draft: EditorDraft) => void;
  readonly onOpenEvent: (event: UpcomingEvent) => void;
  readonly onShowDay: (day: Date) => void;
}) {
  const t = useT();
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [ghost, setGhost] = useState<{ day: number; from: number; to: number } | null>(null);

  const todayKey = dayKey(now);
  const showsToday = days.some((day) => dayKey(day) === todayKey);
  const nowTop = (minutesIntoDay(now) / 60) * HOUR_HEIGHT;
  const columns = `repeat(${days.length}, minmax(0, 1fr))`;

  // Open on the working day — or just above "now" when today is on screen —
  // rather than on midnight, which is the least useful hour to land on.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const hour = showsToday ? Math.max(0, now.getHours() - 1.5) : 7.5;
    scroller.scrollTop = hour * HOUR_HEIGHT;
    // Only on mount: paging between weeks keeps wherever the person scrolled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locate = (clientX: number, clientY: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const day = Math.min(
      days.length - 1,
      Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * days.length)),
    );
    const raw = ((clientY - rect.top) / HOUR_HEIGHT) * 60;
    const minutes = Math.min(
      DAY_MINUTES - SNAP_MINUTES,
      Math.max(0, Math.floor(raw / SNAP_MINUTES) * SNAP_MINUTES),
    );
    return { day, minutes };
  };

  const createAt = (dayIndex: number, from: number, to: number) => {
    const day = days[dayIndex];
    if (!day) return;
    onCreate({ start: atMinutes(day, from), end: atMinutes(day, Math.min(to, DAY_MINUTES)), allDay: false });
  };

  const isOnEvent = (target: EventTarget) =>
    target instanceof Element && target.closest("[data-event]") !== null;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isOnEvent(event.target)) return;
    const { day, minutes } = locate(event.clientX, event.clientY, event.currentTarget);
    drag.current = {
      day,
      anchor: minutes,
      from: minutes,
      to: minutes + SNAP_MINUTES,
      moved: false,
      pointerType: event.pointerType,
      x: event.clientX,
      y: event.clientY,
    };
    if (event.pointerType === "mouse") {
      event.currentTarget.setPointerCapture(event.pointerId);
      // No text selection trailing the drag.
      event.preventDefault();
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    if (current.pointerType !== "mouse") {
      if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > TAP_SLOP_PX) {
        drag.current = null;
      }
      return;
    }
    const { minutes } = locate(event.clientX, event.clientY, event.currentTarget);
    if (!current.moved && minutes === current.anchor) return;
    current.moved = true;
    current.from = Math.min(current.anchor, minutes);
    current.to = Math.max(current.anchor, minutes) + SNAP_MINUTES;
    setGhost({ day: current.day, from: current.from, to: current.to });
  };

  const onPointerUp = () => {
    const current = drag.current;
    drag.current = null;
    setGhost(null);
    if (!current) return;
    if (current.pointerType === "mouse") {
      if (current.moved) createAt(current.day, current.from, current.to);
      return;
    }
    // A tap: an hour, from the half hour that was tapped.
    const from = Math.floor(current.anchor / 30) * 30;
    createAt(current.day, from, from + 60);
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isOnEvent(event.target)) return;
    const { day, minutes } = locate(event.clientX, event.clientY, event.currentTarget);
    const from = Math.floor(minutes / 30) * 30;
    createAt(day, from, from + 60);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Day headers */}
      <div className="flex shrink-0 overflow-hidden border-b border-border/60 [scrollbar-gutter:stable]">
        <div className="w-14 shrink-0" />
        <div className="grid flex-1" style={{ gridTemplateColumns: columns }}>
          {days.map((day) => {
            const key = dayKey(day);
            const isToday = key === todayKey;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onShowDay(day)}
                disabled={days.length === 1}
                className="flex min-w-0 items-center justify-center gap-1.5 border-l border-border/60 py-2 transition-colors duration-150 enabled:hover:bg-accent/50"
              >
                <span className="truncate text-xs text-muted-foreground capitalize">
                  {day.toLocaleDateString(locale, { weekday: days.length === 1 ? "long" : "short" }).replace(".", "")}
                </span>
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-sm tabular-nums",
                    isToday ? "bg-[var(--cal-accent)] font-semibold text-white" : "text-foreground",
                  )}
                >
                  {day.getDate()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* All-day row */}
      <div className="flex shrink-0 overflow-hidden border-b border-border/60 [scrollbar-gutter:stable]">
        <div className="w-14 shrink-0 py-1.5 pr-2 text-right text-[10px] leading-tight text-muted-foreground">
          {t("calendar.allDayRow")}
        </div>
        <div className="grid flex-1" style={{ gridTemplateColumns: columns }}>
          {days.map((day) => {
            const allDay = eventsOnDay(events, day).filter((event) => event.allDay);
            const visible = allDay.length > ALL_DAY_LINES ? allDay.slice(0, ALL_DAY_LINES - 1) : allDay;
            return (
              <div
                key={dayKey(day)}
                onDoubleClick={() =>
                  onCreate({ start: startOfDay(day), end: addDays(startOfDay(day), 1), allDay: true })
                }
                className="flex min-h-8 min-w-0 flex-col gap-px border-l border-border/60 p-0.5"
              >
                {visible.map((event) => (
                  <EventChip key={event.id} event={event} locale={locale} onOpen={onOpenEvent} />
                ))}
                {allDay.length > visible.length ? (
                  <button
                    type="button"
                    onClick={() => onShowDay(day)}
                    className="rounded-[5px] px-1.5 text-left text-[11px] leading-5 font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    {t("calendar.more", { count: allDay.length - visible.length })}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Hours */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="relative flex" style={{ height: 24 * HOUR_HEIGHT }}>
          <div className="relative w-14 shrink-0 select-none">
            {Array.from({ length: 23 }, (_, i) => i + 1).map((hour) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
                style={{ top: hour * HOUR_HEIGHT }}
              >
                {hourLabel(hour, locale)}
              </span>
            ))}
            {showsToday ? (
              <span
                className="absolute right-1 z-10 -translate-y-1/2 rounded-md bg-background px-1 text-[10px] font-semibold text-[color:var(--cal-accent)] tabular-nums"
                style={{ top: nowTop }}
              >
                {timeLabel(now, locale)}
              </span>
            ) : null}
          </div>

          <div
            className="relative grid flex-1 select-none"
            style={{ gridTemplateColumns: columns }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              drag.current = null;
              setGhost(null);
            }}
            onDoubleClick={onDoubleClick}
          >
            {/* Hour and half-hour rules, under everything */}
            <div aria-hidden className="pointer-events-none absolute inset-0">
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={hour} className="absolute inset-x-0" style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}>
                  {hour > 0 ? <div className="h-px bg-border/70" /> : null}
                  <div className="absolute inset-x-0 top-1/2 h-px bg-border/25" />
                </div>
              ))}
            </div>

            {days.map((day, index) => {
              const key = dayKey(day);
              return (
                <div key={key} className="relative border-l border-border/60">
                  {layoutDay(events, day).map(({ event, top, height, column, columns: lanes, clippedStart, clippedEnd }) => {
                    const title = event.summary || t("calendar.untitled");
                    const { start, end } = eventBounds(event);
                    return (
                      <button
                        key={event.id}
                        type="button"
                        data-event
                        onClick={() => onOpenEvent(event)}
                        title={`${title} · ${timeLabel(start, locale)} – ${timeLabel(end, locale)}`}
                        style={{
                          ...eventColorStyle(event.colorId),
                          // Inline: a class-level border colour loses to the
                          // app's unlayered border reset.
                          borderLeftColor: "var(--ev-solid)",
                          top: top + 1,
                          height: height - 2,
                          left: `calc(${(column / lanes) * 100}% + 2px)`,
                          width: `calc(${100 / lanes}% - 4px)`,
                        }}
                        className={cn(
                          styles.event,
                          // `bg-background` is the opaque base the tint in
                          // `styles.block` is laid over.
                          styles.block,
                          "absolute z-[1] flex flex-col overflow-hidden border-l-[3px] bg-background px-1.5 py-0.5 text-left text-[11px] leading-tight text-[color:var(--ev-ink)] hover:z-[2]",
                          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--ring)]",
                          clippedStart ? "rounded-t-none" : "rounded-t-md",
                          clippedEnd ? "rounded-b-none" : "rounded-b-md",
                        )}
                      >
                        <span className="truncate font-semibold">{title}</span>
                        {height >= 34 ? (
                          <span className="truncate text-[color:var(--ev-ink-soft)] tabular-nums">
                            {timeLabel(start, locale)}
                            {event.location ? ` · ${event.location}` : ""}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}

                  {ghost && ghost.day === index ? (
                    <div
                      aria-hidden
                      className={cn(
                        styles.event,
                        "pointer-events-none absolute inset-x-0.5 z-[3] flex flex-col rounded-md border-l-[3px] bg-[var(--ev-fill-hover)] px-1.5 py-0.5 text-[11px] leading-tight font-semibold text-[color:var(--ev-ink)] tabular-nums",
                      )}
                      style={{
                        ...eventColorStyle(),
                        borderLeftColor: "var(--ev-solid)",
                        top: (ghost.from / 60) * HOUR_HEIGHT,
                        height: ((ghost.to - ghost.from) / 60) * HOUR_HEIGHT,
                      }}
                    >
                      {timeLabel(atMinutes(day, ghost.from), locale)} – {timeLabel(atMinutes(day, ghost.to), locale)}
                    </div>
                  ) : null}

                  {key === todayKey ? (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 z-[4] h-0.5 -translate-y-1/2 bg-[var(--cal-accent)]"
                      style={{ top: nowTop }}
                    >
                      <span className="absolute top-1/2 -left-1 size-2 -translate-y-1/2 rounded-full bg-[var(--cal-accent)]" />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
