"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { KeyboardIcon } from "@hugeicons/core-free-icons";
import { useEffect, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogShortcut,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useModKey } from "@/lib/hooks/use-mod-key";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Every keyboard shortcut the app answers to, in one place.
 *
 * Discoverability is the accessibility problem shortcuts have: a keybinding
 * nobody can find is a feature that does not exist. The dialog opens from a
 * button in the sidebar's foot and from `?` anywhere in the app — guarded the
 * same way the calendar's own keys are, so it never steals a keystroke from
 * a field the user is typing in or from another open dialog.
 */
export function ShortcutsDialog({
  collapsed,
  showLabel = true,
  className,
}: {
  readonly collapsed?: boolean;
  readonly showLabel?: boolean;
  readonly className?: string;
}) {
  const t = useT();
  const mod = useModKey();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // `?` is shift+/ on most layouts, so checking the produced key covers
      // both; explicit modifiers here mean a real shortcut combo, not this.
      if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      // Inside another dialog, `?` belongs to that dialog's fields.
      if (document.querySelector("[role=dialog],[role=alertdialog]")) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label={t("shortcuts.open")}
              aria-keyshortcuts="Shift+Slash"
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground",
                "transition duration-150 hover:bg-accent hover:text-foreground",
                collapsed && "size-8 justify-center p-0",
                className,
              )}
            >
              <HugeiconsIcon icon={KeyboardIcon} size={14} strokeWidth={1.75} className="shrink-0" />
              {showLabel && !collapsed ? (
                <span className="flex flex-1 items-center justify-between gap-2">
                  {t("shortcuts.open")}
                  <DialogShortcut>?</DialogShortcut>
                </span>
              ) : null}
            </button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">{t("shortcuts.open")} · ?</TooltipContent>
      </Tooltip>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle icon={<HugeiconsIcon icon={KeyboardIcon} size={18} strokeWidth={1.75} />}>
            {t("shortcuts.title")}
          </DialogTitle>
          <DialogDescription>{t("shortcuts.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[min(24rem,60vh)] overflow-y-auto pr-1">
          <Group heading={t("shortcuts.everywhere")}>
            <Row label={t("shortcuts.palette")} keys={[`${mod}K`]} />
            <Row label={t("shortcuts.thisPanel")} keys={["?"]} />
          </Group>
          <Group heading={t("shortcuts.chat")}>
            <Row label={t("shortcuts.chatSend")} keys={["↵"]} />
            <Row label={t("shortcuts.chatNewline")} keys={["Shift ↵"]} />
          </Group>
          <Group heading={t("shortcuts.calendar")}>
            <Row label={t("shortcuts.calendarNav")} keys={["←", "→"]} />
            <Row label={t("shortcuts.calendarToday")} keys={["T"]} />
            <Row label={t("shortcuts.calendarNew")} keys={["N"]} />
            <Row label={t("shortcuts.calendarViews")} keys={["D", "W", "M"]} />
          </Group>
          <Group heading={t("shortcuts.crm")}>
            <Row label={t("shortcuts.crmMove")} keys={["Alt ↑", "Alt ↓"]} />
          </Group>
          <Group heading={t("shortcuts.templates")}>
            <Row label={t("shortcuts.templatesSave")} keys={[`${mod}S`]} />
          </Group>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Group({ heading, children }: { readonly heading: string; readonly children: ReactNode }) {
  return (
    <section>
      <p className="px-3 pb-1 pt-3 text-xs font-medium tracking-wide text-muted-foreground">{heading}</p>
      {children}
    </section>
  );
}

function Row({ label, keys }: { readonly label: string; readonly keys: readonly string[] }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg px-3 py-1.5 transition-colors hover:bg-accent/60">
      <span className="min-w-0 flex-1 text-sm">{label}</span>
      <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
        {keys.map((key) => (
          <DialogShortcut key={key}>{key}</DialogShortcut>
        ))}
      </span>
    </div>
  );
}
