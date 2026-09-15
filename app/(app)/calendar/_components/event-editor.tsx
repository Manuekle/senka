"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Delete02Icon,
  ExternalLinkIcon,
  Location01Icon,
  Tick02Icon,
  UserGroup02Icon,
  Video01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { EventInput, UpcomingEvent } from "@/lib/calendar";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import styles from "./calendar.module.css";
import {
  EVENT_COLORS,
  addDays,
  combine,
  dayKey,
  eventColorStyle,
  parseDayKey,
  timeKey,
  type EditorDraft,
} from "./calendar-utils";

const DAY_MS = 86_400_000;

/**
 * Create or edit one event.
 *
 * Mount it keyed per opening (the page bumps a nonce): the fields are local
 * state seeded from the draft, and a reused instance would open holding the
 * previous event's title.
 */
export function EventEditor({
  open,
  onOpenChange,
  draft,
  saving,
  onSave,
  onDelete,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly draft: EditorDraft | null;
  readonly saving: boolean;
  readonly onSave: (input: EventInput, id?: string) => void;
  readonly onDelete: (event: UpcomingEvent) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {draft ? <EditorPanel draft={draft} saving={saving} onSave={onSave} onDelete={onDelete} /> : null}
    </Dialog>
  );
}

function EditorPanel({
  draft,
  saving,
  onSave,
  onDelete,
}: {
  readonly draft: EditorDraft;
  readonly saving: boolean;
  readonly onSave: (input: EventInput, id?: string) => void;
  readonly onDelete: (event: UpcomingEvent) => void;
}) {
  const t = useT();
  const existing = draft.event;

  const [title, setTitle] = useState(existing?.summary ?? "");
  const [allDay, setAllDay] = useState(draft.allDay);
  const [startDate, setStartDate] = useState(dayKey(draft.start));
  const [startTime, setStartTime] = useState(draft.allDay ? "09:00" : timeKey(draft.start));
  // The inputs show the last day an event covers; Google's end is the day after.
  const [endDate, setEndDate] = useState(dayKey(draft.allDay ? addDays(draft.end, -1) : draft.end));
  const [endTime, setEndTime] = useState(draft.allDay ? "10:00" : timeKey(draft.end));
  const [location, setLocation] = useState(existing?.location ?? "");
  const [notes, setNotes] = useState(existing?.description ?? "");
  const [colorId, setColorId] = useState(existing?.colorId ?? "");
  const [withMeet, setWithMeet] = useState(false);

  const complete = Boolean(startDate && endDate && (allDay || (startTime && endTime)));
  const start = combine(startDate, allDay ? "00:00" : startTime);
  const end = combine(endDate, allDay ? "00:00" : endTime);
  const ordered = allDay ? endDate >= startDate : end > start;
  const valid = complete && ordered;

  /** Moving the start carries the end along, keeping the length — what every
   *  calendar does, and what saves retyping both times to move a meeting. */
  const moveStart = (nextDate: string, nextTime: string) => {
    if (nextDate && startDate && endDate) {
      if (allDay) {
        const days = Math.round((parseDayKey(nextDate).getTime() - parseDayKey(startDate).getTime()) / DAY_MS);
        setEndDate(dayKey(addDays(parseDayKey(endDate), days)));
      } else if (nextTime && startTime && endTime) {
        const shift = combine(nextDate, nextTime).getTime() - combine(startDate, startTime).getTime();
        const movedEnd = new Date(combine(endDate, endTime).getTime() + shift);
        setEndDate(dayKey(movedEnd));
        setEndTime(timeKey(movedEnd));
      }
    }
    setStartDate(nextDate);
    setStartTime(nextTime);
  };

  const submit = () => {
    if (!valid || saving) return;
    const shared = {
      summary: title.trim() || t("calendar.newEvent"),
      description: notes.trim(),
      location: location.trim(),
      colorId,
      withMeet: existing ? undefined : withMeet,
    };
    const input: EventInput = allDay
      ? {
          ...shared,
          allDay: true,
          start: startDate,
          end: dayKey(addDays(parseDayKey(endDate), 1)),
        }
      : {
          ...shared,
          allDay: false,
          start: start.toISOString(),
          end: end.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
    onSave(input, existing?.id);
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle
          icon={
            <span
              style={eventColorStyle(colorId)}
              className={cn(styles.event, "block size-3 rounded-full bg-[var(--ev-solid)]")}
            />
          }
        >
          {existing ? t("calendar.editEvent") : t("calendar.newEvent")}
        </DialogTitle>
      </DialogHeader>

      <Input
        aria-label={t("calendar.fieldTitle")}
        autoFocus
        value={title}
        placeholder={t("calendar.newEvent")}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
        className="h-10 text-base font-medium"
      />

      <div className="divide-y divide-border rounded-xl border border-border bg-muted/20">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <span className="text-sm">{t("calendar.fieldAllDay")}</span>
          <Switch checked={allDay} onCheckedChange={setAllDay} label={t("calendar.fieldAllDay")} />
        </div>
        <DateTimeRow
          label={t("calendar.fieldStarts")}
          timeLabel={t("calendar.fieldTime")}
          date={startDate}
          time={startTime}
          allDay={allDay}
          onDate={(value) => moveStart(value, startTime)}
          onTime={(value) => moveStart(startDate, value)}
        />
        <DateTimeRow
          label={t("calendar.fieldEnds")}
          timeLabel={t("calendar.fieldTime")}
          date={endDate}
          time={endTime}
          allDay={allDay}
          invalid={complete && !ordered}
          min={startDate}
          onDate={setEndDate}
          onTime={setEndTime}
        />
      </div>
      {complete && !ordered ? (
        <p role="alert" className="-mt-2 px-1 text-xs text-destructive">
          {t("calendar.endBeforeStart")}
        </p>
      ) : null}

      <fieldset>
        <legend className="mb-2 px-1 text-xs font-medium text-muted-foreground">{t("calendar.fieldColor")}</legend>
        <div className="flex flex-wrap gap-2 px-1">
          {EVENT_COLORS.map((color) => {
            const selected = color.id === colorId;
            const name = t(color.id ? `calendar.color.${color.id}` : "calendar.color.default");
            return (
              <button
                key={color.id || "default"}
                type="button"
                aria-label={name}
                aria-pressed={selected}
                title={name}
                onClick={() => setColorId(color.id)}
                style={eventColorStyle(color.id)}
                className={cn(
                  styles.event,
                  "grid size-6 place-items-center rounded-full bg-[var(--ev-solid)] text-white transition-transform duration-150 hover:scale-110",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ring)]",
                  selected && "ring-2 ring-[color:var(--ev-solid)] ring-offset-2 ring-offset-card",
                )}
              >
                {selected ? <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2.5} /> : null}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="relative">
        <HugeiconsIcon
          icon={Location01Icon}
          size={15}
          strokeWidth={1.75}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label={t("calendar.fieldLocation")}
          placeholder={t("calendar.fieldLocation")}
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          className="pl-9"
        />
      </div>

      {existing ? (
        existing.meetLink || existing.link || existing.attendees.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-xl border border-border px-3 py-2.5 text-sm">
            {existing.meetLink ? (
              <a
                href={existing.meetLink}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 font-medium hover:underline"
              >
                <HugeiconsIcon icon={Video01Icon} size={15} strokeWidth={1.75} />
                {t("calendar.joinMeet")}
              </a>
            ) : null}
            {existing.attendees.length > 0 ? (
              <span className="inline-flex min-w-0 items-start gap-2 text-muted-foreground">
                <HugeiconsIcon icon={UserGroup02Icon} size={15} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                <span className="min-w-0 [overflow-wrap:anywhere]">{existing.attendees.join(", ")}</span>
              </span>
            ) : null}
            {existing.link ? (
              <a
                href={existing.link}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <HugeiconsIcon icon={ExternalLinkIcon} size={15} strokeWidth={1.75} />
                {t("calendar.openInGoogle")}
              </a>
            ) : null}
          </div>
        ) : null
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
          <span className="inline-flex items-center gap-2 text-sm">
            <HugeiconsIcon icon={Video01Icon} size={15} strokeWidth={1.75} className="text-muted-foreground" />
            {t("calendar.fieldMeet")}
          </span>
          <Switch checked={withMeet} onCheckedChange={setWithMeet} label={t("calendar.fieldMeet")} />
        </div>
      )}

      <Textarea
        aria-label={t("calendar.fieldNotes")}
        placeholder={t("calendar.fieldNotes")}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={3}
      />

      <DialogFooter>
        {existing ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => onDelete(existing)}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.75} />
            {t("calendar.delete")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={saving}>
              {t("common.cancel")}
            </Button>
          </DialogClose>
          <Button onClick={submit} disabled={!valid || saving}>
            {saving ? <Spinner size={14} /> : null}
            {existing ? t("calendar.save") : t("calendar.create")}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}

function DateTimeRow({
  label,
  timeLabel,
  date,
  time,
  allDay,
  invalid = false,
  min,
  onDate,
  onTime,
}: {
  readonly label: string;
  readonly timeLabel: string;
  readonly date: string;
  readonly time: string;
  readonly allDay: boolean;
  readonly invalid?: boolean;
  readonly min?: string;
  readonly onDate: (value: string) => void;
  readonly onTime: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-1.5">
        <Input
          type="date"
          aria-label={label}
          aria-invalid={invalid || undefined}
          value={date}
          min={min}
          onChange={(event) => onDate(event.target.value)}
          className="h-8 w-[9.5rem] px-2 text-sm tabular-nums"
        />
        {allDay ? null : (
          <Input
            type="time"
            aria-label={`${label} · ${timeLabel}`}
            aria-invalid={invalid || undefined}
            step={300}
            value={time}
            onChange={(event) => onTime(event.target.value)}
            // Wide enough for a 12-hour clock's "09:00 a. m.", not just "09:00".
            className="h-8 w-[8.5rem] px-2 text-sm tabular-nums"
          />
        )}
      </span>
    </div>
  );
}
