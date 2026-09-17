"use client";

import { AuthBackdrop } from "@/app/_components/auth-backdrop";
import { HugeiconsIcon } from "@/components/icons/icon";
import { SenkaMark } from "@/components/icons/senka-mark";
import { ArrowLeft01Icon, EyeIcon, EyeOffIcon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { ThinkingText } from "@/components/motion/thinking-text";
import { GoogleLogo } from "@/components/provider-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n, useT } from "@/lib/i18n/provider";
import { LEGAL_LINKS } from "@/lib/legal";
import { PrivacyPreferencesButton } from "@/components/privacy-consent";
import { safeNextPath } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup";

/**
 * One page for both directions: signing in, and creating an account.
 *
 * Any number of people can share this instance, so this is a plain toggle —
 * not a one-time "claim this instance" gate. `mode` decides which of the two
 * forms shows; a link at the bottom of each flips to the other.
 */
function LoginForm() {
  const t = useT();
  const { locale } = useI18n();
  const router = useRouter();
  const params = useSearchParams();

  const justReset = params.get("reset") === "1";
  const googleNext = safeNextPath(params.get("next"), "");
  // Set only by /api/auth/google/callback, on the way back from Google.
  const googleError = params.get("error");
  const googleErrorMessage =
    googleError === "google_denied"
      ? null // Pressing Cancel on Google's own screen isn't an error worth a message.
      : googleError === "google_unconfigured"
        ? t("auth.errorGoogleUnconfigured")
        : googleError
          ? t("auth.errorGoogleFailed")
          : null;
  const [mode, setMode] = useState<Mode>(() => (params.get("mode") === "signup" ? "signup" : "signin"));
  const [needsInvite, setNeedsInvite] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [email, setEmail] = useState(() => params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirm?: string }>({});
  const [busy, setBusy] = useState(false);
  // Bumped on every failure so the effect below re-runs even when the same
  // field fails twice in a row.
  const [shake, setShake] = useState<{
    fields: readonly ("email" | "password" | "confirm")[];
    nonce: number;
  }>({ fields: [], nonce: 0 });
  const emailRef = useRef<HTMLDivElement>(null);
  const passwordRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const revertTimer = useRef<number | null>(null);

  /**
   * The shake runs in an effect, not inline in the submit handler.
   *
   * A CSS animation does not replay just because its class is already there,
   * so it has to come off, the layout be forced, and go back on. Doing that
   * imperatively during the handler does nothing visible: `setErrors` renders
   * immediately afterwards and React writes `className` back from the JSX,
   * taking `is-shaking` with it. Running it after the paint that added
   * `is-error` is the only ordering where both survive.
   */
  useEffect(() => {
    if (shake.nonce === 0) return;
    const refs = { confirm: confirmRef, email: emailRef, password: passwordRef };
    for (const field of shake.fields) {
      const el = refs[field].current;
      if (!el) continue;
      el.classList.remove("is-shaking");
      void el.offsetWidth;
      el.classList.add("is-shaking");
    }
  }, [shake]);

  // `--revert-hold` in the stylesheet is 3000ms; the border and the message
  // fade back on their own after it, so the state has to expire with them.
  const failWith = (next: { email?: string; password?: string; confirm?: string }) => {
    setErrors(next);
    setShake((current) => ({
      fields: Object.keys(next) as ("email" | "password" | "confirm")[],
      nonce: current.nonce + 1,
    }));
    if (revertTimer.current) window.clearTimeout(revertTimer.current);
    revertTimer.current = window.setTimeout(() => setErrors({}), 3000);
  };

  useEffect(
    () => () => {
      if (revertTimer.current) window.clearTimeout(revertTimer.current);
    },
    [],
  );

  // Whether this installation is accepting new accounts, and on what terms —
  // see lib/auth/signup-policy.ts. Only ever shapes the form; the register
  // route decides, and refuses a request that ignores this.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/state")
      .then((response) => (response.ok ? response.json() : null))
      .then((state: { signupNeedsInvite?: boolean } | null) => {
        if (!cancelled) setNeedsInvite(Boolean(state?.signupNeedsInvite));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
    setInviteCode("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  /**
   * The checks the browser used to make, made here so they land in the same
   * error state as a rejection from the server. Everything the reader can be
   * told before a round trip is told before one — a malformed address does not
   * need the network to be recognised.
   */
  const validate = (): { email?: string; password?: string; confirm?: string } | null => {
    const next: { email?: string; password?: string; confirm?: string } = {};
    const address = email.trim();
    if (!address) next.email = t("auth.errorEmailRequired");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) next.email = t("auth.errorEmailInvalid");

    if (!password) next.password = t("auth.errorPasswordRequired");
    // The length floor only applies to the password being created — an
    // existing one is whatever it already is.
    else if (mode === "signup" && password.length < 10) next.password = t("auth.errorWeak");

    if (mode === "signup" && !next.password && password !== confirmPassword) {
      next.confirm = t("auth.errorPasswordMismatch");
    }

    return Object.keys(next).length > 0 ? next : null;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const invalid = validate();
    if (invalid) {
      failWith(invalid);
      return;
    }

    setBusy(true);
    setErrors({});

    const response = await fetch(mode === "signin" ? "/api/auth/login" : "/api/auth/register", {
      body: JSON.stringify({ email, password, ...(inviteCode ? { inviteCode } : {}) }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }).catch(() => null);

    if (!response?.ok) {
      const code = ((await response?.json().catch(() => null)) as { error?: string } | null)?.error;
      if (!response) {
        failWith({ email: t("auth.errorNetwork") });
      } else if (code === "invalid") {
        failWith({ password: t("auth.errorWeak") });
      } else if (code === "invite_required") {
        failWith({ email: t("auth.errorInviteRequired") });
      } else if (code === "unavailable") {
        failWith({ email: t("auth.errorUnavailable") });
      } else if (code === "closed") {
        failWith({ email: t("auth.errorSignupClosed") });
      } else if (code === "rate_limited") {
        failWith({ email: t("apiError.rate_limited") });
      } else if (code === "email_exists") {
        // The natural recovery from "you already have an account" is to sign
        // in — flip there rather than leaving them stuck on a form that will
        // only ever refuse them.
        setMode("signin");
        failWith({ email: t("auth.errorClaimed") });
      } else {
        failWith({ email: " ", password: t("auth.errorCredentials") });
      }
      setBusy(false);
      return;
    }

    // `replace`, not `push`: signing in should not be a back-button away from
    // a signed-in session. `refresh` re-runs the middleware for the new cookie.
    //
    // A fresh signup goes to onboarding (which redirects itself straight back
    // if this instance's business profile is already set up); a returning
    // account goes wherever it was headed.
    router.replace(mode === "signin" ? safeNextPath(params.get("next"), "/chat") : "/onboarding");
    router.refresh();
  };

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6 py-16">
      {/* Backdrop, under everything and inert. */}
      <AuthBackdrop />

      <div className="relative w-full max-w-[25rem]">
        {/* The mark, in the same rounded tile the favicon uses, so the tab and
            the page agree. A padlock said "this is locked", which the heading
            says better and in words.

            Milled, like every other lockup in the product — the header, the
            sidebar, the footer. `inverted` because the tile runs against the
            page: it is `--foreground`, so the ramp the rest of them use would
            paint the mark in the tile's own value and lose it. */}
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-foreground shadow-[var(--shadow-soft)] p-1">
          <SenkaMark className="h-8 w-auto" metal="inverted" />
        </div>

        <h1 className="mt-7 text-balance text-center font-cooper text-[2rem] leading-[1.08] tracking-[-0.03em]">
          {mode === "signup" ? t("auth.claimTitle") : t("auth.title")}
        </h1>
        <p className="mx-auto mt-3 max-w-[34ch] text-balance text-center text-[15px] leading-relaxed text-muted-foreground">
          {mode === "signup" ? t("auth.claimSubtitle") : t("auth.subtitle")}
        </p>

        {justReset && mode === "signin" ? (
          <p className="mx-auto mt-4 max-w-[34ch] text-balance text-center text-[13px] text-muted-foreground">
            {t("auth.resetSuccess")}
          </p>
        ) : null}

        {googleErrorMessage ? (
          <p className="mx-auto mt-4 max-w-[34ch] text-balance text-center text-[13px] text-destructive">
            {googleErrorMessage}
          </p>
        ) : null}

        <Button asChild className="mt-8 w-full" variant="outline">
          <Link
            href={`/api/auth/google/start${googleNext ? `?next=${encodeURIComponent(googleNext)}` : ""}`}
          >
            <GoogleLogo size={16} />
            {t("auth.continueWithGoogle")}
          </Link>
        </Button>

        <div className="mt-6 flex items-center gap-3 text-[12px] text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          {t("auth.orDivider")}
          <span className="h-px flex-1 bg-border" />
        </div>

        <form
          className="mt-8 flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft),var(--shadow-inset)]"
          /* `noValidate` is the whole point of the custom error state. Left
             off, the browser gets there first: `required` and `type="email"`
             block the submit and raise a native bubble in the OS' own style
             and language, and the shake never runs because the handler is
             never called. The attributes stay for the keyboard and the
             autofill semantics — with `noValidate` they no longer block. */
          noValidate
          onSubmit={onSubmit}
        >
          {/* `t-input-wrap` owns the message reveal, `t-input` owns the
              border tween and the shake — the split the stylesheet expects,
              and the same one the inbox and settings forms use. */}
          <div className={cn("t-input-wrap flex flex-col gap-1.5", errors.email && "is-error")}>
            <label className="font-medium text-sm" htmlFor="auth-email">
              {t("auth.email")}
            </label>
            <div className={cn("t-input rounded-xl", errors.email && "is-error")} ref={emailRef}>
              <Input
                autoComplete="username"
                autoFocus={!email}
                id="auth-email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t("auth.emailPlaceholder")}
                required
                type="email"
                value={email}
              />
            </div>
            {errors.email?.trim() ? (
              <p className="t-error-msg text-destructive text-xs" role="alert">
                {errors.email}
              </p>
            ) : null}
          </div>

          <div className={cn("t-input-wrap flex flex-col gap-1.5", errors.password && "is-error")}>
            <label className="font-medium text-sm" htmlFor="auth-password">
              {t("auth.password")}
            </label>
            <div
              className={cn("t-input relative rounded-xl", errors.password && "is-error")}
              ref={passwordRef}
            >
              <Input
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                autoFocus={Boolean(email)}
                className="pr-9"
                id="auth-password"
                minLength={mode === "signup" ? 10 : undefined}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t("auth.passwordPlaceholder")}
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                className="absolute top-1/2 right-2 size-6 -translate-y-1/2 inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? t("settings.hide") : t("settings.show")}
                title={showPassword ? t("settings.hide") : t("settings.show")}
                type="button"
              >
                <span className="t-icon-swap" data-state={showPassword ? "b" : "a"}>
                  <span className="t-icon" data-icon="a">
                    <HugeiconsIcon icon={EyeIcon} size={16} strokeWidth={1.75} />
                  </span>
                  <span className="t-icon" data-icon="b">
                    <HugeiconsIcon icon={EyeOffIcon} size={16} strokeWidth={1.75} />
                  </span>
                </span>
              </button>
            </div>
            {errors.password?.trim() ? (
              <p className="t-error-msg text-destructive text-xs" role="alert">
                {errors.password}
              </p>
            ) : mode === "signup" ? (
              <span className="text-muted-foreground text-xs">{t("auth.passwordHint")}</span>
            ) : null}
          </div>

          {mode === "signup" ? (
            <div className={cn("t-input-wrap flex flex-col gap-1.5", errors.confirm && "is-error")}>
              <label className="font-medium text-sm" htmlFor="auth-confirm-password">
                {t("auth.confirmPassword")}
              </label>
              <div
                className={cn("t-input relative rounded-xl", errors.confirm && "is-error")}
                ref={confirmRef}
              >
                <Input
                  autoComplete="new-password"
                  className="pr-9"
                  id="auth-confirm-password"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder={t("auth.passwordPlaceholder")}
                  required
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                />
                <button
                  className="absolute top-1/2 right-2 size-6 -translate-y-1/2 inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  aria-label={showConfirmPassword ? t("settings.hide") : t("settings.show")}
                  title={showConfirmPassword ? t("settings.hide") : t("settings.show")}
                  type="button"
                >
                  <span className="t-icon-swap" data-state={showConfirmPassword ? "b" : "a"}>
                    <span className="t-icon" data-icon="a">
                      <HugeiconsIcon icon={EyeIcon} size={16} strokeWidth={1.75} />
                    </span>
                    <span className="t-icon" data-icon="b">
                      <HugeiconsIcon icon={EyeOffIcon} size={16} strokeWidth={1.75} />
                    </span>
                  </span>
                </button>
              </div>
              {errors.confirm?.trim() ? (
                <p className="t-error-msg text-destructive text-xs" role="alert">
                  {errors.confirm}
                </p>
              ) : null}
            </div>
          ) : null}

          {mode === "signup" && needsInvite ? (
            <div className="t-input-wrap flex flex-col gap-1.5">
              <label className="font-medium text-sm" htmlFor="auth-invite">
                {t("auth.inviteCode")}
              </label>
              <div className="t-input relative rounded-xl">
                <Input
                  autoComplete="off"
                  id="auth-invite"
                  onChange={(event) => setInviteCode(event.target.value)}
                  placeholder={t("auth.inviteCodePlaceholder")}
                  type="text"
                  value={inviteCode}
                />
              </div>
              <span className="text-muted-foreground text-xs">{t("auth.inviteCodeHint")}</span>
            </div>
          ) : null}

          {mode === "signin" ? (
            <Link
              className="-mt-1 self-end text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
              href="/forgot-password"
            >
              {t("auth.forgotPassword")}
            </Link>
          ) : null}

          <Button className="mt-1 w-full" disabled={busy} type="submit">
            {busy ? (
              /* The states are real stages of what the server is doing, not
                 three ways of saying "wait". The sizer inside holds the
                 longest one, so the button does not resize as they swap. */
              <ThinkingText
                states={
                  mode === "signin"
                    ? [t("auth.stepChecking"), t("auth.stepOpening")]
                    : [t("auth.stepHashing"), t("auth.stepWriting"), t("auth.stepOpening")]
                }
              />
            ) : mode === "signin" ? (
              t("auth.signIn")
            ) : (
              t("auth.claim")
            )}
          </Button>

          <button
            className="self-center text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
            onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
            type="button"
          >
            {mode === "signin" ? t("auth.toggleToSignup") : t("auth.toggleToSignin")}
          </button>
        </form>


        <nav aria-label={locale === "es" ? "Información legal y privacidad" : "Legal and privacy information"} className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {LEGAL_LINKS.map((link) => <Link key={link.href} href={link.href} className="lp-focus inline-flex min-h-6 items-center underline underline-offset-4">{link[locale]}</Link>)}
          <PrivacyPreferencesButton className="lp-focus min-h-11 underline underline-offset-4" />
        </nav>

        {/* Out to the marketing page, which is the only other thing someone
            who cannot get in can reach. `/`, not `history.back()`: an
            expired session lands here from a redirect, so "back" is the page
            that just bounced them. */}
        <div className="mt-6 flex justify-center">
          <Link
            className="group inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
            href="/"
          >
            <HugeiconsIcon
              className="transition-transform duration-200 ease-expo-out group-hover:-translate-x-0.5"
              icon={ArrowLeft01Icon}
              size={14}
              strokeWidth={2}
            />
            {t("auth.back")}
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  // `useSearchParams` needs one — the page is otherwise fully static.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
