"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SuccessCheck } from "@/components/ai-elements/success-check";
import { useI18n } from "@/lib/i18n/provider";
import { countryOptions } from "@/lib/countries";
import { stepIsVisible } from "@/lib/forms/scoring";
import type { PublicFormView } from "@/lib/forms/public-view";
import type { FormAnswer } from "@/lib/types";
import { cn } from "@/lib/utils";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The form a visitor fills in — and, with `preview`, the same component
 * driving the builder's live pane. One renderer on purpose: a preview that
 * approximates the real page is a preview people stop trusting.
 */
export function PublicForm({
  form,
  preview = false,
  bare = false,
}: {
  readonly form: PublicFormView | null;
  /** Walk the steps without recording anything. No response is created, the
   *  thank-you screen still shows, and `onReset` puts it back to question one. */
  readonly preview?: boolean;
  /** Render without the standalone page chrome, for embedding in a card. */
  readonly bare?: boolean;
}) {
  const { locale, t } = useI18n();
  const [values, setValues] = useState<Record<string, string | string[]>>({});
  const [index, setIndex] = useState(0);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);
  // The country half of a phone field, kept apart from `values` (which holds
  // the combined "+dial number" the form actually submits) so the select and
  // the digits typed so far each have their own home.
  const [phoneCountry, setPhoneCountry] = useState<Record<string, string>>({});
  const [phoneLocal, setPhoneLocal] = useState<Record<string, string>>({});
  const countries = useMemo(() => countryOptions(locale), [locale]);
  const Frame = bare ? Bare : Shell;
  /** Handed back by the first save. Carrying it forward is what makes the
   *  later steps update one response instead of starting new ones. */
  const [responseId, setResponseId] = useState<string | undefined>(undefined);

  const answers: FormAnswer[] = useMemo(
    () =>
      Object.entries(values)
        .filter(([, value]) => (Array.isArray(value) ? value.length > 0 : value.trim() !== ""))
        .map(([fieldId, value]) => ({ fieldId, value })),
    [values],
  );

  // Conditional steps are resolved here as well as on the server: the visitor
  // has to see the right next question immediately, and the server still
  // decides what the answers are worth.
  const steps = useMemo(
    () => (form ? form.steps.filter((step) => stepIsVisible(step.showIf, answers)) : []),
    [form, answers],
  );

  /** Preview only: back to question one with nothing filled in, so the next
   *  run through exercises the branches from a clean slate. */
  const restart = () => {
    setValues({});
    setPhoneCountry({});
    setPhoneLocal({});
    setProblems({});
    setIndex(0);
    setDone(false);
  };

  if (!form) {
    return (
      <Frame>
        <p className="text-center text-sm text-muted-foreground">{t("publicForm.notFound")}</p>
      </Frame>
    );
  }

  if (done) {
    return (
      <Frame>
        <ThankYou text={form.thankYou || t("publicForm.thanks")} />
        {preview ? (
          <div className="mt-6 flex justify-center">
            <Button variant="outline" size="sm" onClick={restart}>
              {t("publicForm.previewRestart")}
            </Button>
          </div>
        ) : null}
      </Frame>
    );
  }

  const step = steps[Math.min(index, steps.length - 1)];
  const isLast = index >= steps.length - 1;

  const setValue = (fieldId: string, value: string | string[]) => {
    setValues((current) => ({ ...current, [fieldId]: value }));
    setProblems((current) => {
      if (!current[fieldId]) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  };

  /** A pasted full number ("+1 555…") is left as-is; anything else gets the
   *  selected country's dial code in front of it. */
  const combinePhone = (iso2: string, local: string) => {
    const trimmed = local.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("+")) return trimmed;
    const dial = countries.find((c) => c.iso2 === iso2)?.dial;
    return dial ? `${dial} ${trimmed}` : trimmed;
  };

  const setPhoneCountryFor = (fieldId: string, iso2: string) => {
    setPhoneCountry((current) => ({ ...current, [fieldId]: iso2 }));
    setValue(fieldId, combinePhone(iso2, phoneLocal[fieldId] ?? ""));
  };

  const setPhoneLocalFor = (fieldId: string, local: string) => {
    setPhoneLocal((current) => ({ ...current, [fieldId]: local }));
    setValue(fieldId, combinePhone(phoneCountry[fieldId] ?? countries[0]?.iso2 ?? "ar", local));
  };

  const toggleChoice = (fieldId: string, choiceId: string, multi: boolean) => {
    if (!multi) {
      setValue(fieldId, choiceId);
      return;
    }
    const current = values[fieldId];
    const picked = Array.isArray(current) ? current : [];
    setValue(
      fieldId,
      picked.includes(choiceId) ? picked.filter((id) => id !== choiceId) : [...picked, choiceId],
    );
  };

  /** Required means required, and an email that isn't one is worse than blank:
   *  it becomes a contact nobody can reach. */
  const validate = (): boolean => {
    const found: Record<string, string> = {};
    for (const field of step?.fields ?? []) {
      const value = values[field.id];
      const empty = Array.isArray(value) ? value.length === 0 : !value?.trim();
      if (field.required && empty) {
        found[field.id] = t("publicForm.required");
        continue;
      }
      if (field.type === "email" && typeof value === "string" && value.trim()) {
        if (!EMAIL_REGEX.test(value.trim())) found[field.id] = t("publicForm.invalidEmail");
      }
    }
    setProblems(found);
    return Object.keys(found).length === 0;
  };

  const advance = async () => {
    if (!validate()) return;
    // Nothing is recorded from the builder: a preview that files a response
    // would put the operator's own test answers in their leads.
    if (preview) {
      if (isLast) setDone(true);
      else setIndex((current) => current + 1);
      return;
    }
    setSending(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/f/${encodeURIComponent(form.slug)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers, responseId, complete: isLast }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { responseId?: string };
      if (data.responseId) setResponseId(data.responseId);
      if (isLast) setDone(true);
      else setIndex((current) => current + 1);
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <Frame>
      <header className="mb-6">
        <p className="text-xs font-medium text-muted-foreground">
          {t("publicForm.stepOf", { current: index + 1, total: steps.length })}
        </p>
        <h1 className="mt-1 font-cooper text-xl">{step?.title || form.name}</h1>
        {step?.description ? (
          <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
        ) : null}
      </header>

      {/* A bar rather than a spinner: the question people actually have on a
          multi-step form is "how much is left". */}
      <div className="mb-6 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground transition-[width] duration-300 ease-out"
          style={{ width: `${((index + 1) / Math.max(steps.length, 1)) * 100}%` }}
        />
      </div>

      <div className="flex flex-col gap-6">
        {step?.fields.map((field) => {
          const value = values[field.id];
          const problem = problems[field.id];
          // A one-question step usually titles itself with that question. The
          // heading already asked it; asking again two lines down reads like a
          // mistake, so the label stays for screen readers and goes visually.
          const titleRepeats = step.fields.length === 1 && step.title === field.label;
          return (
            <div key={field.id}>
              <label
                htmlFor={field.id}
                className={cn("text-sm font-medium", titleRepeats && "sr-only")}
                id={`${field.id}-label`}
              >
                {field.label}
                {field.required ? <span aria-hidden="true"> *</span> : null}
              </label>
              {field.help ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{field.help}</p>
              ) : null}

              {field.choices ? (
                <div
                  role="group"
                  aria-labelledby={`${field.id}-label`}
                  className="mt-3 grid gap-2 sm:grid-cols-2"
                >
                  {field.choices.map((choice) => {
                    const multi = field.type === "multi_choice";
                    const selected = multi
                      ? Array.isArray(value) && value.includes(choice.id)
                      : value === choice.id;
                    return (
                      <button
                        key={choice.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleChoice(field.id, choice.id, multi)}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border p-3 text-left text-sm transition duration-150",
                          "hover:border-foreground/25 hover:bg-accent active:scale-[0.99]",
                          selected
                            ? "border-foreground/40 bg-accent shadow-[var(--shadow-inset)]"
                            : "border-border bg-card/40",
                        )}
                      >
                        {choice.iconSvg ? (
                          <span
                            aria-hidden="true"
                            className="flex size-5 shrink-0 items-center justify-center [&_svg]:size-full"
                            dangerouslySetInnerHTML={{ __html: choice.iconSvg }}
                          />
                        ) : choice.emoji ? (
                          <span aria-hidden="true">{choice.emoji}</span>
                        ) : null}
                        {choice.label}
                      </button>
                    );
                  })}
                </div>
              ) : field.type === "long_text" ? (
                <textarea
                  id={field.id}
                  rows={4}
                  value={typeof value === "string" ? value : ""}
                  placeholder={field.placeholder}
                  onChange={(event) => setValue(field.id, event.target.value)}
                  aria-invalid={Boolean(problem)}
                  className="mt-3 w-full rounded-xl border border-border bg-card/40 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              ) : field.type === "phone" ? (
                <div className="mt-3 flex gap-2">
                  <Select
                    value={phoneCountry[field.id] ?? countries[0]?.iso2 ?? "ar"}
                    onValueChange={(iso2) => setPhoneCountryFor(field.id, iso2)}
                  >
                    <SelectTrigger aria-label={t("common.country")} className="w-[4.5rem] shrink-0 justify-center px-2">
                      <span className="flex items-center gap-2">
                        {(() => {
                          const selectedIso = phoneCountry[field.id] ?? countries[0]?.iso2 ?? "ar";
                          const selected = countries.find((c) => c.iso2 === selectedIso) ?? countries[0];
                          return selected ? (
                            <img
                              src={selected.flag}
                              alt={selected.name}
                              className="h-4 w-6 rounded-[2px] object-cover"
                            />
                          ) : null;
                        })()}
                        <span className="sr-only">
                          <SelectValue />
                        </span>
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {countries.map((c) => (
                        <SelectItem key={c.iso2} value={c.iso2}>
                          <span className="flex items-center gap-2">
                            <img
                              src={c.flag}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className="h-3 w-[18px] rounded-[1px] object-cover"
                            />
                            <span>{c.dial}</span>
                            <span className="text-muted-foreground truncate">{c.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    id={field.id}
                    className="flex-1"
                    type="tel"
                    inputMode="tel"
                    value={phoneLocal[field.id] ?? ""}
                    placeholder={field.placeholder}
                    onChange={(event) => setPhoneLocalFor(field.id, event.target.value)}
                    aria-invalid={Boolean(problem)}
                  />
                </div>
              ) : (
                <Input
                  id={field.id}
                  className="mt-3"
                  type={field.type === "email" ? "email" : "text"}
                  value={typeof value === "string" ? value : ""}
                  placeholder={field.placeholder}
                  onChange={(event) => setValue(field.id, event.target.value)}
                  aria-invalid={Boolean(problem)}
                />
              )}

              {problem ? (
                <p role="alert" className="mt-1.5 text-xs text-destructive">
                  {problem}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {failed ? (
        <p role="alert" className="mt-4 text-xs text-destructive">
          {t("publicForm.failed")}
        </p>
      ) : null}

      <div className="mt-8 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          disabled={index === 0 || sending}
          onClick={() => setIndex((current) => Math.max(0, current - 1))}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.75} />
          {t("publicForm.back")}
        </Button>
        <Button onClick={() => void advance()} disabled={sending}>
          {sending ? t("publicForm.sending") : isLast ? t("publicForm.submit") : t("publicForm.next")}
          {!sending && !isLast ? (
            <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.75} />
          ) : null}
        </Button>
      </div>
    </Frame>
  );
}

/** The embedded frame: the builder's preview pane already sits inside a card,
 *  so a second bordered box around it would just be a box in a box. */
function Bare({ children }: { readonly children: React.ReactNode }) {
  return <div className="text-foreground">{children}</div>;
}

/** No sidebar, no nav, no product chrome: this page belongs to whoever is
 *  filling it in, not to the operator's dashboard. Same backdrop as /login —
 *  `.auth-grid` + `.auth-glow` — so a visitor bounced here from an ad and an
 *  operator signing in read as the same product. */
function Shell({ children }: { readonly children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-5 py-12 text-foreground">
      <div aria-hidden="true" className="auth-glow" />
      <div aria-hidden="true" className="auth-grid" />
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card/50 p-6 shadow-sm backdrop-blur-sm sm:p-8">
        {children}
      </div>
    </main>
  );
}

/** The completion screen: the check draws in, then the message follows a
 *  beat behind on the same transitions.dev stagger the rest of the app uses
 *  for a reveal. */
function ThankYou({ text }: { readonly text: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => el.classList.add("is-shown"));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="text-center">
      <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-[var(--status-success-bg)] text-[var(--status-success-fg)]">
        <SuccessCheck active className="text-2xl" />
      </span>
      <div ref={ref} className="t-stagger">
        <h1 className="t-stagger-line t-stagger-line--1 font-cooper text-xl">{text}</h1>
      </div>
    </div>
  );
}
