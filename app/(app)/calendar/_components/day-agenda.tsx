"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { Add01Icon, Video01Icon } from "@hugeicons/core-free-icons";
import type { UpcomingEvent } from "@/lib/calendar";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import styles from "./calendar.module.css";
import {
  capitalizeFirst,
  eventBounds,
  eventColorStyle,
  eventsOnDay,
  timeLabel,
  type Locale,
} from "./calendar-utils";

/** One day's events as a list — the sidebar on a desktop, under the month on
 *  a phone. */
export function DayAgenda({
  day,
  events,
  locale,
  onOpenEvent,
  onCreate,
}: {
  readonly day: Date;
  readonly events: readonly UpcomingEvent[];
  readonly locale: Locale;
  readonly onOpenEvent: (event: UpcomingEvent) => void;
  readonly onCreate: () => void;
}) {
  const t = useT();
  const list = eventsOnDay(events, day);

  return (
    <section className="flex flex-col gap-2">
      <header className="flex items-center justify-between gap-2">
        <h2 className="truncate pl-1 text-sm font-semibold">
          {capitalizeFirst(day.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" }))}
        </h2>
        <button
          type="button"
          onClick={onCreate}
          aria-label={t("calendar.newEvent")}
          title={t("calendar.newEvent")}
          className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
        >
          <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.75} />
        </button>
      </header>

      {list.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">{t("calendar.noEventsThatDay")}</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {list.map((event) => {
            const { start, end } = eventBounds(event);
            return (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => onOpenEvent(event)}
                  style={eventColorStyle(event.colorId)}
                  className={cn(
                    styles.event,
                    "flex w-full items-stretch gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-accent",
                  )}
                >
                  <span className="w-1 shrink-0 rounded-full bg-[var(--ev-solid)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">
                      {event.summary || t("calendar.untitled")}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground tabular-nums">
                      {event.allDay
                        ? t("calendar.allDay")
                        : `${timeLabel(start, locale)} – ${timeLabel(end, locale)}`}
                      {event.location ? ` · ${event.location}` : ""}
                    </span>
                  </span>
                  {event.meetLink ? (
                    <HugeiconsIcon
                      icon={Video01Icon}
                      size={14}
                      strokeWidth={1.75}
                      className="mt-0.5 shrink-0 text-muted-foreground"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
