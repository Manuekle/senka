"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  ArrowLeft01Icon,
  Coins01Icon,
  PieChartIcon,
  Robot01Icon,
  MessageMultiple01Icon,
  Wallet01Icon,
  ChartLineData01Icon,
} from "@hugeicons/core-free-icons";
import { PageContainer } from "../../../_components/page-container";
import { Card, CardBody, CardHeader, CardSeparator, CardTitle, CardDescription } from "../../../_components/dashboard-card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ai-elements/skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { useI18n } from "@/lib/i18n/provider";
import { ProviderLogo } from "@/components/provider-logo";
import { CHANNEL_LABELS } from "@/app/_components/channel-badge";
import { RankedBars, TimeSeries, type RankedBar } from "@/app/_components/chart";
import { formatDayTick } from "@/lib/chart-data";
import type { ChannelId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

function channelLabel(channel: string | null, fallback: string): string {
  if (!channel) return fallback;
  return CHANNEL_LABELS[channel as ChannelId] ?? channel;
}

// Settings → AI Usage.
//
// Three questions, in order: how many credits are left this period, where
// did they go (provider / agent / channel), and — for anyone paying the
// provider directly instead — roughly what that's costing. The credits
// figure and the provider-cost figure are never conflated on screen: a BYOK
// row shows an *estimate* of provider usage, never a Senka credit charge,
// because BYOK by definition never touches the ledger (see
// lib/credit-gate.ts).

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

type Breakdown = { readonly credits: number; readonly providerCost: number; readonly calls: number };
type ProviderBreakdown = Breakdown & { readonly provider: string };
type AgentBreakdown = Breakdown & { readonly agentId: string | null };
type ChannelBreakdown = Breakdown & { readonly channel: string | null };
type DailyUsage = {
  readonly day: string;
  readonly credits: number;
  readonly providerCost: number;
  readonly calls: number;
};

type SummaryResponse = {
  readonly totalCredits: number;
  readonly totalProviderCost: number;
  readonly includedCost: number;
  readonly byokEstimatedCost: number;
  readonly byProvider: readonly ProviderBreakdown[];
  readonly byAgent: readonly AgentBreakdown[];
  readonly byChannel: readonly ChannelBreakdown[];
  readonly byDay: readonly DailyUsage[];
};

type DetailRow = {
  readonly id: string;
  readonly createdAt: string;
  readonly provider: string;
  readonly model: string;
  readonly agentId: string | null;
  readonly channel: string | null;
  readonly usageType: string;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly characters: number | null;
  readonly providerCost: number | null;
  readonly credits: number;
  readonly billingSource: string;
};

type DetailsResponse = { readonly rows: readonly DetailRow[]; readonly total: number };

const BILLING_SOURCES = ["INCLUDED_CREDITS", "BYOK", "PURCHASED_CREDITS"] as const;

function formatCredits(n: number, locale: string): string {
  return new Intl.NumberFormat(locale === "es" ? "es-AR" : "en-US", { maximumFractionDigits: 0 }).format(
    Math.round(n),
  );
}

function formatUsd(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

function formatTokens(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString();
}

export default function AiUsagePage() {
  const { locale, t } = useI18n();
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [details, setDetails] = useState<DetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UiError | null>(null);
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [billingSourceFilter, setBillingSourceFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const tableScrollRef = useRef<HTMLDivElement>(null);

  /* Edge fade on the details table, mobile only. At the start only the far
     edge fades; once scrolled, the passed edge fades in; at the end the far
     fade lifts. Desktop fits without scrolling, so the mask stays off. */
  const updateTableFade = useCallback(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    if (!window.matchMedia("(max-width: 767px)").matches) {
      el.style.setProperty("--x-fade-start", "0px");
      el.style.setProperty("--x-fade-end", "0px");
      return;
    }
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) {
      el.style.setProperty("--x-fade-start", "0px");
      el.style.setProperty("--x-fade-end", "0px");
      return;
    }
    const FADE = "28px";
    el.style.setProperty("--x-fade-start", el.scrollLeft < 4 ? "0px" : FADE);
    el.style.setProperty("--x-fade-end", el.scrollLeft > max - 4 ? "0px" : FADE);
  }, []);

  useEffect(() => {
    updateTableFade();
    const el = tableScrollRef.current;
    el?.addEventListener("scroll", updateTableFade, { passive: true });
    window.addEventListener("resize", updateTableFade);
    return () => {
      el?.removeEventListener("scroll", updateTableFade);
      window.removeEventListener("resize", updateTableFade);
    };
  }, [updateTableFade, details]);

  const load = useCallback(async () => {
    const [balanceResult, summaryResult] = await Promise.all([
      fetchJson<BalanceResponse>("/api/credits/balance", t),
      fetchJson<SummaryResponse>("/api/usage/summary", t),
    ]);
    if (!balanceResult.ok) {
      setError(balanceResult.error);
      return;
    }
    if (!summaryResult.ok) {
      setError(summaryResult.error);
      return;
    }
    setBalance(balanceResult.data);
    setSummary(summaryResult.data);
    setError(null);
  }, [t]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (providerFilter !== "all") params.set("provider", providerFilter);
    if (billingSourceFilter !== "all") params.set("billingSource", billingSourceFilter);
    params.set("limit", String(pageSize));
    params.set("offset", String(page * pageSize));
    void fetchJson<DetailsResponse>(`/api/usage/details?${params.toString()}`, t).then((result) => {
      if (result.ok) setDetails(result.data);
    });
  }, [providerFilter, billingSourceFilter, page, t, pageSize]);

  const percentUsed = useMemo(() => {
    if (!balance || balance.unlimited || balance.monthlyAllocation <= 0) return 0;
    return Math.min(100, Math.round((balance.usedThisPeriod / balance.monthlyAllocation) * 100));
  }, [balance]);

  const renewsOn = useMemo(() => {
    if (!balance || balance.unlimited || !balance.periodEnd) return null;
    return new Date(balance.periodEnd).toLocaleDateString(locale === "es" ? "es-AR" : "en-US", {
      day: "numeric",
      month: "long",
    });
  }, [balance, locale]);

  /**
   * Whether this account has any cost to show at all.
   *
   * A BYOK-only install records every call but no price — the provider bills
   * the account directly and never tells us the amount. Charting cost there
   * draws a flat empty week over sixteen real calls, which reads as "nothing
   * happened". When there is no cost anywhere the whole card switches to call
   * volume and says so, rather than showing a truthful zero that misleads.
   */
  const hasCost = (summary?.totalProviderCost ?? 0) > 0;

  /**
   * The trend's marks. Cost, not credits: the question this card answers is
   * "what is this costing", and credits only mean something against a plan.
   *
   * The bucket key stays the raw `YYYY-MM-DD` so the tooltip can find its row;
   * only the axis tick is localised, and it drops the year — fourteen bars are
   * obviously the last fortnight, and repeating 2026 on each one is noise.
   */
  const dailySpend = useMemo(
    () =>
      (summary?.byDay ?? []).map((day) => ({
        key: day.day,
        label: formatDayTick(day.day, locale),
        value: hasCost ? day.providerCost : day.calls,
      })),
    [summary, locale, hasCost],
  );

  const availableProviders = useMemo(
    () => Array.from(new Set(summary?.byProvider.map((p) => p.provider) ?? [])),
    [summary],
  );

  return (
    <PageContainer maxWidth="max-w-4xl" pattern="grid">
      <Skeleton className="min-h-[500px]" isLoading={loading} skeleton={<AiUsageSkeleton />}>
        <div className="content-enter">
          <header className="mb-8">
            <Link
              href="/settings"
              className="group mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon
                icon={ArrowLeft01Icon}
                size={14}
                strokeWidth={1.75}
                className="transition-transform duration-200 ease-expo-out group-hover:-translate-x-0.5"
              />
              {t("aiUsage.back")}
            </Link>
            <h1 className="text-2xl font-semibold">{t("aiUsage.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("aiUsage.subtitle")}</p>
          </header>

          {error ? <ErrorBanner error={error} className="mb-6" onDismiss={() => setError(null)} /> : null}

          {/* ── Credits ── */}
          <Card className="mb-4">
            <CardHeader>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                <HugeiconsIcon icon={Coins01Icon} size={16} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle>{t("aiUsage.creditsTitle")}</CardTitle>
                <CardDescription>
                  {balance?.unlimited
                    ? t("aiUsage.enterpriseBody")
                    : renewsOn
                      ? t("aiUsage.renewsOn", { date: renewsOn })
                      : t("aiUsage.noPlanBody")}
                </CardDescription>
              </div>
            </CardHeader>
            <CardSeparator />
            <CardBody>
              {balance?.unlimited ? (
                <p className="text-sm text-muted-foreground">{t("aiUsage.enterpriseNote")}</p>
              ) : balance && balance.hasIncludedCredits ? (
                <div>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-2xl font-semibold tabular-nums">
                      {formatCredits(balance.balance, locale)}
                    </span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      / {formatCredits(balance.monthlyAllocation, locale)} {t("aiUsage.creditsUnit")}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width,background-color] duration-500",
                        percentUsed >= 90 ? "bg-destructive" : percentUsed >= 70 ? "bg-amber-500" : "bg-primary",
                      )}
                      style={{ width: `${percentUsed}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("aiUsage.percentUsed", { percent: String(percentUsed) })}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("aiUsage.noPlanBody")}</p>
              )}
            </CardBody>
          </Card>

          {/* ── Costs ── */}
          <Card className="mb-4">
            <CardHeader>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                <HugeiconsIcon icon={Wallet01Icon} size={16} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle>{t("aiUsage.costsTitle")}</CardTitle>
                <CardDescription>{t("aiUsage.costsDescription")}</CardDescription>
              </div>
            </CardHeader>
            <CardSeparator />
            <CardBody>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">{t("aiUsage.senkaCredits")}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{formatUsd(summary?.includedCost ?? 0)}</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">{t("aiUsage.byokEstimated")}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{formatUsd(summary?.byokEstimatedCost ?? 0)}</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t("aiUsage.costsNote")}</p>
            </CardBody>
          </Card>

          {/* ── Trend ── */}
          <Card className="mb-4">
            <CardHeader>
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                <HugeiconsIcon icon={ChartLineData01Icon} size={14} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle>{t(hasCost ? "aiUsage.trendTitle" : "aiUsage.trendCallsTitle")}</CardTitle>
                <CardDescription>
                  {t(hasCost ? "aiUsage.trendDescription" : "aiUsage.trendCallsDescription")}
                </CardDescription>
              </div>
            </CardHeader>
            <CardSeparator />
            <CardBody>
              <TimeSeries
                data={dailySpend}
                emptyLabel={t("aiUsage.trendEmpty")}
                formatAxis={hasCost ? formatUsd : undefined}
                formatValue={(point) => {
                  const day = summary?.byDay.find((d) => d.day === point.key);
                  return (
                    <span className="tabular-nums">
                      {point.label} ·{" "}
                      {hasCost
                        ? t("aiUsage.trendTooltip", { cost: formatUsd(point.value), calls: day?.calls ?? 0 })
                        : t("aiUsage.trendCallsTooltip", { calls: day?.calls ?? 0 })}
                    </span>
                  );
                }}
              />
            </CardBody>
          </Card>

          {/* ── Breakdowns ── */}
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <BreakdownCard
              icon={PieChartIcon}
              title={t("aiUsage.byProviderTitle")}
              rows={(summary?.byProvider ?? []).map((p) => ({
                key: p.provider,
                label: <span className="flex items-center gap-1.5"><ProviderLogo vendor={p.provider} size={13} />{p.provider}</span>,
                formatted: hasCost ? formatUsd(p.providerCost) : t("aiUsage.callsCount", { calls: p.calls }),
                value: hasCost ? p.providerCost : p.calls,
              }))}
              emptyLabel={t("aiUsage.noData")}
            />
            <BreakdownCard
              icon={Robot01Icon}
              title={t("aiUsage.byAgentTitle")}
              rows={(summary?.byAgent ?? []).map((a) => ({
                key: a.agentId ?? "none",
                label: a.agentId ?? t("aiUsage.unassignedAgent"),
                formatted: hasCost ? formatUsd(a.providerCost) : t("aiUsage.callsCount", { calls: a.calls }),
                value: hasCost ? a.providerCost : a.calls,
              }))}
              emptyLabel={t("aiUsage.noData")}
            />
            <BreakdownCard
              icon={MessageMultiple01Icon}
              title={t("aiUsage.byChannelTitle")}
              rows={(summary?.byChannel ?? []).map((c) => ({
                key: c.channel ?? "none",
                label: channelLabel(c.channel, t("aiUsage.unknownChannel")),
                formatted: hasCost ? formatUsd(c.providerCost) : t("aiUsage.callsCount", { calls: c.calls }),
                value: hasCost ? c.providerCost : c.calls,
              }))}
              emptyLabel={t("aiUsage.noData")}
            />
          </div>

          {/* ── Details ── */}
          <Card className="rounded-[20px] border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
            <div className="rounded-[14px] border border-border/50 bg-card shadow-xs">
            <CardHeader>
              <div className="min-w-0 flex-1">
                <CardTitle>{t("aiUsage.detailsTitle")}</CardTitle>
                <CardDescription>{t("aiUsage.detailsDescription")}</CardDescription>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Select
                  value={providerFilter}
                  onValueChange={(value) => {
                    setProviderFilter(value);
                    setPage(0);
                  }}
                >
                  <SelectTrigger aria-label={t("common.filterByProvider")} size="sm" className="w-auto text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("aiUsage.allProviders")}</SelectItem>
                    {availableProviders.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={billingSourceFilter}
                  onValueChange={(value) => {
                    setBillingSourceFilter(value);
                    setPage(0);
                  }}
                >
                  <SelectTrigger aria-label={t("common.filterBySource")} size="sm" className="w-auto text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("aiUsage.allSources")}</SelectItem>
                    {BILLING_SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`aiUsage.billingSource.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardSeparator />
            {!details ? (
              <div className="flex items-center justify-center py-10">
                <Spinner size={18} className="text-muted-foreground" />
              </div>
            ) : details.rows.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t("aiUsage.detailsEmpty")}</p>
            ) : (
              <div ref={tableScrollRef} className="x-fade overflow-x-auto scrollbar-hide">
                <table className="w-full border-separate border-spacing-y-1.5 px-1.5 text-left text-xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="px-4 py-1.5 font-medium">{t("aiUsage.col.date")}</th>
                      <th className="px-2 py-1.5 font-medium">{t("aiUsage.col.provider")}</th>
                      <th className="px-2 py-1.5 font-medium">{t("aiUsage.col.model")}</th>
                      <th className="px-2 py-1.5 font-medium">{t("aiUsage.col.channel")}</th>
                      <th className="px-2 py-1.5 text-right font-medium tabular-nums">{t("aiUsage.col.input")}</th>
                      <th className="px-2 py-1.5 text-right font-medium tabular-nums">{t("aiUsage.col.output")}</th>
                      <th className="px-2 py-1.5 text-right font-medium tabular-nums">{t("aiUsage.col.cost")}</th>
                      <th className="px-2 py-1.5 text-right font-medium tabular-nums">{t("aiUsage.col.credits")}</th>
                      <th className="px-4 py-1.5 font-medium">{t("aiUsage.col.source")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.rows.map((row) => (
                      <tr key={row.id} className="transition-colors hover:[&>td]:bg-muted/40">
                        <td className="rounded-l-[12px] border-y border-l border-border/50 bg-card px-4 py-2 whitespace-nowrap text-muted-foreground shadow-xs">
                          {new Date(row.createdAt).toLocaleDateString(locale === "es" ? "es-AR" : "en-US", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="border-y border-border/50 bg-card px-2 py-2">
                          <span className="flex items-center gap-1.5">
                            <ProviderLogo vendor={row.provider} size={13} />
                            {row.provider}
                          </span>
                        </td>
                        <td className="max-w-[160px] truncate border-y border-border/50 bg-card px-2 py-2 font-mono">{row.model}</td>
                        <td className="border-y border-border/50 bg-card px-2 py-2 text-muted-foreground">{channelLabel(row.channel, "—")}</td>
                        <td className="border-y border-border/50 bg-card px-2 py-2 text-right tabular-nums">
                          {row.characters !== null ? `${formatTokens(row.characters)} ch` : formatTokens(row.inputTokens)}
                        </td>
                        <td className="border-y border-border/50 bg-card px-2 py-2 text-right tabular-nums">{formatTokens(row.outputTokens)}</td>
                        <td className="border-y border-border/50 bg-card px-2 py-2 text-right tabular-nums">
                          {row.providerCost === null ? "—" : formatUsd(row.providerCost)}
                        </td>
                        <td className="border-y border-border/50 bg-card px-2 py-2 text-right tabular-nums">
                          {row.credits > 0 ? formatCredits(row.credits, locale) : "—"}
                        </td>
                        <td className="rounded-r-[12px] border-y border-r border-border/50 bg-card px-4 py-2 shadow-xs">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                              row.billingSource === "BYOK"
                                ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                                : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                            )}
                          >
                            {t(`aiUsage.billingSource.${row.billingSource}`)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {details && details.total > pageSize ? (
              <div className="flex items-center justify-between px-5 py-3">
                <p className="text-xs text-muted-foreground">
                  {t("aiUsage.pageInfo", {
                    from: String(page * pageSize + 1),
                    to: String(Math.min((page + 1) * pageSize, details.total)),
                    total: String(details.total),
                  })}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    {t("aiUsage.prev")}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={(page + 1) * pageSize >= details.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t("aiUsage.next")}
                  </Button>
                </div>
              </div>
            ) : null}
            </div>
          </Card>
        </div>
      </Skeleton>
    </PageContainer>
  );
}

function BreakdownCard({
  icon,
  title,
  rows,
  emptyLabel,
}: {
  readonly icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  readonly title: string;
  readonly rows: readonly RankedBar[];
  readonly emptyLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
          <HugeiconsIcon icon={icon} size={14} strokeWidth={1.75} />
        </div>
        <CardTitle className="text-xs">{title}</CardTitle>
      </CardHeader>
      <CardSeparator />
      <CardBody>
        <RankedBars bars={rows} emptyLabel={emptyLabel} />
      </CardBody>
    </Card>
  );
}

function AiUsageSkeleton() {
  return (
    <div>
      <div className="mb-8 space-y-2">
        <div className="h-4 w-16 rounded bg-muted/60" />
        <div className="h-7 w-48 rounded-lg bg-muted" />
        <div className="h-4 w-80 max-w-full rounded bg-muted/60" />
      </div>
      <div className="space-y-4">
        <div className="h-32 rounded-2xl border border-border bg-card" />
        <div className="h-24 rounded-2xl border border-border bg-card" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 rounded-2xl border border-border bg-card" />
          ))}
        </div>
        <div className="h-64 rounded-2xl border border-border bg-card" />
      </div>
    </div>
  );
}
