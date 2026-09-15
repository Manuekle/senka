"use client";

import { useMemo } from "react";
import type { UpcomingEvent } from "@/lib/calendar";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import styles from "./calendar.module.css";
import {
  buildMonthGrid,
  dayKey,
  eventBounds,
  eventColorStyle,
  eventsOnDay,
  timeLabel,
  weekdayLabels,
  type Locale,
} from "./calendar-utils";

/** Lines a month cell has room for, "N más" included. */
const MAX_LINES = 3;

/**
 * One event as a line in a month cell or the all-day row: a filled pill when
 * it takes the whole day, a coloured dot beside the title when it has a time.
 */
export function EventChip({
  event,
  locale,
  onOpen,
}: {
  readonly event: UpcomingEvent;
  readonly locale: Locale;
  readonly onOpen: (event: UpcomingEvent) => void;
}) {
  const t = useT();
  const title = event.summary || t("calendar.untitled");
  return (
    <button
      type="button"
      data-event
      onClick={(e) => {
        e.stopPropagation();
        onOpen(event);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      title={title}
      style={eventColorStyle(event.colorId)}
      className={cn(
        styles.event,
        "flex w-full min-w-0 items-center gap-1.5 rounded-[5px] px-1.5 text-left text-[11px] leading-5 transition-colors duration-150",
        event.allDay
          ? "bg-[var(--ev-fill)] font-medium text-[color:var(--ev-ink)] hover:bg-[var(--ev-fill-hover)]"
          : "text-foreground hover:bg-accent",
      )}
    >
      {event.allDay ? null : <span className="size-1.5 shrink-0 rounded-full bg-[var(--ev-solid)]" />}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {event.allDay ? null : (
        <span className="hidden shrink-0 text-muted-foreground tabular-nums xl:inline">
          {timeLabel(eventBounds(event).start, locale)}
        </span>
      )}
    </button>
  );
}

/**
 * The month grid.
 *
 * On a desktop each cell lists its day the way a wall calendar would, and a
 * double-click on empty space starts an all-day event there. `compact` is the
 * phone's version: numbers and dots only, with the selected day's events
 * listed under the grid by the page.
 */
export function MonthView({
  anchor,
  weekStart,
  locale,
  events,
  todayKey,
  compact = false,
  onSelectDay,
  onCreateOnDay,
  onOpenEvent,
  onShowDay,
}: {
  readonly anchor: Date;
  readonly weekStart: number;
  readonly locale: Locale;
  readonly events: readonly UpcomingEvent[];
  readonly todayKey: string;
  readonly compact?: boolean;
  readonly onSelectDay: (date: Date) => void;
  readonly onCreateOnDay: (date: Date) => void;
  readonly onOpenEvent: (event: UpcomingEvent) => void;
  readonly onShowDay: (date: Date) => void;
}) {
  const t = useT();
  const days = useMemo(() => buildMonthGrid(anchor, weekStart), [anchor, weekStart]);
  const labels = useMemo(
    () => weekdayLabels(weekStart, locale, compact ? "narrow" : "short"),
    [weekStart, locale, compact],
  );
  const selectedKey = dayKey(anchor);
  const month = anchor.getMonth();

  return (
    <div className={cn("flex min-h-0 flex-col", !compact && "h-full")}>
      <div className="grid shrink-0 grid-cols-7 border-b border-border/60">
        {labels.map((label, i) => (
          <div
            key={i}
            className={cn(
              "px-2 py-1.5 text-[11px] font-medium text-muted-foreground capitalize",
              compact ? "text-center" : "text-right",
            )}
          >
            {label.replace(".", "")}
          </div>
        ))}
      </div>

      <div
        className={cn(
          "grid grid-cols-7",
          compact
            ? "auto-rows-[3.25rem]"
            : "min-h-0 flex-1 grid-rows-[repeat(6,minmax(6.5rem,1fr))] overflow-y-auto",
        )}
      >
        {days.map((date, index) => {
          const key = dayKey(date);
          const inMonth = date.getMonth() === month;
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          const dayEvents = eventsOnDay(events, date);
          const fullLabel = date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });

          if (compact) {
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectDay(date)}
                onDoubleClick={() => onCreateOnDay(date)}
                aria-pressed={isSelected}
                aria-label={fullLabel}
                className="flex flex-col items-center gap-1 border-b border-border/40 pt-1.5"
              >
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-sm tabular-nums transition-colors duration-150",
                    inMonth ? "text-foreground" : "text-muted-foreground/50",
                    isSelected
                      ? isToday
                        ? "bg-[var(--cal-accent)] font-semibold text-white"
                        : "bg-foreground font-semibold text-background"
                      : isToday && "font-semibold text-[color:var(--cal-accent)]",
                  )}
                >
                  {date.getDate()}
                </span>
                <span className="flex h-1.5 items-center gap-0.5">
                  {dayEvents.slice(0, 3).map((event) => (
                    <span
                      key={event.id}
                      style={eventColorStyle(event.colorId)}
                      className={cn(styles.event, "size-1.5 rounded-full bg-[var(--ev-solid)]")}
                    />
                  ))}
                </span>
              </button>
            );
          }

          const overflow = dayEvents.length > MAX_LINES;
          const visible = overflow ? dayEvents.slice(0, MAX_LINES - 1) : dayEvents;

          return (
            <div
              key={key}
              onClick={() => onSelectDay(date)}
              onDoubleClick={() => onCreateOnDay(date)}
              className={cn(
                "flex min-h-0 min-w-0 flex-col gap-0.5 overflow-hidden border-b border-border/60 p-1 transition-colors duration-150",
                index % 7 !== 6 && "border-r",
                !inMonth && "bg-muted/25",
                isSelected && "bg-accent/40",
              )}
            >
              <div className="flex items-center justify-end gap-1">
                {date.getDate() === 1 ? (
                  <span className="truncate text-[11px] font-medium text-muted-foreground capitalize">
                    {date.toLocaleDateString(locale, { month: "short" }).replace(".", "")}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectDay(date);
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                  aria-pressed={isSelected}
                  aria-label={fullLabel}
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums transition-colors duration-150",
                    inMonth ? "text-foreground" : "text-muted-foreground",
                    isToday
                      ? "bg-[var(--cal-accent)] font-semibold text-white"
                      : isSelected
                        ? "bg-foreground font-semibold text-background"
                        : "hover:bg-accent",
                  )}
                >
                  {date.getDate()}
                </button>
              </div>
              <div className="flex min-h-0 flex-col gap-px">
                {visible.map((event) => (
                  <EventChip key={event.id} event={event} locale={locale} onOpen={onOpenEvent} />
                ))}
                {overflow ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowDay(date);
                    }}
                    onDoubleClick={(e) => e.stopPropagation()}
                    className="rounded-[5px] px-1.5 text-left text-[11px] leading-5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {t("calendar.more", { count: dayEvents.length - visible.length })}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
