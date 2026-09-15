"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@/components/icons/icon";
import { Add01Icon, ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { GoogleMark } from "@/app/landing/_components/brand-marks";
import { Card } from "../../_components/dashboard-card";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { SkeletonBar } from "@/components/ai-elements/skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast-provider";
import { useI18n } from "@/lib/i18n/provider";
import { fetchJson, isApiError, uiErrorMessage, type UiError } from "@/lib/api-error-message";
import { usePolling } from "@/lib/use-polling";
import { cn } from "@/lib/utils";
import type { EventInput, UpcomingEvent } from "@/lib/calendar";
import styles from "./_components/calendar.module.css";
import {
  WEEK_START,
  addDays,
  capitalizeFirst,
  dayKey,
  draftFromEvent,
  eventBounds,
  shiftAnchor,
  startOfDay,
  viewDays,
  type CalendarView,
  type EditorDraft,
} from "./_components/calendar-utils";
import { DayAgenda } from "./_components/day-agenda";
import { EventEditor } from "./_components/event-editor";
import { IconNavButton, MiniMonth } from "./_components/mini-month";
import { MonthView } from "./_components/month-view";
import { TimeGrid } from "./_components/time-grid";

// Calendar.
//
// The Google Calendar the agent already books into — see the `calendar`
// tool's `book_event` action — and now one the operator writes into too.
// Shaped after Apple's Calendar: a day, week and month view under one
// toolbar, a small month and the selected day's agenda beside them, and
// events made by dragging across the hours. Every write goes straight to
// Google, so what is on this screen is what the agent sees when it checks
// availability.

const VIEW_KEY = "senka:calendar-view";
/** The agent books from conversations while this page is open. */
const REFRESH_MS = 60_000;

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
}

export default function CalendarPage() {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const weekStart = WEEK_START[locale];
  const narrow = useIsNarrow();

  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [now, setNow] = useState(() => new Date());
  const [events, setEvents] = useState<UpcomingEvent[] | null>(null);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; draft: EditorDraft | null; nonce: number }>({
    open: false,
    draft: null,
    nonce: 0,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_KEY);
      if (stored === "day" || stored === "week" || stored === "month") setView(stored);
    } catch {
      // Private mode — month is a fine place to start.
    }
  }, []);

  const changeView = useCallback((next: CalendarView) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Best-effort.
    }
  }, []);

  // The now line and "today" have to move on their own if the page stays open.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // A phone has no room for seven columns of hours: its week is a day.
  const effectiveView: CalendarView = narrow && view === "week" ? "day" : view;
  const days = useMemo(() => viewDays(effectiveView, anchor, weekStart), [effectiveView, anchor, weekStart]);
  const range = useMemo(() => {
    const start = days[0] ?? anchor;
    const end = addDays(days[days.length - 1] ?? anchor, 1);
    return { start, end, key: `${dayKey(start)}_${dayKey(end)}` };
  }, [days, anchor]);

  const requestId = useRef(0);
  const loadRange = useCallback(
    async (quiet = false) => {
      requestId.current += 1;
      const id = requestId.current;
      if (!quiet) setRangeLoading(true);
      const params = new URLSearchParams({ start: range.start.toISOString(), end: range.end.toISOString() });
      const result = await fetchJson<{ events?: UpcomingEvent[] }>(`/api/calendar/events?${params}`, t);
      // Paging fast fires several of these; only the newest gets to draw.
      if (id !== requestId.current) return;
      setRangeLoading(false);
      if (!result.ok) {
        if (isApiError(result.error) && result.error.code === "not_configured") {
          setNotConfigured(true);
          setError(null);
          setEvents([]);
          return;
        }
        if (!quiet) setError(result.error);
        setEvents((current) => current ?? []);
        return;
      }
      setNotConfigured(false);
      setError(null);
      setEvents(result.data.events ?? []);
    },
    // `range.key` stands for the range; the dates themselves are rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range.key, t],
  );

  useEffect(() => {
    void loadRange();
  }, [loadRange]);

  // Skipped rather than disabled while the editor is open: `usePolling` ticks
  // the moment it is re-enabled, which refetched right on top of every save.
  usePolling(
    () => {
      if (events !== null && !editor.open && !saving) void loadRange(true);
    },
    REFRESH_MS,
    !notConfigured,
  );

  const eventList = events ?? [];
  const todayKey = dayKey(now);

  const eventDays = useMemo(() => {
    const keys = new Set<string>();
    for (const event of events ?? []) {
      const { start, end } = eventBounds(event);
      let day = startOfDay(start);
      for (let i = 0; day < end && i < 62; i += 1) {
        keys.add(dayKey(day));
        day = addDays(day, 1);
      }
    }
    return keys;
  }, [events]);

  const heading = useMemo(() => {
    if (effectiveView === "day") {
      return {
        main: anchor.toLocaleDateString(locale, { day: "numeric", month: "long" }),
        sub: String(anchor.getFullYear()),
        caption: anchor.toLocaleDateString(locale, { weekday: "long" }),
      };
    }
    const first = days[0] ?? anchor;
    const last = days[days.length - 1] ?? anchor;
    if (effectiveView === "week" && first.getMonth() !== last.getMonth()) {
      const short = (date: Date) => date.toLocaleDateString(locale, { month: "short" }).replace(".", "");
      return { main: `${short(first)} – ${short(last)}`, sub: String(last.getFullYear()), caption: null };
    }
    return {
      main: anchor.toLocaleDateString(locale, { month: "long" }),
      sub: String(anchor.getFullYear()),
      caption: null,
    };
  }, [effectiveView, anchor, days, locale]);

  const goToday = () => setAnchor(startOfDay(new Date()));
  const step = (direction: -1 | 1) => setAnchor((current) => shiftAnchor(effectiveView, current, direction));
  const selectDay = (date: Date) => setAnchor(startOfDay(date));
  const showDay = (date: Date) => {
    setAnchor(startOfDay(date));
    changeView("day");
  };

  const openDraft = (draft: EditorDraft) =>
    setEditor((current) => ({ open: true, draft, nonce: current.nonce + 1 }));

  /** The toolbar's "+": an hour on the selected day, starting at the next
   *  whole hour — the slot someone reaching for "new event" usually means. */
  const newEvent = () => {
    const start = new Date(anchor);
    start.setHours(Math.min(new Date().getHours() + 1, 23), 0, 0, 0);
    openDraft({ start, end: new Date(start.getTime() + 60 * 60_000), allDay: false });
  };

  const newAllDay = (date: Date) => {
    const start = startOfDay(date);
    openDraft({ start, end: addDays(start, 1), allDay: true });
  };

  const openEvent = (event: UpcomingEvent) => openDraft(draftFromEvent(event));

  const save = async (input: EventInput, id?: string) => {
    setSaving(true);
    const result = await fetchJson<{ event: UpcomingEvent }>(
      id ? `/api/calendar/events/${encodeURIComponent(id)}` : "/api/calendar/events",
      t,
      {
        method: id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    setSaving(false);
    if (!result.ok) {
      toast({ title: uiErrorMessage(t, result.error), status: "error" });
      return;
    }
    const saved = result.data.event;
    setEvents((current) => [...(current ?? []).filter((event) => event.id !== saved.id), saved]);
    setEditor((current) => ({ ...current, open: false }));
    toast({ title: id ? t("calendar.updated") : t("calendar.created"), status: "success" });
  };

  const remove = async (event: UpcomingEvent) => {
    const ok = await confirm({
      title: t("calendar.deleteConfirm", { name: event.summary || t("calendar.untitled") }),
      description: t("calendar.deleteConfirmBody"),
      confirmLabel: t("calendar.delete"),
    });
    if (!ok) return;
    setSaving(true);
    const result = await fetchJson(`/api/calendar/events/${encodeURIComponent(event.id)}`, t, {
      method: "DELETE",
    });
    setSaving(false);
    if (!result.ok) {
      toast({ title: uiErrorMessage(t, result.error), status: "error" });
      return;
    }
    setEvents((current) => (current ?? []).filter((entry) => entry.id !== event.id));
    setEditor((current) => ({ ...current, open: false }));
    toast({ title: t("calendar.deleted"), status: "success" });
  };

  // Calendar keys: ← → page, T today, N new event, D / W / M switch view.
  // Registered every render so the handlers always see the current anchor.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (editor.open || document.querySelector("[role=dialog],[role=alertdialog]")) return;
      if (notConfigured) return;
      const actions: Record<string, () => void> = {
        ArrowLeft: () => step(-1),
        ArrowRight: () => step(1),
        t: goToday,
        n: newEvent,
        d: () => changeView("day"),
        w: () => changeView("week"),
        m: () => changeView("month"),
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const initialLoading = events === null && !notConfigured && !error;
  const viewTabs = [
    { id: "day", label: t("calendar.viewDay") },
    ...(narrow ? [] : [{ id: "week", label: t("calendar.viewWeek") }]),
    { id: "month", label: t("calendar.viewMonth") },
  ];

  return (
    <div className={cn(styles.root, "content-enter flex h-full min-h-0 flex-col overflow-hidden")}>
      <header className="shrink-0 border-b border-border bg-card/40 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
          <h1 className="min-w-0 flex-1 truncate text-xl leading-8 font-semibold tracking-tight">
            <span>{capitalizeFirst(heading.main)}</span>{" "}
            <span className="font-normal text-muted-foreground">{heading.sub}</span>
            {heading.caption ? (
              <span className="ml-2 hidden text-sm font-normal text-muted-foreground capitalize sm:inline">
                {heading.caption}
              </span>
            ) : null}
          </h1>

          <div className="order-last w-full sm:order-none sm:w-auto">
            <SlidingTabs
              value={effectiveView}
              onValueChange={(id) => changeView(id as CalendarView)}
              tabs={viewTabs}
            />
          </div>

          <div className="flex items-center gap-0.5">
            <IconNavButton label={t("calendar.previous")} icon={ArrowLeft01Icon} onClick={() => step(-1)} />
            <Button variant="outline" size="sm" onClick={goToday}>
              {t("calendar.today")}
            </Button>
            <IconNavButton label={t("calendar.next")} icon={ArrowRight01Icon} onClick={() => step(1)} />
          </div>

          <Button size="sm" onClick={newEvent} disabled={notConfigured} aria-label={t("calendar.newEvent")}>
            <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.75} />
            <span className="hidden sm:inline">{t("calendar.newEvent")}</span>
          </Button>
        </div>

        {error ? (
          <ErrorBanner
            className="rounded-none border-x-0 border-t shadow-none"
            error={error}
            onRetry={() => void loadRange()}
            onDismiss={() => setError(null)}
          />
        ) : null}
      </header>

      {notConfigured ? (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
          <Card className="w-full max-w-md">
            <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                <GoogleMark size={20} />
              </div>
              <div>
                <p className="text-sm font-medium">{t("calendar.notConnectedTitle")}</p>
                <p className="max-w-xs text-xs text-muted-foreground">{t("calendar.notConnectedDescription")}</p>
              </div>
              <Button asChild size="sm" variant="secondary">
                <Link href="/connections">{t("calendar.goToConnections")}</Link>
              </Button>
            </div>
          </Card>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-border bg-card/30 p-4 lg:flex xl:w-72">
            <MiniMonth
              selected={anchor}
              weekStart={weekStart}
              locale={locale}
              todayKey={todayKey}
              eventDays={eventDays}
              onSelect={selectDay}
            />
            <DayAgenda
              day={anchor}
              events={eventList}
              locale={locale}
              onOpenEvent={openEvent}
              onCreate={newEvent}
            />
            <p className="mt-auto px-1 text-[11px] leading-relaxed text-muted-foreground">
              {t("calendar.createHint")}
            </p>
          </aside>

          <div
            className={cn(
              "relative min-w-0 flex-1 transition-opacity duration-200",
              rangeLoading && !initialLoading && "opacity-70",
            )}
            aria-busy={rangeLoading || undefined}
          >
            {initialLoading ? (
              <GridSkeleton />
            ) : effectiveView === "month" ? (
              narrow ? (
                <div className="h-full overflow-y-auto">
                  <MonthView
                    compact
                    anchor={anchor}
                    weekStart={weekStart}
                    locale={locale}
                    events={eventList}
                    todayKey={todayKey}
                    onSelectDay={selectDay}
                    onCreateOnDay={newAllDay}
                    onOpenEvent={openEvent}
                    onShowDay={showDay}
                  />
                  <div className="p-4">
                    <DayAgenda
                      day={anchor}
                      events={eventList}
                      locale={locale}
                      onOpenEvent={openEvent}
                      onCreate={newEvent}
                    />
                  </div>
                </div>
              ) : (
                <MonthView
                  anchor={anchor}
                  weekStart={weekStart}
                  locale={locale}
                  events={eventList}
                  todayKey={todayKey}
                  onSelectDay={selectDay}
                  onCreateOnDay={newAllDay}
                  onOpenEvent={openEvent}
                  onShowDay={showDay}
                />
              )
            ) : (
              <TimeGrid
                key={effectiveView}
                days={days}
                locale={locale}
                events={eventList}
                now={now}
                onCreate={openDraft}
                onOpenEvent={openEvent}
                onShowDay={showDay}
              />
            )}
          </div>
        </div>
      )}

      <EventEditor
        key={editor.nonce}
        open={editor.open}
        onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
        draft={editor.draft}
        saving={saving}
        onSave={(input, id) => void save(input, id)}
        onDelete={(event) => void remove(event)}
      />
      {confirmDialog}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid h-full grid-cols-7 grid-rows-6 gap-px p-px">
      {Array.from({ length: 42 }).map((_, i) => (
        <div key={i} className="flex justify-end p-1.5">
          <SkeletonBar className="size-5 rounded-full" />
        </div>
      ))}
    </div>
  );
}
