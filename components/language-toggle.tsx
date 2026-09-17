"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { Globe02Icon } from "@hugeicons/core-free-icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppLocale } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

export function LanguageToggle({
  className,
  showLabel = true,
}: {
  readonly className?: string;
  readonly showLabel?: boolean;
}) {
  // `useAppLocale`, not `useI18n`: this control has to reflect and change the
  // visitor's real preference. Inside a subtree pinned by `I18nLocale` — the
  // marketing pages are — `useI18n().locale` is the pin's value, so the switch
  // read Spanish whatever the app was set to and only ever offered English.
  const { locale, setLocale } = useAppLocale();
  const nextLocale = locale === "es" ? "en" : "es";
  // Written in the language being switched TO, which is the convention every
  // language picker follows — the person reading it may not read the current one.
  const label = locale === "es" ? "Switch to English" : "Cambiar a Español";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => setLocale(nextLocale)}
          // Two languages, one switch — same cue as the theme control.
          data-cuelume-toggle
          className={cn(
            "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition duration-150 hover:bg-accent hover:text-foreground text-muted-foreground",
            !showLabel && "px-1.5 py-1",
            className,
          )}
          aria-label={label}
          type="button"
        >
          <HugeiconsIcon icon={Globe02Icon} size={14} strokeWidth={1.75} className="shrink-0" />
          {showLabel ? <span>{nextLocale === "es" ? "Español" : "English"}</span> : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
