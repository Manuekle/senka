"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@/components/icons/icon";
import { ArrowRight01Icon, Coins01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { SkeletonBar } from "@/components/ai-elements/skeleton";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

// Account → AI credits at a glance: what is left this period, how long the
// period still runs, and one way forward. The breakdown by provider, agent
// and channel stays on Settings → AI Usage; this card only answers "am I
// about to run out".

type BalanceResponse =
  | { readonly metered: true; readonly unlimited: true; readonly plan: "enterprise" }
  | {
      readonly metered: true;
      readonly unlimited: false;
      readonly plan: string;
      readonly balance: number;
      readonly monthlyAllocation: number;
      readonly usedThisPeriod: number;
      readonly periodStart: string | null;
      readonly periodEnd: string | null;
      readonly hasIncludedCredits: boolean;
    };

const DAY_MS = 86_400_000;

/** Below this share of the allocation left, the bar turns amber and the copy
 *  suggests upgrading; below the second, it turns red. */
const LOW_PERCENT = 30;
const CRITICAL_PERCENT = 10;

function daysLeft(periodEnd: string | null): number | null {
  if (!periodEnd) return null;
  const ms = new Date(periodEnd).getTime() - Date.now();
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / DAY_MS)) : null;
}

export function CreditsOverviewCard() {
  const { locale, t } = useI18n();
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [error, setError] = useState<UiError | null>(null);

  const load = useCallback(async () => {
    const result = await fetchJson<BalanceResponse>("/api/credits/balance", t);
    if (result.ok) {
      setBalance(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const intlLocale = locale === "es" ? "es-AR" : "en-US";
  const formatCredits = (n: number) =>
    new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 0 }).format(Math.round(n));

  let body: ReactNode;
  let action: ReactNode = null;

  if (error) {
    body = <ErrorBanner error={error} onRetry={() => void load()} />;
  } else if (!balance) {
    body = (
      <div className="space-y-3">
        <div className="flex items-end justify-between">
          <SkeletonBar className="h-7 w-32" />
          <SkeletonBar className="h-4 w-24" />
        </div>
        <SkeletonBar className="h-4 w-full rounded-full" />
        <SkeletonBar className="h-3 w-56" />
      </div>
    );
  } else if (balance.unlimited) {
    body = <p className="text-sm text-muted-foreground">{t("aiUsage.enterpriseBody")}</p>;
  } else if (!balance.hasIncludedCredits) {
    body = <p className="text-sm text-muted-foreground">{t("aiUsage.noPlanBody")}</p>;
    action = (
      <Button asChild className="w-full">
        <Link href="/pricing">{t("account.planViewPlans")}</Link>
      </Button>
    );
  } else {
    const allocation = balance.monthlyAllocation;
    const left = Math.min(allocation, Math.max(0, balance.balance));
    const percentLeft = allocation > 0 ? Math.round((left / allocation) * 1000) / 10 : 0;
    const days = daysLeft(balance.periodEnd);
    // Managed is the top self-serve plan; Enterprise never reaches this branch.
    const canUpgrade = balance.plan !== "managed";
    const isLow = percentLeft <= LOW_PERCENT;
    const renewsOn = balance.periodEnd
      ? new Date(balance.periodEnd).toLocaleDateString(intlLocale, { day: "numeric", month: "long" })
      : null;

    body = (
      <>
        <div className="flex items-end justify-between gap-3">
          <p className="flex min-w-0 items-baseline gap-1.5">
            <span className="text-2xl font-semibold tracking-tight tabular-nums">{formatCredits(left)}</span>
            <span className="text-sm text-muted-foreground">{t("aiUsage.creditsUnit")}</span>
          </p>
          {days !== null ? (
            <p className="shrink-0 text-sm tabular-nums">
              <span className="font-medium">{days}</span>{" "}
              <span className="text-muted-foreground">
                {t(days === 1 ? "account.creditsDayLeft" : "account.creditsDaysLeft")}
              </span>
            </p>
          ) : null}
        </div>

        <div
          role="meter"
          aria-label={t("account.creditsBarLabel")}
          aria-valuemin={0}
          aria-valuemax={allocation}
          aria-valuenow={left}
          aria-valuetext={`${formatCredits(left)} / ${formatCredits(allocation)}`}
          className="relative mt-3 h-4"
        >
          <div className="h-full overflow-hidden rounded-full bg-muted shadow-[var(--shadow-inset)]">
            <div
              className={cn(
                "h-full rounded-full bg-gradient-to-r transition-[width] duration-500 ease-expo-out",
                percentLeft <= CRITICAL_PERCENT
                  ? "from-destructive/35 to-destructive"
                  : isLow
                    ? "from-amber-500/35 to-amber-500"
                    : "from-foreground/20 to-foreground/85",
              )}
              style={{ width: `${percentLeft}%` }}
            />
          </div>
          {percentLeft > 0 && percentLeft < 100 ? (
            <span
              aria-hidden
              className="absolute -top-1.5 -bottom-1.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
              style={{ left: `${percentLeft}%` }}
            />
          ) : null}
        </div>

        <div className="my-4 border-t border-dashed border-border" />

        <p className="text-xs leading-relaxed text-muted-foreground">
          {isLow && canUpgrade
            ? t("account.creditsLow")
            : t("account.creditsUsed", {
                used: formatCredits(balance.usedThisPeriod),
                total: formatCredits(allocation),
              })}
          {renewsOn ? ` ${t("aiUsage.renewsOn", { date: renewsOn })}.` : null}
        </p>
      </>
    );

    if (canUpgrade) {
      action = (
        <Button asChild className="w-full">
          <Link href="/account/billing">{t("account.creditsUpgrade")}</Link>
        </Button>
      );
    }
  }

  return (
    <div className="mb-4 rounded-[20px] border border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
      <div className="overflow-hidden rounded-[14px] border border-border/50 bg-card p-5 shadow-xs">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
            <HugeiconsIcon icon={Coins01Icon} size={16} strokeWidth={1.75} />
          </div>
          <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{t("account.creditsTitle")}</h3>
          <Link
            href="/settings/ai-usage"
            className="group inline-flex shrink-0 items-center gap-1 rounded-md text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("account.creditsViewUsage")}
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={14}
              strokeWidth={1.75}
              className="transition-transform duration-200 ease-expo-out group-hover:translate-x-0.5"
            />
          </Link>
        </div>
        {body}
      </div>
      {action ? <div className="px-2.5 pt-2 pb-0.5">{action}</div> : null}
    </div>
  );
}
