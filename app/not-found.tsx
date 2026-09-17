"use client";

// A 404 is a page a person reads, not a status code. It renders inside the
// root layout, so the locale provider is available and both languages get the
// same sentence — which is why this is a client component.

import Link from "next/link";
import { HugeiconsIcon } from "@/components/icons/icon";
import { FileXIcon, ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { useT } from "@/lib/i18n/provider";

export default function NotFound() {
  const t = useT();

  const handleBack = () => {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) window.history.back();
    else window.location.href = "/";
  };

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-6 bg-background px-4 text-center text-foreground">
      <div className="flex flex-col items-center gap-4">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
          <HugeiconsIcon icon={FileXIcon} size={24} strokeWidth={1.75} />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">{t("notFound.title")}</h1>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            {t("notFound.description")}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background shadow-[var(--shadow-soft)] transition duration-150 hover:opacity-90 active:translate-y-px"
        >
          {t("notFound.home")}
        </Link>
        <button
          onClick={handleBack}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground shadow-[var(--shadow-inset)] transition duration-150 hover:border-input hover:bg-accent active:translate-y-px"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.75} />
          {t("notFound.back")}
        </button>
      </div>
    </div>
  );
}
