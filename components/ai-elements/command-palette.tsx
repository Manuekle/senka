"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  SearchIcon,
  Add01Icon,
  ZapIcon,
  AiImagineIcon,
  Moon02Icon,
  VolumeHighIcon,
  Globe02Icon,
  CustomerSupportIcon,
} from "@hugeicons/core-free-icons";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/components/theme-provider";
import { useSound } from "@/components/sound-provider";
import { NAV_GROUPS } from "@/lib/nav-items";
import { useI18n, useAppLocale } from "@/lib/i18n/provider";
import { useModKey } from "@/lib/hooks/use-mod-key";
import { cn } from "@/lib/utils";

/**
 * ⌘K over the whole app: every page in the sidebar, the three "new …" actions,
 * and the preferences that otherwise live only in the sidebar's foot.
 *
 * The pages come from the same `NAV_GROUPS` the sidebar renders, so a route
 * added there shows up here without anyone remembering to add it twice.
 */
export function CommandPalette({
  collapsed,
  className,
  onOpenSupport,
}: {
  readonly collapsed?: boolean;
  readonly className?: string;
  /** Optional: lets the palette hand off to the support dialog. */
  readonly onOpenSupport?: () => void;
}) {
  const { t } = useI18n();
  // The language row reads the visitor's preference past any `I18nLocale` pin,
  // for the reason spelled out in `language-toggle.tsx`. The palette only
  // mounts inside `AppShell`, which is not pinned, so this is not a live bug —
  // it is the same trap one import away from being one.
  const { locale, setLocale } = useAppLocale();
  const router = useRouter();
  const { toggleTheme } = useTheme();
  const { enabled: soundEnabled, setEnabled: setSoundEnabled } = useSound();
  const mod = useModKey();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return;
      // Otherwise ⌘K opens the browser's own search bar in some setups.
      event.preventDefault();
      setOpen((prev) => !prev);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /** Every item closes the dialog first: running the action under an open
   *  overlay leaves the page unreachable behind it. */
  const run = useCallback((action: () => void) => {
    setOpen(false);
    action();
  }, []);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t("nav.search")}
            aria-keyshortcuts="Meta+K Control+K"
            className={cn(
              "flex items-center rounded-lg border border-border bg-card/60 text-xs text-muted-foreground",
              "transition-colors duration-150 hover:border-input hover:bg-accent hover:text-foreground",
              collapsed ? "size-8 justify-center" : "w-full gap-2 px-2.5 py-2",
              className,
            )}
          >
            <HugeiconsIcon icon={SearchIcon} size={14} strokeWidth={1.75} className="shrink-0" />
            {collapsed ? null : (
              <>
                <span className="flex-1 text-left">{t("nav.search")}</span>
                <kbd
                  aria-hidden="true"
                  className="rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground"
                >
                  {mod}K
                </kbd>
              </>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{t("nav.search")} · {mod}K</TooltipContent>
      </Tooltip>

      <CommandDialog
        className="rounded-[18px] border-border/70 bg-muted/50 p-0 shadow-[var(--shadow-float)] [&_[data-slot=command]]:rounded-none [&_[data-slot=command]]:border-0 [&_[data-slot=command]]:bg-transparent [&_[data-slot=command]]:shadow-none [&_[data-slot=command-input-wrapper]]:mx-2 [&_[data-slot=command-input-wrapper]]:mt-1.5 [&_[data-slot=command-input-wrapper]]:h-10 [&_[data-slot=command-input-wrapper]]:rounded-lg [&_[data-slot=command-input-wrapper]]:border-0 [&_[data-slot=command-input-wrapper]]:bg-transparent [&_[data-slot=command-input-wrapper]]:px-0 [&_[cmdk-input]]:!h-10 [&_[cmdk-group]]:p-0 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2"
        closeClassName="top-3"
        open={open}
        onOpenChange={setOpen}
        title={t("nav.search")}
        description={t("palette.placeholder")}
      >
        <CommandInput placeholder={t("palette.placeholder")} />
        <CommandList className="mx-2 mb-2 py-[0.5em] max-h-[min(24rem,60vh)] rounded-[12px] border border-border bg-card">
          <CommandEmpty>{t("palette.empty")}</CommandEmpty>

          <CommandGroup heading={t("palette.navigation")}>
            {NAV_GROUPS.flatMap((group) => group.items).map((item) => (
              <CommandItem
                key={item.href}
                value={`${t(item.labelKey)} ${item.href}`}
                onSelect={() => run(() => router.push(item.href))}
              >
                <HugeiconsIcon icon={item.icon} size={16} strokeWidth={1.75} />
                {t(item.labelKey)}
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandGroup heading={t("palette.actions")}>
            <CommandItem value={t("nav.newChat")} onSelect={() => run(() => router.push("/"))}>
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
              {t("nav.newChat")}
              <CommandShortcut>{mod}K</CommandShortcut>
            </CommandItem>
            <CommandItem
              value={t("palette.newAutomation")}
              onSelect={() => run(() => router.push("/automations"))}
            >
              <HugeiconsIcon icon={ZapIcon} size={16} strokeWidth={1.75} />
              {t("palette.newAutomation")}
            </CommandItem>
            <CommandItem value={t("palette.newAgent")} onSelect={() => run(() => router.push("/agents"))}>
              <HugeiconsIcon icon={AiImagineIcon} size={16} strokeWidth={1.75} />
              {t("palette.newAgent")}
            </CommandItem>
            {onOpenSupport ? (
              <CommandItem value={t("palette.support")} onSelect={() => run(onOpenSupport)}>
                <HugeiconsIcon icon={CustomerSupportIcon} size={16} strokeWidth={1.75} />
                {t("palette.support")}
              </CommandItem>
            ) : null}
          </CommandGroup>

          <CommandGroup heading={t("palette.preferences")}>
            <CommandItem value={t("palette.toggleTheme")} onSelect={() => run(toggleTheme)}>
              <HugeiconsIcon icon={Moon02Icon} size={16} strokeWidth={1.75} />
              {t("palette.toggleTheme")}
            </CommandItem>
            <CommandItem
              value={t("palette.toggleSound")}
              onSelect={() => run(() => setSoundEnabled(!soundEnabled))}
            >
              <HugeiconsIcon icon={VolumeHighIcon} size={16} strokeWidth={1.75} />
              {t("palette.toggleSound")}
              <CommandShortcut>{t(soundEnabled ? "sound.on" : "sound.off")}</CommandShortcut>
            </CommandItem>
            <CommandItem
              value={t("palette.toggleLanguage")}
              onSelect={() => run(() => setLocale(locale === "es" ? "en" : "es"))}
            >
              <HugeiconsIcon icon={Globe02Icon} size={16} strokeWidth={1.75} />
              {t("palette.toggleLanguage")}
              <CommandShortcut>{locale === "es" ? "EN" : "ES"}</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
