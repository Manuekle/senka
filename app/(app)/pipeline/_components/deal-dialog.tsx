"use client";

import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { ArrowLeft01Icon, ArrowRight01Icon, Calendar03Icon, Coins01Icon } from "@hugeicons/core-free-icons";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { DEAL_STAGES, defaultCurrency } from "@/lib/deals";
import { useI18n } from "@/lib/i18n/provider";
import type { Contact, Deal, DealStage } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The codes an operator here is realistically quoting in. Free text would
 *  let a typo through into `Intl.NumberFormat`; a closed list of the region's
 *  currencies plus the two reserve ones covers the actual cases. */
const CURRENCIES = ["ARS", "USD", "EUR", "BRL", "CLP", "COP", "MXN", "PEN", "UYU"] as const;

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
 * Create or edit a deal.
 *
 * Remount per target with `key={editing?.id ?? "new"}` at the call site — the
 * form state below is local, and without the key an edit dialog opened twice
 * shows the first deal's numbers against the second deal's name.
 */
export function DealDialog({
  open,
  editing,
  contacts,
  deals,
  presetContactId,
  onClose,
  onSaved,
}: {
  readonly open: boolean;
  readonly editing: Deal | null;
  readonly contacts: readonly Contact[];
  /** Only read to pick the starting currency — whatever this account already
   *  quotes in most. */
  readonly deals: readonly Deal[];
  readonly presetContactId?: string;
  readonly onClose: () => void;
  readonly onSaved: (deal: Deal) => void;
}) {
  const { locale, t } = useI18n();
  const base = useId();
  // The save button sits in the drawer footer, outside the <form> — the two
  // are tied together by this id rather than by nesting.
  const formId = `${base}-form`;
  const isEditing = Boolean(editing);

  const [title, setTitle] = useState(editing?.title ?? "");
  // No fallback to the first contact in the list. It read as a helpful
  // default and was a trap: this component mounts with the page, before
  // `/api/contacts` has answered, so `contacts[0]` was undefined anyway — and
  // had it not been, a deal would have been quietly filed against whoever
  // happened to sort first. An empty select and a disabled Save is the honest
  // version.
  const [contactId, setContactId] = useState(editing?.contactId ?? presetContactId ?? "");
  const [value, setValue] = useState(editing ? String(editing.value) : "");
  const [currency, setCurrency] = useState(
    editing?.currency ?? defaultCurrency(deals, locale),
  );
  const [stage, setStage] = useState<DealStage>(editing?.stage ?? "lead");
  // The picker uses YYYY-MM-DD; the store keeps a full ISO stamp.
  const [closeDate, setCloseDate] = useState(
    editing?.expectedCloseAt ? editing.expectedCloseAt.slice(0, 10) : "",
  );
  const [viewDate, setViewDate] = useState(() =>
    closeDate ? parseDay(closeDate) : new Date(),
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [lostReason, setLostReason] = useState(editing?.lostReason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);

  const sortedContacts = useMemo(
    () => [...contacts].sort((a, b) => a.name.localeCompare(b.name)),
    [contacts],
  );
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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !contactId) return;
    setBusy(true);
    const payload = {
      title: title.trim(),
      value: value.trim() === "" ? 0 : Number(value),
      currency,
      stage,
      // "" clears the date; the route reads an empty string as "remove it".
      expectedCloseAt: closeDate,
      notes: notes.trim(),
      ...(stage === "lost" ? { lostReason: lostReason.trim() } : {}),
    };
    const result = editing
      ? await fetchJson<{ deal: Deal }>(`/api/deals/${editing.id}`, t, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetchJson<{ deal: Deal }>("/api/deals", t, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...payload, contactId }),
        });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.data.deal);
    onClose();
  };

  return (
    <Drawer open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DrawerContent className="max-w-2xl">
        <DrawerHeader>
          <DrawerTitle icon={<HugeiconsIcon icon={Coins01Icon} size={18} strokeWidth={1.75} />}>
            {editing ? t("pipeline.dialog.editTitle") : t("pipeline.dialog.newTitle")}
          </DrawerTitle>
          <DrawerDescription>
            {t("pipeline.dialog.description")}
          </DrawerDescription>
        </DrawerHeader>

        <DrawerBody className="min-h-0">
          <form id={formId} className="space-y-4" onSubmit={(event) => void submit(event)}>
            <ErrorBanner error={error} onDismiss={() => setError(null)} />

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">{t("pipeline.field.title")}</span>
              <Input
                autoFocus
                required
                value={title}
                placeholder={t("pipeline.field.titlePlaceholder")}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>

            <div className="space-y-1.5 text-sm">
              <span className="font-medium" id={`${base}-contact-label`}>
                {t("pipeline.field.contact")}
              </span>
              {/* A deal belongs to a person, and the contact it belongs to is not
                  something an edit should be able to reassign — a deal that moves
                  between people takes its history somewhere it never happened. */}
              <Select value={contactId} onValueChange={setContactId} disabled={isEditing}>
                <SelectTrigger aria-labelledby={`${base}-contact-label`} className="w-full">
                  <SelectValue placeholder={t("pipeline.field.contactPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {sortedContacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {contact.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">{t("pipeline.field.value")}</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={value}
                  placeholder="0"
                  onChange={(event) => setValue(event.target.value)}
                />
              </label>
              <div className="space-y-1.5 text-sm">
                <span className="font-medium" id={`${base}-currency-label`}>
                  {t("pipeline.field.currency")}
                </span>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger aria-labelledby={`${base}-currency-label`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 text-sm">
                <span className="font-medium" id={`${base}-stage-label`}>
                  {t("pipeline.field.stage")}
                </span>
                <Select value={stage} onValueChange={(next) => setStage(next as DealStage)}>
                  <SelectTrigger aria-labelledby={`${base}-stage-label`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEAL_STAGES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(`pipeline.stage.${option}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 text-sm">
                <span className="font-medium" id={`${base}-close-date-label`}>
                  {t("pipeline.field.closeDate")}
                </span>
                <div ref={calendarRef} className="relative">
                  <button
                    id={`${base}-close-date`}
                    type="button"
                    aria-expanded={calendarOpen}
                    aria-haspopup="dialog"
                    aria-controls={`${base}-close-date-calendar`}
                    aria-labelledby={`${base}-close-date-label`}
                    onClick={() => setCalendarOpen((open) => !open)}
                    className="flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-muted px-3.5 text-left text-sm shadow-[var(--shadow-inset)] transition-[background-color,border-color,box-shadow] duration-150 outline-none hover:bg-card focus-visible:border-ring focus-visible:bg-card focus-visible:ring-0 focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--ring)]"
                  >
                    <HugeiconsIcon icon={Calendar03Icon} size={16} strokeWidth={1.75} />
                    <span>
                      {closeDate
                        ? parseDay(closeDate).toLocaleDateString(locale, { dateStyle: "medium" })
                        : t("pipeline.field.closeDate")}
                    </span>
                  </button>
                  <div
                    className="t-dropdown absolute right-0 top-[calc(100%+0.5rem)] z-30 w-full min-w-[18rem] rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-[var(--shadow-float)]"
                    id={`${base}-close-date-calendar`}
                    data-state={calendarOpen ? "open" : "closed"}
                    aria-hidden={!calendarOpen}
                    inert={!calendarOpen}
                    role="dialog"
                    aria-label={t("pipeline.field.closeDate")}
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
                          onClick={() => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
                          return (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={value === closeDate}
                              onClick={() => {
                                setCloseDate(value);
                                setViewDate(day);
                                setCalendarOpen(false);
                              }}
                              className={cn(
                                "size-9 rounded-xl text-xs font-medium transition-colors",
                                day.getMonth() === viewDate.getMonth() ? "text-foreground" : "text-muted-foreground/45",
                                value === closeDate ? "bg-primary text-primary-foreground" : "hover:bg-muted",
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

            {stage === "lost" ? (
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">{t("pipeline.field.lostReason")}</span>
                <Input
                  value={lostReason}
                  placeholder={t("pipeline.field.lostReasonPlaceholder")}
                  onChange={(event) => setLostReason(event.target.value)}
                />
              </label>
            ) : null}

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">{t("pipeline.field.notes")}</span>
              <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>

          </form>
        </DrawerBody>

        <DrawerFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={formId} disabled={busy || !title.trim() || !contactId}>
            {busy ? t("pipeline.dialog.saving") : t("common.save")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
