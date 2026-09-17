"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { ArrowLeft01Icon, ArrowRight01Icon, Calendar03Icon } from "@hugeicons/core-free-icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

function dayKey(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function parseDay(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function monthGrid(viewDate: Date, weekStart: number): Date[] {
  const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const offset = (first.getDay() - weekStart + 7) % 7;
  return Array.from({ length: 42 }, (_, index) => addDays(first, index - offset));
}

/**
 * Log something that was done to the site.
 *
 * Two fields, and the date is the one that matters: it is the day the change
 * went live, not the day someone got round to writing it down, so it defaults
 * to today and is expected to be edited backwards. The note is a sentence for
 * a human — "titles reescritos en /precios" — because in four weeks it is the
 * only thing that will explain a step in the graph.
 */
export function ChangeDialog({
  onOpenChange,
  onSaved,
  open,
}: {
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
  readonly open: boolean;
}) {
  const { locale, t } = useI18n();
  const today = dayKey(new Date());
  const [date, setDate] = useState(today);
  const [viewDate, setViewDate] = useState(() => parseDay(today));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const weekStart = locale === "es" ? 1 : 0;
  const gridDays = useMemo(() => monthGrid(viewDate, weekStart), [viewDate, weekStart]);
  const weekdayLabels = useMemo(() => {
    const sunday = new Date(2024, 0, 7);
    return Array.from({ length: 7 }, (_, index) =>
      addDays(sunday, (weekStart + index) % 7).toLocaleDateString(locale, { weekday: "short" }),
    );
  }, [locale, weekStart]);

  useEffect(() => {
    if (!calendarOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setCalendarOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCalendarOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [calendarOpen]);

  const save = async () => {
    if (!note.trim()) return;
    setSaving(true);
    setError(null);
    const result = await fetchJson<{ ok: boolean }>("/api/seo", t, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date, note }),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNote("");
    setDate(today);
    setViewDate(parseDay(today));
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The date field's calendar hangs off the button rather than going
          through a portal, so the body must not be a scroll container. Two
          fields — it never grows tall enough to need one. */}
      <DialogContent className="sm:max-w-md" scrollBody={false}>
        <DialogHeader>
          <DialogTitle icon={<HugeiconsIcon icon={Calendar03Icon} size={18} strokeWidth={1.75} />}>
            {t("seo.logChange")}
          </DialogTitle>
          <DialogDescription>{t("seo.logChangeHelp")}</DialogDescription>
        </DialogHeader>

        <ErrorBanner error={error} />

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="font-medium text-sm" htmlFor="seo-change-note">
              {t("seo.changeNote")}
            </label>
            <Input
              id="seo-change-note"
              maxLength={200}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("seo.changeNotePlaceholder")}
              value={note}
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-medium text-sm" htmlFor="seo-change-date">
              {t("seo.changeDate")}
            </label>
            <div ref={calendarRef} className="relative">
              <button
                id="seo-change-date"
                type="button"
                aria-expanded={calendarOpen}
                aria-haspopup="dialog"
                aria-controls="seo-change-date-calendar"
                onClick={() => setCalendarOpen((open) => !open)}
                className="flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-muted px-3.5 text-left text-sm shadow-[var(--shadow-inset)] transition-[background-color,border-color,box-shadow] duration-150 outline-none hover:bg-card focus-visible:border-ring focus-visible:bg-card focus-visible:ring-0 focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--ring)]"
              >
                <HugeiconsIcon icon={Calendar03Icon} size={16} strokeWidth={1.75} />
                <span>{parseDay(date).toLocaleDateString(locale, { dateStyle: "medium" })}</span>
              </button>
              <div
                className="t-dropdown absolute left-0 top-[calc(100%+0.5rem)] z-30 w-full min-w-[18rem] rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-[var(--shadow-float)]"
                id="seo-change-date-calendar"
                data-state={calendarOpen ? "open" : "closed"}
                aria-hidden={!calendarOpen}
                inert={!calendarOpen}
                role="dialog"
                aria-label={t("seo.changeDate")}
              >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      aria-label={t("calendar.prevMonth")}
                      onClick={() => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.75} />
                    </button>
                    <span className="text-sm font-semibold capitalize">
                      {viewDate.toLocaleDateString(locale, { month: "long", year: "numeric" })}
                    </span>
                    <button
                      type="button"
                      aria-label={t("calendar.nextMonth")}
                      disabled={viewDate.getFullYear() === parseDay(today).getFullYear() && viewDate.getMonth() >= parseDay(today).getMonth()}
                      onClick={() => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                    >
                      <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.75} />
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {weekdayLabels.map((label) => <span key={label}>{label}</span>)}
                  </div>
                  <div className="mt-1 grid grid-cols-7 gap-1">
                    {gridDays.map((day) => {
                      const value = dayKey(day);
                      const disabled = value > today;
                      return (
                        <button
                          key={value}
                          type="button"
                          disabled={disabled}
                          aria-pressed={value === date}
                          onClick={() => {
                            setDate(value);
                            setViewDate(day);
                            setCalendarOpen(false);
                          }}
                          className={cn(
                            "size-9 rounded-xl text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-30",
                            day.getMonth() === viewDate.getMonth() ? "text-foreground" : "text-muted-foreground/45",
                            value === date ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                          )}
                        >
                          {day.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            {t("common.cancel")}
          </Button>
          <Button disabled={saving || !note.trim()} onClick={() => void save()} type="button">
            {saving ? t("seo.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
