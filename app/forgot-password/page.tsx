"use client";

import { AuthBackdrop } from "@/app/_components/auth-backdrop";
import { HugeiconsIcon } from "@/components/icons/icon";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Asks for an email, always ends the same way from the visitor's side.
 *
 * The API answers `{ ok: true }` whether or not the address has an account —
 * this page has to match that, or the confirmation screen itself would leak
 * what the response already refuses to.
 */
export default function ForgotPasswordPage() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError(t("auth.errorEmailInvalid"));
      return;
    }

    setBusy(true);
    setError(null);
    const response = await fetch("/api/auth/forgot-password", {
      body: JSON.stringify({ email: address }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }).catch(() => null);
    setBusy(false);

    if (!response) {
      setError(t("auth.errorNetwork"));
      return;
    }
    setSent(true);
  };

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6 py-16">
      {/* Backdrop, under everything and inert. */}
      <AuthBackdrop />

      <div className="relative w-full max-w-[25rem]">
        <h1 className="text-balance text-center font-cooper text-[2rem] leading-[1.08] tracking-[-0.03em]">
          {t("auth.forgotTitle")}
        </h1>
        <p className="mx-auto mt-3 max-w-[34ch] text-balance text-center text-[15px] leading-relaxed text-muted-foreground">
          {t("auth.forgotSubtitle")}
        </p>

        <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft),var(--shadow-inset)]">
          {sent ? (
            <p className="text-center text-[15px] leading-relaxed">{t("auth.forgotSent")}</p>
          ) : (
            <form className="flex flex-col gap-4" noValidate onSubmit={onSubmit}>
              <div className={cn("t-input-wrap flex flex-col gap-1.5", error && "is-error")}>
                <label className="font-medium text-sm" htmlFor="forgot-email">
                  {t("auth.email")}
                </label>
                <div className={cn("t-input rounded-xl", error && "is-error")}>
                  <Input
                    autoComplete="username"
                    autoFocus
                    id="forgot-email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={t("auth.emailPlaceholder")}
                    required
                    type="email"
                    value={email}
                  />
                </div>
                {error ? (
                  <p className="t-error-msg text-destructive text-xs" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>

              <Button className="mt-1 w-full" disabled={busy} type="submit">
                {t("auth.forgotSubmit")}
              </Button>
            </form>
          )}
        </div>

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
