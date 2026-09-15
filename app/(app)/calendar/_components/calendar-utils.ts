import type { CSSProperties } from "react";
import type { UpcomingEvent } from "@/lib/calendar";

// Date arithmetic and layout for the Calendar page. Everything here works in
// the viewer's local time: a calendar is read on a wall clock, and the one
// place a zone has to be explicit — what goes to Google — is the editor's job.

export type Locale = "es" | "en";
export type CalendarView = "day" | "week" | "month";

/** Spanish weeks read Monday-first; English ones read Sunday-first. */
export const WEEK_START: Record<Locale, number> = { es: 1, en: 0 };

/** Pixels per hour in the day and week grids. */
export const HOUR_HEIGHT = 48;
/** What a drag in the time grid snaps to, in minutes. */
export const SNAP_MINUTES = 15;

const MINUTES_IN_DAY = 24 * 60;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Same day of the month, clamped: Jan 31 plus a month is Feb 28, not Mar 3. */
export function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay));
}

/** Local `YYYY-MM-DD`, not `toISOString().slice(0, 10)` — that one reads back
 *  in UTC and slides a late-evening event onto the wrong day for anyone west
 *  of Greenwich. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDayKey(key: string): Date {
  const [y = 1970, m = 1, d = 1] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Local `HH:MM`, the value an `<input type="time">` takes. */
export function timeKey(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** A date input's value and a time input's value, as one local instant. */
export function combine(date: string, time: string): Date {
  const result = parseDayKey(date);
  const [h = 0, m = 0] = time.split(":").map(Number);
  result.setHours(h, m, 0, 0);
  return result;
}

export function minutesIntoDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function atMinutes(day: Date, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes);
}

export function startOfWeek(date: Date, weekStart: number): Date {
  const day = startOfDay(date);
  return addDays(day, -((day.getDay() - weekStart + 7) % 7));
}

/** The 42 cells of a month grid: full weeks only, so the grid never grows or
 *  shrinks a row as someone pages between months. */
export function buildMonthGrid(anchor: Date, weekStart: number): Date[] {
  const start = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1), weekStart);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** Every day a view draws, in order. */
export function viewDays(view: CalendarView, anchor: Date, weekStart: number): Date[] {
  if (view === "month") return buildMonthGrid(anchor, weekStart);
  if (view === "week") {
    const start = startOfWeek(anchor, weekStart);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }
  return [startOfDay(anchor)];
}

/** One page back or forward, in whatever unit the view pages by. */
export function shiftAnchor(view: CalendarView, anchor: Date, direction: -1 | 1): Date {
  if (view === "month") return addMonths(anchor, direction);
  if (view === "week") return addDays(anchor, 7 * direction);
  return addDays(anchor, direction);
}

export function weekdayLabels(
  weekStart: number,
  locale: Locale,
  style: "short" | "narrow" = "short",
): string[] {
  // 2024-01-07 is a Sunday — a fixed anchor to read weekday names off of, in
  // whatever order this locale's grid wants them.
  const sunday = new Date(2024, 0, 7);
  return Array.from({ length: 7 }, (_, i) =>
    addDays(sunday, (weekStart + i) % 7).toLocaleDateString(locale, { weekday: style }),
  );
}

/** "septiembre de 2026" → "Septiembre de 2026". CSS `capitalize` would give
 *  "Septiembre De 2026": it capitalizes every word, articles included. */
export function capitalizeFirst(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

export function hourLabel(hour: number, locale: Locale): string {
  if (locale === "en") return new Date(2024, 0, 1, hour).toLocaleTimeString("en", { hour: "numeric" });
  return `${hour}:00`;
}

export function timeLabel(date: Date, locale: Locale): string {
  return date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

/** Where an event sits on the local timeline. An all-day event's bare dates
 *  become local midnights, and a zero-length event gets enough length to be
 *  drawn. */
export function eventBounds(event: UpcomingEvent): { start: Date; end: Date } {
  if (event.allDay) {
    const start = parseDayKey(event.start.slice(0, 10));
    const end = parseDayKey(event.end.slice(0, 10));
    return { start, end: end > start ? end : addDays(start, 1) };
  }
  const start = new Date(event.start);
  const end = new Date(event.end);
  return { start, end: end > start ? end : new Date(start.getTime() + 30 * 60_000) };
}

export function occursOn(event: UpcomingEvent, day: Date): boolean {
  const { start, end } = eventBounds(event);
  const dayStart = startOfDay(day);
  return start < addDays(dayStart, 1) && end > dayStart;
}

/** All-day first, then by start, the order every calendar lists a day in. */
export function compareEvents(a: UpcomingEvent, b: UpcomingEvent): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const diff = eventBounds(a).start.getTime() - eventBounds(b).start.getTime();
  return diff !== 0 ? diff : a.summary.localeCompare(b.summary);
}

export function eventsOnDay(events: readonly UpcomingEvent[], day: Date): UpcomingEvent[] {
  return events.filter((event) => occursOn(event, day)).sort(compareEvents);
}

export type PositionedEvent = {
  readonly event: UpcomingEvent;
  readonly top: number;
  readonly height: number;
  /** Which of `columns` side-by-side lanes this event takes. */
  readonly column: number;
  readonly columns: number;
  /** Started the day before / runs into the next: drawn without that corner. */
  readonly clippedStart: boolean;
  readonly clippedEnd: boolean;
};

/**
 * Timed events on one day, placed in pixels.
 *
 * Overlapping events share the width: each cluster of events that overlap one
 * another is split into lanes, and every event takes the first lane free by
 * the time it starts — the same packing Apple's and Google's day views use.
 */
export function layoutDay(events: readonly UpcomingEvent[], day: Date): PositionedEvent[] {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  const segments = events
    .filter((event) => !event.allDay && occursOn(event, dayStart))
    .map((event) => {
      const { start, end } = eventBounds(event);
      const from = start < dayStart ? 0 : minutesIntoDay(start);
      const to = end >= dayEnd ? MINUTES_IN_DAY : Math.max(minutesIntoDay(end), from + SNAP_MINUTES);
      return { event, from, to, clippedStart: start < dayStart, clippedEnd: end > dayEnd };
    })
    .sort((a, b) => a.from - b.from || b.to - a.to);

  const placed: PositionedEvent[] = [];
  let cluster: { segment: (typeof segments)[number]; column: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const columns = Math.max(1, laneEnds.length);
    for (const { segment, column } of cluster) {
      placed.push({
        event: segment.event,
        top: (segment.from / 60) * HOUR_HEIGHT,
        height: Math.max(((segment.to - segment.from) / 60) * HOUR_HEIGHT, 18),
        column,
        columns,
        clippedStart: segment.clippedStart,
        clippedEnd: segment.clippedEnd,
      });
    }
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };

  for (const segment of segments) {
    if (cluster.length > 0 && segment.from >= clusterEnd) flush();
    let column = laneEnds.findIndex((end) => end <= segment.from);
    if (column === -1) {
      column = laneEnds.length;
      laneEnds.push(segment.to);
    } else {
      laneEnds[column] = segment.to;
    }
    cluster.push({ segment, column });
    clusterEnd = Math.max(clusterEnd, segment.to);
  }
  if (cluster.length > 0) flush();

  return placed;
}

export type EventColor = { readonly id: string; readonly hue: number; readonly chroma: number };

/** Google's eleven event colours, redrawn in OKLCH so they sit at one
 *  lightness in both themes. `""` is the calendar's own colour. */
export const EVENT_COLORS: readonly EventColor[] = [
  { id: "", hue: 255, chroma: 0.14 },
  { id: "7", hue: 225, chroma: 0.11 },
  { id: "9", hue: 268, chroma: 0.13 },
  { id: "1", hue: 290, chroma: 0.08 },
  { id: "3", hue: 322, chroma: 0.13 },
  { id: "4", hue: 8, chroma: 0.12 },
  { id: "11", hue: 27, chroma: 0.19 },
  { id: "6", hue: 52, chroma: 0.16 },
  { id: "5", hue: 90, chroma: 0.15 },
  { id: "2", hue: 160, chroma: 0.07 },
  { id: "10", hue: 150, chroma: 0.13 },
  { id: "8", hue: 260, chroma: 0.01 },
];

const DEFAULT_COLOR: EventColor = { id: "", hue: 255, chroma: 0.14 };

export function eventColorStyle(colorId?: string): CSSProperties {
  const { hue, chroma } = EVENT_COLORS.find((color) => color.id === (colorId ?? "")) ?? DEFAULT_COLOR;
  return {
    "--ev-h": hue,
    "--ev-c": chroma,
    "--ev-ci": Number((chroma * 0.8).toFixed(3)),
    "--ev-cd": Number((chroma * 0.45).toFixed(3)),
  } as CSSProperties;
}

/** What the editor opens on. */
export type EditorDraft = {
  /** The event being edited; absent when creating one. */
  readonly event?: UpcomingEvent;
  readonly start: Date;
  /** Exclusive — for an all-day draft, the midnight after its last day. */
  readonly end: Date;
  readonly allDay: boolean;
};

export function draftFromEvent(event: UpcomingEvent): EditorDraft {
  const { start, end } = eventBounds(event);
  return { event, start, end, allDay: event.allDay };
}
