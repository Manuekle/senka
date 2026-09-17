"use client";

import { AuthBackdrop } from "@/app/_components/auth-backdrop";
import { HugeiconsIcon } from "@/components/icons/icon";
import { ArrowLeft01Icon, EyeIcon, EyeOffIcon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

function ResetPasswordForm() {
  const t = useT();
  const router = useRouter();
  const token = useSearchParams().get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;

    const next: { password?: string; confirm?: string } = {};
    if (password.length < 10) next.password = t("auth.errorWeak");
    else if (password !== confirm) next.confirm = t("auth.errorPasswordMismatch");
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    setBusy(true);
    setErrors({});
    const response = await fetch("/api/auth/reset-password", {
      body: JSON.stringify({ token, password }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }).catch(() => null);

    if (!response?.ok) {
      setBusy(false);
      if (!response) setErrors({ password: t("auth.errorNetwork") });
      else setExpired(true);
      return;
    }

    router.replace("/login?reset=1");
  };

  if (!token) {
    return (
      <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-center shadow-[var(--shadow-soft),var(--shadow-inset)]">
        <p className="text-[15px] leading-relaxed">{t("auth.resetInvalidLink")}</p>
        <Link className="mt-4 inline-block text-[13px] text-foreground underline" href="/forgot-password">
          {t("auth.forgotTitle")}
        </Link>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-center shadow-[var(--shadow-soft),var(--shadow-inset)]">
        <p className="text-[15px] leading-relaxed">{t("auth.resetExpired")}</p>
        <Link className="mt-4 inline-block text-[13px] text-foreground underline" href="/forgot-password">
          {t("auth.forgotTitle")}
        </Link>
      </div>
    );
  }

  return (
    <form
      className="mt-8 flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft),var(--shadow-inset)]"
      noValidate
      onSubmit={onSubmit}
    >
      <div className={cn("t-input-wrap flex flex-col gap-1.5", errors.password && "is-error")}>
        <label className="font-medium text-sm" htmlFor="reset-password">
          {t("auth.newPassword")}
        </label>
        <div className={cn("t-input relative rounded-xl", errors.password && "is-error")}>
          <Input
            autoComplete="new-password"
            autoFocus
            className="pr-9"
            id="reset-password"
            minLength={10}
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
        ) : (
          <span className="text-muted-foreground text-xs">{t("auth.passwordHint")}</span>
        )}
      </div>

      <div className={cn("t-input-wrap flex flex-col gap-1.5", errors.confirm && "is-error")}>
        <label className="font-medium text-sm" htmlFor="reset-confirm">
          {t("auth.confirmPassword")}
        </label>
        <div className={cn("t-input relative rounded-xl", errors.confirm && "is-error")}>
          <Input
            autoComplete="new-password"
            className="pr-9"
            id="reset-confirm"
            onChange={(event) => setConfirm(event.target.value)}
            placeholder={t("auth.passwordPlaceholder")}
            required
            type={showConfirm ? "text" : "password"}
            value={confirm}
          />
          <button
            className="absolute top-1/2 right-2 size-6 -translate-y-1/2 inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setShowConfirm((current) => !current)}
            aria-label={showConfirm ? t("settings.hide") : t("settings.show")}
            title={showConfirm ? t("settings.hide") : t("settings.show")}
            type="button"
          >
            <span className="t-icon-swap" data-state={showConfirm ? "b" : "a"}>
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

      <Button className="mt-1 w-full" disabled={busy} type="submit">
        {t("auth.resetSubmit")}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const t = useT();
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6 py-16">
      {/* Backdrop, under everything and inert. */}
      <AuthBackdrop />

      <div className="relative w-full max-w-[25rem]">
        <h1 className="text-balance text-center font-cooper text-[2rem] leading-[1.08] tracking-[-0.03em]">
          {t("auth.resetTitle")}
        </h1>
        <p className="mx-auto mt-3 max-w-[34ch] text-balance text-center text-[15px] leading-relaxed text-muted-foreground">
          {t("auth.resetSubtitle")}
        </p>

        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>

        <div className="mt-6 flex justify-center">
          <Link
            className="group inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
            href="/login"
          >
            <HugeiconsIcon
              className="transition-transform duration-200 ease-expo-out group-hover:-translate-x-0.5"
              icon={ArrowLeft01Icon}
              size={14}
              strokeWidth={2}
            />
            {t("auth.signIn")}
          </Link>
        </div>
      </div>
    </main>
  );
}
