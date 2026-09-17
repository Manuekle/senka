"use client";

import { useEffect } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { RotateCwIcon, ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { useT } from "@/lib/i18n/provider";

export default function Error({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  const handleBack = () => {
    if (typeof window !== "undefined") {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = "/";
      }
    }
  };

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-6 bg-background px-4 text-center text-foreground">
      <div className="flex flex-col items-center gap-4">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
          <HugeiconsIcon icon={RotateCwIcon} size={24} strokeWidth={1.75} />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">{t("error.title")}</h1>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            {t("error.description")}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={reset}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background shadow-[var(--shadow-soft)] transition duration-150 hover:opacity-90 active:translate-y-px"
        >
          <HugeiconsIcon icon={RotateCwIcon} size={16} strokeWidth={1.75} />
          {t("error.reload")}
        </button>
        <button
          onClick={handleBack}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground shadow-[var(--shadow-inset)] transition duration-150 hover:border-input hover:bg-accent active:translate-y-px"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.75} />
          {t("error.back")}
        </button>
      </div>
    </div>
  );
}
