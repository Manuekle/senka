"use client";

import Link from "next/link";
import { useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  CustomerSupportIcon,
  Book02Icon,
  Settings01Icon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  HelpCircleIcon,
} from "@hugeicons/core-free-icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHealth } from "@/lib/use-health";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

const DOCS_URL = "https://eve.dev/docs";

/**
 * Help, aimed at the person who has to unstick this instance rather than at a
 * generic FAQ: what the app can see about itself, where the framework docs
 * are, and a one-click diagnostic blob to paste into a support thread.
 */
export function SupportDialog({
  collapsed,
  showLabel = true,
  className,
}: {
  readonly collapsed?: boolean;
  readonly showLabel?: boolean;
  readonly className?: string;
}) {
  const t = useT();
  const { health, reachable } = useHealth();
  const [copied, setCopied] = useState(false);

  const copyDiagnostics = async () => {
    const payload = {
      status: reachable ? (health?.status ?? "unknown") : "unreachable",
      checks: health?.checks ?? null,
      environment: health?.environment ?? null,
      node: health?.node ?? null,
      uptimeSeconds: health?.uptimeSeconds ?? null,
      userAgent: navigator.userAgent,
      at: new Date().toISOString(),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the dialog still shows the status above.
    }
  };

  return (
    <Dialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label={t("support.open")}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground",
                "transition duration-150 hover:bg-accent hover:text-foreground",
                collapsed && "size-8 justify-center p-0",
                className,
              )}
            >
              <HugeiconsIcon icon={CustomerSupportIcon} size={14} strokeWidth={1.75} className="shrink-0" />
              {showLabel && !collapsed ? <span>{t("support.open")}</span> : null}
            </button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">{t("support.open")}</TooltipContent>
      </Tooltip>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle icon={<HugeiconsIcon icon={CustomerSupportIcon} size={18} strokeWidth={1.75} />}>
            {t("support.title")}
          </DialogTitle>
          <DialogDescription>{t("support.subtitle")}</DialogDescription>
        </DialogHeader>

        {/* What the instance says about itself, so the first question in any
            support thread is already answered. */}
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
          <p className="text-xs font-medium">{t("status.title")}</p>
          <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            <StatusLine ok={reachable && Boolean(health?.checks.store)} label={t("status.checkStore")} />
            <StatusLine ok={Boolean(health?.checks.ai)} label={t("status.checkAi")} />
            <StatusLine
              ok={(health?.checks.channels.connected ?? 0) > 0}
              label={`${t("status.checkChannels")}: ${health?.checks.channels.connected ?? 0}/${health?.checks.channels.total ?? 3}`}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
              <HugeiconsIcon icon={Book02Icon} size={15} strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t("support.docs")}</span>
              <span className="block text-xs text-muted-foreground">{t("support.docsHint")}</span>
            </span>
            <HugeiconsIcon
              icon={ExternalLinkIcon}
              size={14}
              strokeWidth={1.75}
              className="shrink-0 text-muted-foreground"
            />
          </a>

          <Link
            href="/help"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
              <HugeiconsIcon icon={HelpCircleIcon} size={15} strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t("support.help")}</span>
              <span className="block text-xs text-muted-foreground">{t("support.helpHint")}</span>
            </span>
          </Link>

          <Link
            href="/settings"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
              <HugeiconsIcon icon={Settings01Icon} size={15} strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t("support.settings")}</span>
              <span className="block text-xs text-muted-foreground">{t("support.settingsHint")}</span>
            </span>
          </Link>

          <button
            type="button"
            onClick={copyDiagnostics}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
              <HugeiconsIcon
                icon={copied ? CheckIcon : CopyIcon}
                size={15}
                strokeWidth={1.75}
                className={copied ? "text-emerald-500" : undefined}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">
                {copied ? t("support.copied") : t("support.copyDiagnostics")}
              </span>
              <span className="block text-xs text-muted-foreground">{t("support.copyHint")}</span>
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusLine({ ok, label }: { readonly ok: boolean; readonly label: string }) {
  return (
    <p className="flex items-center gap-2">
      <span className={cn("size-1.5 shrink-0 rounded-full", ok ? "bg-emerald-500" : "bg-amber-500")} />
      {label}
    </p>
  );
}
