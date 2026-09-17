"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@/components/icons/icon";
import {
  BellIcon,
  UserIcon,
  Timer01Icon,
  ZapIcon,
  AiReplaceIcon,
  CheckIcon,
} from "@hugeicons/core-free-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NotificationBadge } from "@/components/ai-elements/notification-badge";
import { usePolling } from "@/lib/use-polling";
import { useHealth } from "@/lib/use-health";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import type { Automation, Contact, Reminder } from "@/lib/types";

type Item = {
  readonly id: string;
  readonly icon: IconSvgElement;
  readonly label: string;
  readonly hint?: string;
  readonly count?: number;
  readonly href: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The one place the app tells you something needs doing.
 *
 * It reports state that already exists rather than keeping a feed of its own:
 * contacts parked waiting for a human, reminders about to fire, automations
 * still unpublished, and the missing model key that would stop all of it.
 */
export function SidebarNotifications({
  collapsed,
  showLabel = true,
  className,
}: {
  readonly collapsed?: boolean;
  readonly showLabel?: boolean;
  readonly className?: string;
}) {
  const t = useT();
  const { health } = useHealth();
  const [waiting, setWaiting] = useState(0);
  const [dueSoon, setDueSoon] = useState(0);
  const [drafts, setDrafts] = useState(0);

  const load = useCallback(async () => {
    // `r.ok` matters here: an error body parses as JSON just fine, and its
    // missing `contacts` key would quietly render as a count of zero — the
    // badge would say "nothing waiting" when the truth is "we don't know".
    const ok = <T,>(r: Response): Promise<T> =>
      r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(String(r.status)));

    const [contacts, reminders, automations] = await Promise.allSettled([
      fetch("/api/contacts").then((r) => ok<{ contacts?: Contact[] }>(r)),
      fetch("/api/reminders").then((r) => ok<{ reminders?: Reminder[] }>(r)),
      fetch("/api/automations").then((r) => ok<{ automations?: Automation[] }>(r)),
    ]);

    if (contacts.status === "fulfilled") {
      setWaiting(
        (contacts.value.contacts ?? []).filter(
          (c) => c.status === "waiting_human" || c.status === "followup_due",
        ).length,
      );
    }
    if (reminders.status === "fulfilled") {
      const horizon = Date.now() + DAY_MS;
      setDueSoon(
        (reminders.value.reminders ?? []).filter(
          (r) => r.status === "pending" && new Date(r.datetime).getTime() <= horizon,
        ).length,
      );
    }
    if (automations.status === "fulfilled") {
      setDrafts((automations.value.automations ?? []).filter((a) => a.status === "draft").length);
    }
  }, []);

  usePolling(load, 60_000);

  const items: Item[] = [];
  if (health && !health.checks.ai) {
    items.push({
      id: "ai",
      icon: AiReplaceIcon,
      label: t("notifications.missingKey"),
      hint: t("notifications.missingKeyHint"),
      href: "/settings",
    });
  }
  if (waiting > 0) {
    items.push({ id: "waiting", icon: UserIcon, label: t("notifications.waiting"), count: waiting, href: "/inbox" });
  }
  if (dueSoon > 0) {
    items.push({ id: "due", icon: Timer01Icon, label: t("notifications.remindersDue"), count: dueSoon, href: "/reminders" });
  }
  if (drafts > 0) {
    items.push({ id: "drafts", icon: ZapIcon, label: t("notifications.drafts"), count: drafts, href: "/automations" });
  }

  const total = items.reduce((sum, item) => sum + (item.count ?? 1), 0);

  const trigger = (
    <button
      type="button"
      aria-label={t("notifications.title")}
      className={cn(
        "relative flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground",
        "transition duration-150 hover:bg-accent hover:text-foreground",
        collapsed && "size-8 justify-center p-0",
        className,
      )}
    >
      <HugeiconsIcon icon={BellIcon} size={14} strokeWidth={1.75} className="shrink-0" />
      {showLabel && !collapsed ? <span>{t("notifications.title")}</span> : null}
      {total > 0 ? <NotificationBadge count={total} /> : null}
    </button>
  );

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">{t("notifications.title")}</TooltipContent>
      </Tooltip>
      {/* Opens upward from the foot of the sidebar and lines its left edge up
          with the trigger's, so the panel reads as attached to the row you
          clicked. Anchored to the right it floated over the page with nothing
          lining up. */}
      <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-[320px] p-2">
        <p className="px-2 pt-1 pb-2 text-xs font-medium">{t("notifications.title")}</p>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-3 py-6 text-center">
            <HugeiconsIcon
              icon={CheckIcon}
              size={18}
              strokeWidth={1.75}
              className="text-emerald-500"
            />
            <p className="text-xs font-medium">{t("notifications.empty")}</p>
            <p className="text-[11px] text-muted-foreground">{t("notifications.emptyHint")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-accent"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <HugeiconsIcon icon={item.icon} size={14} strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs leading-5 font-medium">{item.label}</span>
                  {item.hint ? (
                    <span className="block truncate text-[11px] leading-4 text-muted-foreground">
                      {item.hint}
                    </span>
                  ) : null}
                </span>
                {/* A fixed box, not padded text: counts of one and two digits
                    have to end at the same right edge down the list. */}
                {item.count ? (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-muted px-1 text-[11px] font-medium tabular-nums">
                    {item.count}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
