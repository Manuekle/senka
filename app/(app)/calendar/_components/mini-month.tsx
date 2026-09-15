"use client";

import { useMemo, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import {
  addMonths,
  buildMonthGrid,
  capitalizeFirst,
  dayKey,
  weekdayLabels,
  type Locale,
} from "./calendar-utils";

type IconSpec = Parameters<typeof HugeiconsIcon>[0]["icon"];

export function IconNavButton({
  label,
  icon,
  onClick,
  className,
}: {
  readonly label: string;
  readonly icon: IconSpec;
  readonly onClick: () => void;
  readonly className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <HugeiconsIcon icon={icon} size={16} strokeWidth={1.75} />
    </button>
  );
}

/**
 * The sidebar's small month: a date picker for the big view.
 *
 * It pages on its own — looking ahead at November shouldn't drag the week on
 * screen along — and snaps back to the selected date's month whenever that
 * changes from anywhere else.
 */
export function MiniMonth({
  selected,
  weekStart,
  locale,
  todayKey,
  eventDays,
  onSelect,
}: {
  readonly selected: Date;
  readonly weekStart: number;
  readonly locale: Locale;
  readonly todayKey: string;
  /** Days with something on them, among those loaded. */
  readonly eventDays: ReadonlySet<string>;
  readonly onSelect: (date: Date) => void;
}) {
  const t = useT();
  const selectedMonth = `${selected.getFullYear()}-${selected.getMonth()}`;
  const [month, setMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const [syncedMonth, setSyncedMonth] = useState(selectedMonth);
  if (syncedMonth !== selectedMonth) {
    setSyncedMonth(selectedMonth);
    setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
  }

  const days = useMemo(() => buildMonthGrid(month, weekStart), [month, weekStart]);
  const labels = useMemo(() => weekdayLabels(weekStart, locale, "narrow"), [weekStart, locale]);
  const selectedKey = dayKey(selected);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="truncate pl-1 text-sm font-semibold">
          {capitalizeFirst(month.toLocaleDateString(locale, { month: "long", year: "numeric" }))}
        </p>
        <div className="flex items-center">
          <IconNavButton
            label={t("calendar.previous")}
            icon={ArrowLeft01Icon}
            onClick={() => setMonth((current) => addMonths(current, -1))}
            className="size-7"
          />
          <IconNavButton
            label={t("calendar.next")}
            icon={ArrowRight01Icon}
            onClick={() => setMonth((current) => addMonths(current, 1))}
            className="size-7"
          />
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-medium text-muted-foreground uppercase">
        {labels.map((label, i) => (
          <span key={i} className="py-1">
            {label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((date) => {
          const key = dayKey(date);
          const inMonth = date.getMonth() === month.getMonth();
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(date)}
              aria-pressed={isSelected}
              aria-label={date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
              className={cn(
                "relative mx-auto flex size-7 items-center justify-center rounded-full text-xs tabular-nums transition-colors duration-150",
                inMonth ? "text-foreground" : "text-muted-foreground/50",
                isSelected
                  ? isToday
                    ? "bg-[var(--cal-accent)] font-semibold text-white"
                    : "bg-foreground font-semibold text-background"
                  : isToday
                    ? "font-semibold text-[color:var(--cal-accent)] hover:bg-accent"
                    : "hover:bg-accent",
              )}
            >
              {date.getDate()}
              {eventDays.has(key) && !isSelected ? (
                <span className="absolute bottom-0.5 left-1/2 size-[3px] -translate-x-1/2 rounded-full bg-muted-foreground/70" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
