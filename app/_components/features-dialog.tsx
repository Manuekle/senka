"use client";

import { HugeiconsIcon, type IconSvgElement } from "@/components/icons/icon";
import {
  ArrowRight01Icon,
  Coins01Icon,
  InboxIcon,
  LibraryIcon,
  Megaphone01Icon,
  ChatSpark01Icon,
  ZapIcon,
} from "@hugeicons/core-free-icons";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * What the instance can do, shown once onboarding lands the account on the
 * dashboard.
 *
 * The rows the owner asked for come first and are marked; the rest follow, so
 * the panel is a map of the product rather than a receipt for the form. Every
 * row links to the page that actually does the thing — a feature tour whose
 * items are not reachable is a brochure.
 */
const FEATURES: readonly {
  readonly href: string;
  readonly icon: IconSvgElement;
  readonly id: string;
}[] = [
  { href: "/inbox", icon: InboxIcon, id: "inbox" },
  { href: "/ads", icon: Megaphone01Icon, id: "ads" },
  { href: "/automations", icon: ZapIcon, id: "automations" },
  { href: "/knowledge", icon: LibraryIcon, id: "knowledge" },
  { href: "/settings", icon: Coins01Icon, id: "commerce" },
];

export function FeaturesDialog({
  goals,
  onClose,
  open,
}: {
  readonly goals: readonly string[];
  readonly onClose: () => void;
  readonly open: boolean;
}) {
  const t = useT();

  // Chosen first, in the order the list already has, then the rest. A stable
  // sort so two runs with the same answers give the same panel.
  const ordered = [...FEATURES].sort(
    (a, b) => Number(goals.includes(b.id)) - Number(goals.includes(a.id)),
  );

  return (
    <Dialog onOpenChange={(next) => (next ? undefined : onClose())} open={open}>
      <DialogContent className="sm:max-w-[34rem]">
        <DialogHeader>
          <DialogTitle
            className="font-cooper text-[1.6rem] leading-tight tracking-[-0.02em]"
            icon={<HugeiconsIcon icon={ChatSpark01Icon} size={22} strokeWidth={1.75} />}
          >
            {t("onboarding.readyTitle")}
          </DialogTitle>
        </DialogHeader>

        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {t("onboarding.readyBody")}
        </p>

        <div className="mt-1 flex flex-col gap-1.5">
          {ordered.map((feature) => {
            const chosen = goals.includes(feature.id);
            return (
              <Link
                className={cn(
                  "group flex items-center gap-3 rounded-xl border px-4 py-3 transition duration-150",
                  chosen
                    ? "border-input bg-muted/60 shadow-[var(--shadow-inset)]"
                    : "border-border bg-card hover:border-input",
                )}
                href={feature.href}
                key={feature.id}
                onClick={onClose}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-xl",
                    chosen ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                  )}
                >
                  <HugeiconsIcon icon={feature.icon} size={16} strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-sm">
                    {t(`onboarding.feature.${feature.id}`)}
                  </span>
                  <span className="block text-muted-foreground text-xs leading-relaxed">
                    {t(`onboarding.featureBody.${feature.id}`)}
                  </span>
                </span>
                <HugeiconsIcon
                  className="shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5"
                  icon={ArrowRight01Icon}
                  size={15}
                  strokeWidth={2}
                />
              </Link>
            );
          })}
        </div>

        <DialogFooter>
          <Button className="w-full" onClick={onClose}>
            {t("onboarding.readyCta")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
