"use client";

import { AuthBackdrop } from "@/app/_components/auth-backdrop";
import { HugeiconsIcon, type IconSvgElement } from "@/components/icons/icon";
import {
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Coins01Icon,
  LibraryIcon,
  Megaphone01Icon,
  ZapIcon,
} from "@hugeicons/core-free-icons";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CRMS, GOALS, INDUSTRIES, VOLUMES } from "@/lib/onboarding/options";
import { useAppLocale, useT } from "@/lib/i18n/provider";
import { countryOptions } from "@/lib/countries";
import { cn } from "@/lib/utils";

/**
 * Three questions between claiming the instance and using it.
 *
 * Every answer here does something, which is the only reason to ask it. The
 * language switches the app under the reader on the spot; the CRM writes its
 * API host into `HTTP_ALLOWLIST`, so `http_request` can reach it without the
 * owner going to find the hostname; the goals decide what the closing panel
 * puts first. Two are stored and nothing more — the volume and the test phone
 * — and they are marked that way in the store rather than dressed up.
 *
 * It is skippable from every step. An onboarding you cannot leave is a wall,
 * and this one stands between someone and the product they already installed.
 */

const STEPS = 3;

export default function OnboardingPage() {
  const t = useT();
  const router = useRouter();
  const { locale, setLocale } = useAppLocale();

  // Answered or skipped once is answered forever. Reaching this URL again
  // — a bookmark, a back button — should not put the form in front of someone
  // who is already using the product.
  useEffect(() => {
    void fetch("/api/onboarding")
      .then((response) => response.json())
      .then((state: { settled: boolean }) => {
        if (state.settled) router.replace("/dashboard");
      })
      .catch(() => null);
  }, [router]);

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  const [phone, setPhone] = useState("");
  const [countryIso, setCountryIso] = useState("ar");
  const countries = useMemo(() => countryOptions(locale), [locale]);
  const dialCode = countries.find((c) => c.iso2 === countryIso)?.dial ?? "+54";
  const [businessName, setBusinessName] = useState("");

  const [industry, setIndustry] = useState("");
  const [contactVolume, setContactVolume] = useState("");
  const [crm, setCrm] = useState("");
  const [goals, setGoals] = useState<string[]>([]);

  const toggleGoal = (goal: string) =>
    setGoals((current) =>
      current.includes(goal) ? current.filter((g) => g !== goal) : [...current, goal],
    );

  // The feature tour opens on the dashboard, not here — this page is gone by
  // then, and a dialog over a form the reader just finished reads as one more
  // step rather than as arriving. `goals` rides along in the query string so
  // the dashboard can order the tour without a second round trip.
  const finish = async () => {
    setBusy(true);
    const fullPhone = phone.trim() ? (phone.trim().startsWith("+") ? phone.trim() : `${dialCode}${phone.trim().replace(/^0+/, "")}`) : "";
    await fetch("/api/onboarding", {
      body: JSON.stringify({ businessName, contactVolume, crm, goals, industry, phone: fullPhone }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }).catch(() => null);
    const search = new URLSearchParams({ onboarded: "1" });
    if (goals.length > 0) search.set("goals", goals.join(","));
    router.replace(`/dashboard?${search.toString()}`);
    router.refresh();
  };

  const leave = async () => {
    await fetch("/api/onboarding", {
      body: JSON.stringify({ skip: true }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }).catch(() => null);
    router.replace("/dashboard");
    router.refresh();
  };

  // Each step names what it needs. Nothing is required except the two answers
  // that drive something — a business with no CRM should not be stuck here.
  const canAdvance =
    step === 1 ? true : step === 2 ? businessName.trim().length > 0 && industry !== "" : true;

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6 py-16">
      {/* Backdrop, under everything and inert. */}
      <AuthBackdrop />

      <div className="relative w-full max-w-[34rem]">
        <p className="text-center font-mono text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
          {t("onboarding.step", { current: String(step), total: String(STEPS) })}
        </p>
        <h1 className="mt-4 text-balance text-center font-cooper text-[2rem] leading-[1.08] tracking-[-0.03em]">
          {t("onboarding.title")}
        </h1>
        <p className="mx-auto mt-3 max-w-[42ch] text-balance text-center text-[15px] leading-relaxed text-muted-foreground">
          {t("onboarding.subtitle")}
        </p>

        {/* A track, not a row of dots: three dots at this size read as an
            ellipsis rather than as progress. */}
        <div className="mx-auto mt-7 flex max-w-[18rem] gap-1.5" aria-hidden="true">
          {Array.from({ length: STEPS }, (_, i) => (
            <span
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-300",
                i < step ? "bg-foreground/60" : "bg-muted",
              )}
              key={i}
            />
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft),var(--shadow-inset)] sm:p-7">
          {step === 1 ? (
            <>
              {/* Applied on click, not on submit. A language picker that
                  waits until the end of a form is a language picker you
                  cannot tell you got right. */}
              <Field group label={t("onboarding.language")}>
                {({ labelId }) => (
                  <div aria-labelledby={labelId} className="grid grid-cols-2 gap-2" role="group">
                    {(["es", "en"] as const).map((option) => (
                      <Choice
                        key={option}
                        onClick={() => setLocale(option)}
                        selected={locale === option}
                      >
                        {option === "es" ? "Español" : "English"}
                      </Choice>
                    ))}
                  </div>
                )}
              </Field>

              <Field hint={t("onboarding.phoneHint")} label={t("onboarding.phone")}>
                {({ controlId, describedBy }) => (
                <div className="flex gap-2">
                  {/* Two controls, one label: the number owns it, and the
                      country code carries its own name instead of stealing it. */}
                  <Select onValueChange={setCountryIso} value={countryIso}>
                    <SelectTrigger aria-label={t("common.country")} className="w-[9rem] shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {countries.map((c) => (
                        <SelectItem key={c.iso2} value={c.iso2}>
                          {c.dial} {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    aria-describedby={describedBy}
                    id={controlId}
                    inputMode="tel"
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="11 5555 5555"
                    value={phone}
                    className="flex-1"
                  />
                </div>
                )}
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Field label={t("onboarding.business")}>
                {({ controlId }) => (
                  <Input
                    autoFocus
                    id={controlId}
                    onChange={(event) => setBusinessName(event.target.value)}
                    value={businessName}
                  />
                )}
              </Field>

              <Field label={t("onboarding.industry")}>
                {({ controlId, labelId }) => (
                <Select onValueChange={setIndustry} value={industry}>
                  {/* Both ids: the label names it, the trigger's own text says
                      what is currently picked. Naming it with the label alone
                      would drop the selected value from the announcement. */}
                  <SelectTrigger aria-labelledby={`${labelId} ${controlId}`} className="w-full" id={controlId}>
                    <SelectValue placeholder={t("onboarding.choose")} />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((id) => (
                      <SelectItem key={id} value={id}>
                        {t(`onboarding.industry.${id}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                )}
              </Field>

              <Field group label={t("onboarding.volume")}>
                {({ labelId }) => (
                  <div aria-labelledby={labelId} className="flex flex-wrap gap-2" role="group">
                    {VOLUMES.map((value) => (
                      <Choice
                        key={value}
                        onClick={() => setContactVolume(value)}
                        selected={contactVolume === value}
                      >
                        {value}
                      </Choice>
                    ))}
                  </div>
                )}
              </Field>

              <Field hint={t("onboarding.crmHint")} label={t("onboarding.crm")}>
                {({ controlId, describedBy, labelId }) => (
                <Select onValueChange={setCrm} value={crm}>
                  <SelectTrigger
                    aria-describedby={describedBy}
                    aria-labelledby={`${labelId} ${controlId}`}
                    className="w-full"
                    id={controlId}
                  >
                    <SelectValue placeholder={t("onboarding.choose")} />
                  </SelectTrigger>
                  <SelectContent>
                    {CRMS.map(({ id }) => (
                      <SelectItem key={id} value={id}>
                        {t(`onboarding.crm.${id}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                )}
              </Field>
            </>
          ) : null}

          {step === 3 ? (
            <Field group hint={t("onboarding.goalsHint")} label={t("onboarding.goals")}>
              {({ labelId }) => (
              <div aria-labelledby={labelId} className="flex flex-col gap-2" role="group">
                {GOALS.map((goal) => (
                  <Choice
                    className="justify-start text-left"
                    key={goal}
                    onClick={() => toggleGoal(goal)}
                    selected={goals.includes(goal)}
                  >
                    <HugeiconsIcon
                      className={cn("shrink-0", goals.includes(goal) ? "" : "opacity-40")}
                      icon={GOAL_ICONS[goal]}
                      size={16}
                      strokeWidth={1.75}
                    />
                    {t(`onboarding.goal.${goal}`)}
                  </Choice>
                ))}
              </div>
              )}
            </Field>
          ) : null}

          <div className="mt-1 flex items-center gap-3">
            {step > 1 ? (
              <Button onClick={() => setStep(step - 1)} type="button" variant="outline">
                {t("onboarding.back")}
              </Button>
            ) : null}
            <Button
              className="flex-1"
              disabled={!canAdvance || busy}
              onClick={() => (step === STEPS ? void finish() : setStep(step + 1))}
              type="button"
            >
              {step === STEPS ? t("onboarding.finish") : t("onboarding.next")}
              <HugeiconsIcon icon={ArrowRight01Icon} size={15} strokeWidth={2} />
            </Button>
          </div>
        </div>

        <div className="mt-6 flex justify-center">
          <button
            className="rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
            onClick={() => void leave()}
            type="button"
          >
            {t("onboarding.skip")}
          </button>
        </div>
      </div>
    </main>
  );
}

const GOAL_ICONS: Record<string, IconSvgElement> = {
  ads: Megaphone01Icon,
  automations: ZapIcon,
  commerce: Coins01Icon,
  inbox: CheckmarkCircle02Icon,
  knowledge: LibraryIcon,
};

/**
 * A labelled field.
 *
 * The label used to be a `<span>`, which meant every control on this screen —
 * the first one anybody sees after paying — had no accessible name at all. A
 * screen reader announced "edit, blank", and clicking the label focused
 * nothing.
 *
 * One `htmlFor` could not fix it, because the four shapes here need different
 * wiring: a native `<Input>` takes `id`; a Radix `<Select>` is a button, so its
 * trigger takes `aria-labelledby`; a row of `Choice` buttons is a group, named
 * by `aria-labelledby` on the group; and the phone row is a Select and an Input
 * side by side, where only one of them can own the label. So the ids are handed
 * to the caller instead of guessed at.
 */
function Field({
  children,
  group = false,
  hint,
  label,
}: {
  readonly children: (ids: {
    readonly controlId: string;
    readonly describedBy: string | undefined;
    readonly labelId: string;
  }) => React.ReactNode;
  /** True when the children are a set of controls rather than one. A `<label
   *  for>` may only point at a labelable element, and a row of buttons has no
   *  single one to point at — so the label becomes a plain span and the caller
   *  names its own `role="group"` with `aria-labelledby={labelId}`. */
  readonly group?: boolean;
  readonly hint?: string;
  readonly label: string;
}) {
  const base = useId();
  const controlId = `${base}-control`;
  const labelId = `${base}-label`;
  const hintId = `${base}-hint`;
  const ids = { controlId, describedBy: hint ? hintId : undefined, labelId };

  return (
    <div className="flex flex-col gap-1.5">
      {group ? (
        <span className="font-medium text-sm" id={labelId}>
          {label}
        </span>
      ) : (
        <label className="font-medium text-sm" htmlFor={controlId} id={labelId}>
          {label}
        </label>
      )}
      {children(ids)}
      {hint ? (
        <span className="text-muted-foreground text-xs" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** A pressable option. The app has no radio or checkbox primitive, and a row
 *  of these reads better at this size than either would. */
function Choice({
  children,
  className,
  onClick,
  selected,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly onClick: () => void;
  readonly selected: boolean;
}) {
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2 font-medium text-sm transition duration-150",
        selected
          ? "border-input bg-muted text-foreground shadow-[var(--shadow-inset)]"
          : "border-border bg-card text-muted-foreground hover:border-input hover:text-foreground",
        className,
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
