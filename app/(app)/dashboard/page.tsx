"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  MessageCircleIcon,
  ZapIcon,
  ChartAverageIcon,
  SendIcon,
  TrendingUpIcon,
  Add01Icon,
  Settings01Icon,
  AiElementsIcon,
  RocketIcon,
} from "@hugeicons/core-free-icons";
import { FeaturesDialog } from "../../_components/features-dialog";
import { PageContainer } from "../../_components/page-container";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { Card, CardHeader, CardTitle, CardDescription, CardSeparator } from "../../_components/dashboard-card";
import { CardCarousel } from "../../_components/card-carousel";
import { ChannelIcon, ChannelBadge, ChannelStatusBadge, CHANNEL_LABELS } from "../../_components/channel-badge";
import { KpiBars, KpiCard, KpiSparkline, KpiSplit } from "../../_components/kpi-card";
import { AnimatedNumber, DonutChart, TimeSeries } from "../../_components/chart";
import { Skeleton, DashboardSkeleton } from "@/components/ai-elements/skeleton";
import { useT } from "@/lib/i18n/provider";
import { relativeTime } from "@/lib/format";
import {
  chatTitle,
  getChats,
  getChannels,
  getStats,
  getActivityData,
  mergeChats,
} from "@/lib/dashboard-store";
import type {
  ChatSummary,
  ChannelInfo,
  DashboardStats,
  Automation,
  ActivityPoint,
} from "@/lib/types";
import { usePolling } from "@/lib/use-polling";

function DashboardPageContent() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Onboarding finishes by landing here with `?onboarded=1` (and, if any
  // goals were picked, `goals=a,b`) rather than opening this dialog itself —
  // the tour belongs over the product the account is about to use, not over
  // the form it just left. Stripped from the URL once read, so a refresh or
  // the back button doesn't reopen it.
  const [tourGoals, setTourGoals] = useState<readonly string[] | null>(null);
  useEffect(() => {
    if (searchParams.get("onboarded") !== "1") return;
    setTourGoals(searchParams.get("goals")?.split(",").filter(Boolean) ?? []);
    router.replace("/dashboard");
  }, [router, searchParams]);

  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [activity, setActivity] = useState<ActivityPoint[]>([]);
  const [, setChannelStatus] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<UiError | null>(null);

  const refresh = useCallback(async () => {
    const localChats = getChats();
    const [autoResult, contactResult, channelResult] = await Promise.all([
      fetchJson<{ automations?: Automation[] }>("/api/automations?limit=200", t),
      fetchJson<{ chats?: ChatSummary[] }>("/api/contacts?limit=200", t),
      fetchJson<{ status?: Record<string, boolean> }>("/api/channels/status", t),
    ]);

    // A dashboard that draws zeroes because a request failed is worse than one
    // that says so: "0 conversations" is a claim about the business, not about
    // the network. Whatever did load still renders.
    const failure = [autoResult, contactResult, channelResult].find((r) => !r.ok);
    setError(failure && !failure.ok ? failure.error : null);

    const a = autoResult.ok ? (autoResult.data.automations ?? []) : [];
    const serverChats = contactResult.ok ? (contactResult.data.chats ?? []) : [];
    const merged = mergeChats(localChats, serverChats);
    const status = channelResult.ok ? (channelResult.data.status ?? {}) : {};
    setAutomations(a);
    setChats(merged);
    setStats(getStats(merged, a));
    setActivity(getActivityData(merged));
    setChannelStatus(status);
    setChannels(getChannels(merged, status));
    setIsLoading(false);
  }, [t]);

  // `usePolling` fires once immediately, so a separate mount effect would
  // just double every load.
  usePolling(() => void refresh(), 30_000);

  const recentChats = [...chats]
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
    .slice(0, 5);

  const activeAutomations = automations.filter((a) => a.status === "active");

  // The channel carrying the most conversations — the one fact the raw message
  // count leaves out, and the reason the tile says something instead of
  // restating itself with "across all channels".
  const leadChannel = stats?.channelBreakdown.length
    ? [...stats.channelBreakdown].sort((a, b) => b.count - a.count)[0]
    : undefined;

  // Replaces the old "response time" tile, which had no source of truth behind
  // it: `getStats` hard-codes that field to an em dash, so the tile could never
  // show a number. This one is derived from data the dashboard already has.
  const messagesPerChat =
    stats && stats.totalChats > 0 ? Math.round(stats.totalMessages / stats.totalChats) : 0;

  return (
    <>
      <PageContainer maxWidth="max-w-6xl" pattern="grid">
        <Skeleton
          className="min-h-[600px]"
          isLoading={isLoading}
          skeleton={<DashboardSkeleton />}
        >
        <div className="content-enter">
        {/* Header */}
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{t("dashboard.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("dashboard.subtitle")}
            </p>
          </div>
          <a
            href="/chat"
            className="hidden items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--shadow-inset)] transition duration-150 hover:border-input hover:bg-accent sm:inline-flex"
          >
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
            {t("dashboard.newChat")}
          </a>
        </header>

        {/* Above every branch below: a failed load has to be visible whether
            the dashboard fell back to the empty state or to stale numbers. */}
        <ErrorBanner
          className="mb-6"
          error={error}
          onRetry={() => void refresh()}
          onDismiss={() => setError(null)}
        />

        {/* Empty state — first-time onboarding */}
        {!isLoading && chats.length === 0 && automations.length === 0 && (
          <div className="content-enter">
            <Card className="mb-8">
              <div className="flex flex-col items-center gap-4 px-5 py-12 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                  <HugeiconsIcon icon={RocketIcon} size={24} strokeWidth={1.5} />
                </div>
                <div className="space-y-1.5">
                  <p className="text-base font-medium">{t("dashboard.emptyTitle")}</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    {t("dashboard.emptyDescription")}
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-3 pt-2">
                  <Link
                    href="/chat"
                    className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background shadow-[var(--shadow-soft)] transition duration-150 hover:opacity-90 active:translate-y-px"
                  >
                    <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
                    {t("dashboard.emptyStartChat")}
                  </Link>
                  <Link
                    href="/automations"
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--shadow-inset)] transition duration-150 hover:border-input hover:bg-accent"
                  >
                    <HugeiconsIcon icon={AiElementsIcon} size={16} strokeWidth={1.75} />
                    {t("dashboard.emptyCreateAutomation")}
                  </Link>
                  <a
                    href="/settings"
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--shadow-inset)] transition duration-150 hover:border-input hover:bg-accent"
                  >
                    <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.75} />
                    {t("dashboard.emptyConfigureChannels")}
                  </a>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Stats grid — every tile's second line carries something the big
            number cannot say on its own: which channel is driving the volume,
            how many automations produced those replies, how many
            conversations the average is drawn from.

            Each tile also draws its own picture, and they are four different
            pictures because the four numbers are four different shapes: a
            share of the book that is live, where the volume came from, how
            much of it never needed a person, and the curve over the fortnight
            the average is taken from. */}
        {stats ? (
          <div className="mb-8">
            <CardCarousel label="Estadísticas">
              <div className="flex items-stretch gap-4" style={{ paddingInline: "2px" }}>
                <div className="min-w-[200px] flex-1">
                  <KpiCard
                    icon={MessageCircleIcon}
                    label={t("dashboard.conversations")}
                    value={stats.totalChats}
                    sub={
                      stats.activeChats === 0
                        ? t("dashboard.activeNowNone")
                        : stats.activeChats === 1
                          ? t("dashboard.activeNowOne")
                          : t("dashboard.activeNow", { count: stats.activeChats })
                    }
                    visual={
                      <KpiBars
                        ratio={stats.totalChats > 0 ? stats.activeChats / stats.totalChats : 0}
                        tone="positive"
                      />
                    }
                  />
                </div>
                <div className="min-w-[200px] flex-1">
                  <KpiCard
                    icon={SendIcon}
                    label={t("dashboard.messagesTotal")}
                    value={stats.totalMessages}
                    sub={
                      leadChannel
                        ? t("dashboard.leadChannel", {
                            channel: CHANNEL_LABELS[leadChannel.channel],
                            percentage: leadChannel.percentage,
                          })
                        : t("dashboard.noMessagesYet")
                    }
                    visual={
                      <KpiSplit
                        parts={stats.channelBreakdown.map((cb) => ({
                          tone: "neutral" as const,
                          value: cb.count,
                        }))}
                      />
                    }
                  />
                </div>
                <div className="min-w-[200px] flex-1">
                  <KpiCard
                    icon={ZapIcon}
                    label={t("dashboard.autoReplies")}
                    value={stats.automatedReplies}
                    sub={
                      activeAutomations.length === 0
                        ? t("dashboard.noAutomationsYet")
                        : activeAutomations.length === 1
                          ? t("dashboard.activeAutomationsOne")
                          : t("dashboard.activeAutomations", { count: activeAutomations.length })
                    }
                    visual={
                      <KpiBars
                        ratio={
                          stats.totalMessages > 0
                            ? stats.automatedReplies / stats.totalMessages
                            : 0
                        }
                      />
                    }
                  />
                </div>
                <div className="min-w-[200px] flex-1">
                  <KpiCard
                    icon={ChartAverageIcon}
                    label={t("dashboard.messagesPerChat")}
                    value={messagesPerChat}
                    sub={
                      stats.totalChats === 1
                        ? t("dashboard.overChatsOne")
                        : t("dashboard.overChats", { count: stats.totalChats })
                    }
                    visual={<KpiSparkline points={activity.map((point) => point.value)} />}
                  />
                </div>
              </div>
            </CardCarousel>
          </div>
        ) : null}

        {/* Two column: Activity chart + Channel breakdown */}
        <div className="mb-8 grid gap-4 lg:grid-cols-3">
          {/* Activity chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                <HugeiconsIcon icon={TrendingUpIcon} size={16} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle>{t("dashboard.weeklyActivity")}</CardTitle>
                <CardDescription>{t("dashboard.messagesByDay")}</CardDescription>
              </div>
              {/* The week's total belongs next to the chart it summarises —
                  the bars answer "when", this answers "how much". */}
              <p className="shrink-0 font-semibold text-lg leading-none tabular-nums">
                <AnimatedNumber value={activity.reduce((sum, d) => sum + d.value, 0)} />
              </p>
            </CardHeader>
            <CardSeparator />
            <div className="px-4 py-6">
              <ActivityChart data={activity} />
            </div>
          </Card>

          {/* Channel breakdown */}
          <Card>
            <CardHeader>
              <div className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                <HugeiconsIcon icon={MessageCircleIcon} size={16} strokeWidth={1.75} />
              </div>
              <div>
                <CardTitle>{t("dashboard.channels")}</CardTitle>
                <CardDescription>{t("dashboard.channelBreakdown")}</CardDescription>
              </div>
              <AnimatedNumber className="ml-auto text-lg font-semibold" value={stats?.channelBreakdown.reduce((sum, channel) => sum + channel.count, 0) ?? 0} />
            </CardHeader>
            <CardSeparator />
            <div className="px-5 py-4">
              {stats && stats.channelBreakdown.length > 0 ? (
                <DonutChart
                  data={stats.channelBreakdown.map((cb) => ({
                    key: cb.channel,
                    label: <ChannelBadge channel={cb.channel} />,
                    value: cb.count,
                    formatted: `${cb.count} (${cb.percentage}%)`,
                    formatValue: (value) => `${Math.round(value).toLocaleString()} (${cb.percentage}%)`,
                  }))}
                  emptyLabel={t("dashboard.noChannels")}
                />
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">{t("dashboard.noChannels")}</p>
              )}
            </div>
          </Card>
        </div>

        {/* Channels status */}
        <div className="mb-8">
          <h2 className="mb-4 text-sm font-medium">{t("dashboard.channelStatus")}</h2>
          {channels.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">{t("dashboard.noChannelStatus")}</p>
              <a
                href="/settings"
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--shadow-inset)] transition duration-150 hover:border-input hover:bg-accent"
              >
                <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.75} />
                {t("dashboard.emptyConfigureChannels")}
              </a>
            </div>
          ) : (
            <CardCarousel label="Estado de canales">
              <div className="flex items-stretch gap-4" style={{ paddingInline: "2px" }}>
                {channels.map((ch) => (
                  <div key={ch.id} className="min-w-[240px] flex-1">
                    <Card interactive>
                      <CardHeader>
                        <div className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                          <ChannelIcon channel={ch.id} />
                        </div>
                        <div className="flex-1">
                          <CardTitle>{ch.label}</CardTitle>
                          <CardDescription>
                            {ch.messageCount} {t("dashboard.messages")} · {ch.lastEvent ? relativeTime(ch.lastEvent) : ""}
                          </CardDescription>
                        </div>
                      </CardHeader>
                      <CardSeparator />
                      <div className="px-5 py-3">
                        <ChannelStatusBadge status={ch.status} />
                      </div>
                    </Card>
                  </div>
                ))}
              </div>
            </CardCarousel>
          )}
        </div>

        {/* Recent chats */}
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium">{t("dashboard.recentChats")}</h2>
            <a
              href="/history"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("dashboard.viewAll")}
            </a>
          </div>
          {recentChats.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">{t("dashboard.noChats")}</p>
              <a
                href="/chat"
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--shadow-inset)] transition duration-150 hover:border-input hover:bg-accent"
              >
                <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
                {t("dashboard.emptyStartChat")}
              </a>
            </div>
          ) : (
            <Card>
              <div className="divide-y divide-border">
                {recentChats.map((chat) => (
                <a
                  key={chat.id}
                  href="/chat"
                  className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-accent/50"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                    <ChannelIcon channel={chat.channel} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {chatTitle(chat) ?? t("chats.newConversation")}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{chat.lastMessage}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {relativeTime(chat.lastMessageAt)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {chat.messageCount} {t("dashboard.messages")}
                    </p>
                  </div>
                </a>
              ))}
              </div>
            </Card>
          )}
        </div>

        {/* Active automations */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium">{t("dashboard.activeAutomationsTitle")}</h2>
            <Link
              href="/automations"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("dashboard.viewAll")}
            </Link>
          </div>
          {activeAutomations.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">{t("dashboard.noAutomations")}</p>
              <Link
                href="/automations"
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--shadow-inset)] transition duration-150 hover:border-input hover:bg-accent"
              >
                <HugeiconsIcon icon={AiElementsIcon} size={16} strokeWidth={1.75} />
                {t("dashboard.emptyCreateAutomation")}
              </Link>
            </div>
          ) : (
            <CardCarousel label="Automatizaciones activas">
              <div className="flex items-stretch gap-4" style={{ paddingInline: "2px" }}>
                {activeAutomations.slice(0, 4).map((auto) => (
                  <div key={auto.id} className="min-w-[260px] flex-1">
                    <Card interactive>
                      <CardHeader>
                        <div className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                          <HugeiconsIcon icon={ZapIcon} size={16} strokeWidth={1.75} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <CardTitle>{auto.name}</CardTitle>
                          <CardDescription>
                            {auto.responseCount} {t("automations.responses")} ·{" "}
                            {auto.lastTriggeredAt ? relativeTime(auto.lastTriggeredAt) : t("dashboard.never")}
                          </CardDescription>
                        </div>
                      </CardHeader>
                    </Card>
                  </div>
                ))}
              </div>
            </CardCarousel>
          )}
        </div>
        </div>
        </Skeleton>
      </PageContainer>

      <FeaturesDialog
        goals={tourGoals ?? []}
        onClose={() => setTourGoals(null)}
        open={tourGoals !== null}
      />
    </>
  );
}

export default function DashboardPage() {
  // `useSearchParams` needs one — everything else here is client-fetched.
  return (
    <Suspense fallback={null}>
      <DashboardPageContent />
    </Suspense>
  );
}

// ── Activity chart ─────────────────────────────────────────────────

/**
 * Weekly message volume.
 *
 * A thin adapter over the shared time-series mark: the dashboard owns the
 * dictionary lookup and the tooltip sentence, the chart owns the geometry.
 */
function ActivityChart({ data }: { readonly data: ActivityPoint[] }) {
  const t = useT();
  return (
    <TimeSeries
      data={data.map((point) => ({
        key: point.labelKey,
        label: t(point.labelKey),
        value: point.value,
      }))}
      emptyLabel={t("dashboard.noActivity")}
      formatValue={(point) => (
        <>
          <span className="font-medium tabular-nums">{point.value}</span>{" "}
          {t("dashboard.messages")} · {point.label}
        </>
      )}
    />
  );
}
