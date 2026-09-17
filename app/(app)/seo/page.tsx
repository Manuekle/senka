"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Add01Icon,
  ChartLineData01Icon,
  MouseLeftClick01Icon,
  Delete01Icon,
  ScanSearchIcon as ScanSearchAreaIcon,
  SearchIcon,
  Target02Icon,
} from "@hugeicons/core-free-icons";
import { GoogleMark } from "@/app/landing/_components/brand-marks";
import { PageContainer } from "../../_components/page-container";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../_components/dashboard-card";
import { CardCarousel } from "../../_components/card-carousel";
import { KpiCard, KpiSparkline } from "../../_components/kpi-card";
import { ChartPeriod, ChartSelector, DonutChart, RankedBars, TimeSeries, type ChartTone } from "../../_components/chart";
import { Pagination } from "@/components/ai-elements/pagination";
import { SkeletonBar } from "@/components/ai-elements/skeleton";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast-provider";
import { useI18n, useT } from "@/lib/i18n/provider";
import { fetchJson, isApiError, type UiError } from "@/lib/api-error-message";
import {
  RANGE_IDS,
  changeImpact,
  formatCount,
  formatPercentChange,
  formatPosition,
  formatPositionChange,
  formatRate,
  metricDelta,
  rankByMovement,
  siteLabel,
  type ComparedRow,
  type MetricDelta,
  type Period,
  type RangeId,
  type SearchRow,
  type SiteEntry,
  type Totals,
} from "@/lib/seo-metrics";
import { ChangeDialog } from "./_components/change-dialog";
import { DeltaChip, SeoTable, prettyPath, sortRows, toneForChange, type SortKey } from "./_components/seo-table";
import { SiteAuditPanel } from "./_components/site-audit";

/**
 * How the site is doing in Google.
 *
 * Everything on this page is a comparison. Search Console will happily tell
 * you that a keyword brought 340 clicks; on its own that is a number, not
 * information, and the question anyone actually opens an SEO panel with is
 * "did what I changed work?". So every window here is fetched with the equal
 * window immediately before it, every figure carries its movement, and the
 * changes the operator logs are drawn onto the traffic chart so the two can be
 * looked at together.
 *
 * The audit tab is the exception that needs none of this: it crawls a URL
 * the operator types, not a property Google verified, so it stays reachable
 * without a connected account — often the first thing worth doing about SEO.
 *
 * The page never claims causation. A marker on a line and a before/after
 * average is exactly as strong a claim as the data supports — the person who
 * rewrote the titles is the one who knows whether the step that follows is
 * theirs.
 */

// ── Types ──────────────────────────────────────────────────────────

type SeoChange = {
  readonly id: string;
  readonly date: string;
  readonly note: string;
  readonly createdAt: string;
};

type SeoResponse = {
  readonly sites?: readonly SiteEntry[];
  readonly site?: string | null;
  readonly range?: RangeId;
  readonly period?: { readonly current: Period; readonly previous: Period };
  readonly changes?: readonly SeoChange[];
  /** The connected Google account predates this page and its grant does not
   *  cover Search Console. A reconnect fixes it; nothing else will. */
  readonly needsScope?: boolean;
  // Overview
  readonly totals?: { readonly current: Totals; readonly previous: Totals };
  readonly series?: { readonly current: readonly SearchRow[] };
  readonly devices?: readonly SearchRow[];
  readonly countries?: readonly SearchRow[];
  // Queries and pages
  readonly rows?: readonly ComparedRow[];
  readonly lost?: readonly SearchRow[];
};

type Tab = "overview" | "queries" | "pages" | "audit";

// ── Vocabulary ─────────────────────────────────────────────────────

/** Google's device enum. Anything unlisted prints as it arrives. */
const DEVICE_KEYS: Readonly<Record<string, string>> = {
  DESKTOP: "seo.deviceDesktop",
  MOBILE: "seo.deviceMobile",
  TABLET: "seo.deviceTablet",
};

/** Country codes as Search Console sends them: ISO 3166-1 alpha-3, lowercase.
 *  `Intl.DisplayNames` speaks alpha-2, so the common ones are mapped and the
 *  rest print as the code rather than as a wrong country. */
const COUNTRY_ALPHA2: Readonly<Record<string, string>> = {
  arg: "AR", aus: "AU", bra: "BR", can: "CA", chl: "CL", col: "CO", deu: "DE",
  esp: "ES", fra: "FR", gbr: "GB", ita: "IT", jpn: "JP", mex: "MX", nld: "NL",
  per: "PE", prt: "PT", ury: "UY", usa: "US", ven: "VE",
};

function countryLabel(code: string, locale: string): string {
  const alpha2 = COUNTRY_ALPHA2[code.toLowerCase()];
  if (!alpha2) return code.toUpperCase();
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(alpha2) ?? alpha2;
  } catch {
    return alpha2;
  }
}

// ── Helpers ────────────────────────────────────────────────────────

/** A daily row's date, short, for an axis tick. */
function dayTick(day: string, locale: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(locale === "es" ? "es-ES" : "en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function fullDay(day: string, locale: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(locale === "es" ? "es-ES" : "en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  });
}

/**
 * A delta as the tile prints it.
 *
 * `higherIsBetter` is the only knob, and average position is the reason it
 * exists: it fell from 14 to 9, which is `direction: "down"` and unambiguously
 * good news. Colour follows the verdict, the arrow follows the number.
 */
function tileDelta(
  delta: MetricDelta,
  label: string,
  options: { readonly formatted?: string; readonly higherIsBetter?: boolean } = {},
) {
  const { higherIsBetter = true } = options;
  const good = delta.direction === "flat" ? null : (delta.direction === "up") === higherIsBetter;
  const value =
    options.formatted ??
    formatPercentChange(delta.percent) ??
    // No earlier value to divide by. The absolute change is the honest thing
    // to print — a percentage of zero is not a number.
    `+${formatCount(delta.change)}`;
  return {
    direction: delta.direction,
    label,
    tone: (good === null ? "neutral" : good ? "positive" : "critical") as ChartTone,
    value,
  };
}

// ── Panels ─────────────────────────────────────────────────────────

/**
 * The traffic chart, with the operator's own changes marked on it.
 *
 * The whole reason the change log exists is to be looked at here: a step in
 * this line and the sentence explaining it have to be on screen together, or
 * the log is a list nobody opens. The chart draws the dots; the day's tooltip
 * carries what was done.
 */
function TrafficChart({
  changes,
  locale,
  series,
  t,
}: {
  readonly changes: readonly SeoChange[];
  readonly locale: string;
  readonly series: readonly SearchRow[];
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const points = series.map((row) => ({
    key: row.key,
    label: dayTick(row.key, locale),
    value: row.clicks,
  }));
  /* Several changes can land on one day, and each is a separate sentence. */
  const notes = new Map<string, string[]>();
  for (const change of changes) {
    notes.set(change.date, [...(notes.get(change.date) ?? []), change.note]);
  }

  return (
    <TimeSeries
      data={points}
      emptyLabel={t("seo.noTraffic")}
      formatValue={(point) => (
        <>
          <span>
            {formatCount(point.value, locale)} {t("seo.clicks").toLowerCase()} ·{" "}
            {fullDay(point.key, locale)}
          </span>
          {(notes.get(point.key) ?? []).map((note) => (
            <span className="mt-1 block font-medium" key={note}>
              {note}
            </span>
          ))}
        </>
      )}
      height={168}
      markers={new Set(notes.keys())}
    />
  );
}

/**
 * The change log, and what the traffic did around each entry.
 *
 * The impact line is read off the series already on screen rather than fetched
 * — no extra call, and it can only ever describe the window being looked at,
 * which is the correct scope for the claim it makes. A change older than the
 * range says so instead of inventing an average.
 */
function ChangeLog({
  changes,
  locale,
  onAdd,
  onDelete,
  series,
  t,
}: {
  readonly changes: readonly SeoChange[];
  readonly locale: string;
  readonly onAdd: () => void;
  readonly onDelete: (change: SeoChange) => void;
  readonly series: readonly SearchRow[];
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div className="rounded-[20px] border border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
      <div className="overflow-hidden rounded-[14px] border border-border/50 bg-card shadow-xs">
        <CardHeader>
          <div className="min-w-0 flex-1">
            <CardTitle>{t("seo.changesTitle")}</CardTitle>
            <CardDescription>{t("seo.changesSubtitle")}</CardDescription>
          </div>
          <Button className="shrink-0" onClick={onAdd} size="sm" type="button" variant="secondary">
            <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.75} />
            {t("seo.logChange")}
          </Button>
        </CardHeader>
        <div className="mx-5 h-px bg-border/50" />
        <CardBody>
        {changes.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground text-sm">{t("seo.changesEmpty")}</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {changes.map((change) => {
              const impact = changeImpact(series, change.date);
              return (
                <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0" key={change.id}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">{change.note}</p>
                    <p className="mt-0.5 text-muted-foreground text-xs">
                      {fullDay(change.date, locale)}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    {impact ? (
                      <>
                        <DeltaChip
                          tone={toneForChange(impact.delta.change)}
                          value={
                            formatPercentChange(impact.delta.percent) ??
                            `+${formatCount(impact.delta.change, locale)}`
                          }
                        />
                        <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                          {t("seo.impactWindow", {
                            after: formatCount(impact.afterAverage, locale),
                            afterDays: impact.afterDays,
                            before: formatCount(impact.beforeAverage, locale),
                            beforeDays: impact.beforeDays,
                          })}
                        </p>
                      </>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">{t("seo.impactOutOfRange")}</p>
                    )}
                  </div>

                  <button
                    aria-label={t("common.delete")}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => onDelete(change)}
                    type="button"
                  >
                    <HugeiconsIcon icon={Delete01Icon} size={14} strokeWidth={1.75} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        </CardBody>
      </div>
    </div>
  );
}

/**
 * What moved, in both directions.
 *
 * The table below it is ranked by volume, which is the right default and which
 * structurally buries this: a keyword that went from 4 clicks to 60 is the
 * best news on the page and sits on row 90. Gains and losses get their own two
 * short lists so the answer to "what changed" is above the fold.
 */
function Movers({
  kind,
  locale,
  rows,
  t,
}: {
  readonly kind: "page" | "query";
  readonly locale: string;
  readonly rows: readonly ComparedRow[];
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const moved = rankByMovement(rows, rows.length);
  const gained = moved.filter((row) => row.clicksChange > 0).slice(0, 5);
  const lost = moved.filter((row) => row.clicksChange < 0).slice(-5).reverse();
  if (gained.length === 0 && lost.length === 0) return null;

  const list = (entries: readonly ComparedRow[], empty: string) =>
    entries.length === 0 ? (
      <p className="text-muted-foreground text-xs">{empty}</p>
    ) : (
      <ul className="space-y-2">
        {entries.map((row) => (
          <li className="flex items-baseline gap-3 text-sm" key={row.key}>
            <span className="min-w-0 flex-1 truncate" title={row.key}>
              {kind === "page" ? prettyPath(row.key) : row.key}
            </span>
            <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
              {formatCount(row.current.clicks, locale)}
            </span>
            <DeltaChip
              compact
              tone={toneForChange(row.clicksChange)}
              value={`${row.clicksChange > 0 ? "+" : "−"}${formatCount(Math.abs(row.clicksChange), locale)}`}
            />
          </li>
        ))}
      </ul>
    );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-[20px] border border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
        <div className="overflow-hidden rounded-[14px] border border-border/50 bg-card shadow-xs">
          <CardHeader>
            <CardTitle>{t("seo.gainers")}</CardTitle>
            <CardDescription>{t("seo.gainersSubtitle")}</CardDescription>
          </CardHeader>
          <div className="mx-5 h-px bg-border/50" />
          <CardBody>{list(gained, t("seo.noGainers"))}</CardBody>
        </div>
      </div>
      <div className="rounded-[20px] border border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
        <div className="overflow-hidden rounded-[14px] border border-border/50 bg-card shadow-xs">
          <CardHeader>
            <CardTitle>{t("seo.losers")}</CardTitle>
            <CardDescription>{t("seo.losersSubtitle")}</CardDescription>
          </CardHeader>
          <div className="mx-5 h-px bg-border/50" />
          <CardBody>{list(lost, t("seo.noLosers"))}</CardBody>
        </div>
      </div>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <div className="space-y-4 p-5">
              <SkeletonBar width="45%" />
              <SkeletonBar className="h-6" />
              <SkeletonBar width="60%" />
            </div>
          </Card>
        ))}
      </div>
      <Card>
        <div className="space-y-3 p-5">
          <SkeletonBar width="30%" />
          <SkeletonBar className="h-40" />
        </div>
      </Card>
    </div>
  );
}

/** Queries/pages tabs: the table card only. Movers appear only when there
 *  is movement, so their skeleton cards would promise cards that may never
 *  land — the pair pops in with the data instead. */
function TableSkeleton() {
  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-3 p-5">
          <SkeletonBar width="30%" />
          <SkeletonBar className="h-10" />
          <SkeletonBar />
          <SkeletonBar />
          <SkeletonBar width="80%" />
        </div>
      </Card>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function SeoPage() {
  const t = useT();
  const { locale } = useI18n();
  const reduce = useReducedMotion();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { toast } = useToast();

  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState<RangeId>("28d");
  const [site, setSite] = useState<string | null>(null);
  /** One cached view per tab, like the audit tab keeps its own list: going
   *  back to a tab paints its own data at once and refreshes underneath,
   *  so switching tabs never flashes placeholders — or another tab's rows. */
  const [cache, setCache] = useState<Partial<Record<Tab, SeoResponse>>>({});
  const data = cache[tab] ?? null;
  // Two different loads. The first paint of the page owns the full skeleton;
  // a tab or range change must never take the header and the pickers down
  // with it, or every filter change looks like a navigation.
  const [isLoading, setIsLoading] = useState(true);
  const [panelLoading, setPanelLoading] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  /** No Google account connected. Nothing here can succeed until one is, so
   *  the page stops asking and explains instead. */
  const [notConnected, setNotConnected] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("clicks");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [changeOpen, setChangeOpen] = useState(false);
  /** The view currently on screen, keyed by the property the route *resolved*
   *  rather than the one that was asked for. The first load runs with no
   *  property chosen and adopts whichever one comes back, which re-fires the
   *  effect below for data already in hand; without this that opening page
   *  load spent every Search Console call twice. */
  const showing = useRef<string | null>(null);

  const load = async (options: { readonly quiet?: boolean } = {}) => {
    // Pinned: a tab switch mid-flight must not file the answer under the
    // tab that happens to be open when it lands.
    const loadTab = tab;
    const loadRange = range;
    const loadSite = site;
    // Skeleton only when this tab has nothing to show yet. Revisits paint
    // the cached view at once; the refresh lands underneath.
    if (!options.quiet && !cache[loadTab]) setPanelLoading(true);

    const params = new URLSearchParams({ range: loadRange, tab: loadTab });
    if (loadSite) params.set("site", loadSite);
    const result = await fetchJson<SeoResponse>(`/api/seo?${params}`, t);

    setIsLoading(false);
    setPanelLoading(false);

    if (!result.ok) {
      // "No Google account yet" arrives as a 200 carrying an error body,
      // because it is a state of the install rather than a failed request.
      if (isApiError(result.error) && result.error.code === "not_configured") {
        setNotConnected(true);
        setError(null);
        return;
      }
      setNotConnected(false);
      setError(result.error);
      return;
    }

    setNotConnected(false);
    setError(null);
    setCache((prev) => ({ ...prev, [loadTab]: result.data }));
    showing.current = `${loadTab}:${loadRange}:${result.data.site ?? ""}`;
    // The route resolves the default property; adopting it here keeps the
    // picker and the data in agreement without a second round trip.
    if (!loadSite && result.data.site) setSite(result.data.site);
  };

  useEffect(() => {
    // The audit tab reads its own endpoint from its own panel — nothing
    // here is Search Console, so nothing here needs this load.
    if (tab === "audit") return;
    // Already showing exactly this view — see `showing`.
    if (site && showing.current === `${tab}:${range}:${site}`) return;
    void load();
    // `site` is intentionally in the deps: switching property refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, site, tab]);

  const changes = data?.changes ?? [];
  const series = data?.series?.current ?? [];
  const totals = data?.totals;

  /* Derived, not memoized. The lists this page sorts are hundreds of rows,
     not thousands, and the compiler memoizes what is worth memoizing — a
     hand-written dependency array here only stopped it from doing so. */
  const deltas = totals
    ? {
      clicks: metricDelta(totals.current.clicks, totals.previous.clicks),
      impressions: metricDelta(totals.current.impressions, totals.previous.impressions),
      ctr: metricDelta(totals.current.ctr, totals.previous.ctr),
      position: metricDelta(totals.current.position, totals.previous.position),
    }
    : null;

  const needle = search.trim().toLowerCase();
  const filtered = sortRows(
    needle ? (data?.rows ?? []).filter((row) => row.key.toLowerCase().includes(needle)) : (data?.rows ?? []),
    sort,
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  const removeChange = async (change: SeoChange) => {
    if (!(await confirm({ title: t("seo.confirmDeleteChange"), description: change.note }))) return;
    const result = await fetchJson<{ ok: boolean }>(`/api/seo?id=${encodeURIComponent(change.id)}`, t, {
      method: "DELETE",
    });
    if (!result.ok) {
      toast({
        description: t("common.somethingWentWrongDescription"),
        status: "error",
        title: t("common.somethingWentWrong"),
      });
      return;
    }
    void load({ quiet: true });
  };

  const switchSite = async (next: string) => {
    setSite(next);
    // Remembered for the next visit. A failure here is not worth a banner —
    // the page is already showing the property that was asked for.
    void fetchJson<{ site: string }>("/api/seo", t, {
      body: JSON.stringify({ site: next }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
  };

  const sites = data?.sites ?? [];
  const period = data?.period?.current;
  const kind = tab === "pages" ? "page" : "query";

  return (
    <PageContainer maxWidth="max-w-6xl">
      <div className="content-enter">
        <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <h1 className="font-semibold text-2xl">{t("seo.title")}</h1>
            <p className="mt-1 text-muted-foreground text-sm">
              {period
                ? t("seo.subtitleDated", {
                  from: fullDay(period.start, locale),
                  to: fullDay(period.end, locale),
                })
                : t("seo.subtitle")}
            </p>
          </div>

          {sites.length > 0 ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {sites.length > 1 ? (
                <Select onValueChange={(next) => {
                  setPage(1);
                  void switchSite(next);
                }} value={site ?? undefined}>
                  <SelectTrigger aria-label={t("seo.property")} className="w-full sm:w-[210px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map((entry) => (
                      <SelectItem key={entry.url} value={entry.url}>
                        {siteLabel(entry.url)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <ChartSelector onChange={(next) => {
                setPage(1);
                setRange(next as RangeId);
              }} value={range} label={t("common.filterByPeriod")} options={RANGE_IDS.map((id) => ({ value: id, label: t(`seo.range.${id}`) }))} className="mt-0 w-full min-w-0 justify-start sm:w-auto" />
            </div>
          ) : null}
        </header>

        {/* The tab bar is always on screen: the audit tab needs no Google
            account, and hiding it behind a connection state would bury the
            one part of this page that works without one. */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <SlidingTabs
              onValueChange={(next) => {
                setPage(1);
                setSearch("");
                setTab(next as Tab);
              }}
              tabs={[
                { id: "overview", label: t("seo.tabOverview") },
                { id: "queries", label: t("seo.tabQueries") },
                { id: "pages", label: t("seo.tabPages") },
                { id: "audit", label: t("seo.tabAudit") },
              ]}
              value={tab}
            />
          </div>

          {tab === "queries" || tab === "pages" ? (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <Select onValueChange={(next) => {
                setPage(1);
                setSort(next as SortKey);
              }} value={sort}>
                <SelectTrigger aria-label={t("seo.sortBy")} className="w-full sm:w-[170px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="clicks">{t("seo.sortClicks")}</SelectItem>
                  <SelectItem value="movement">{t("seo.sortMovement")}</SelectItem>
                  <SelectItem value="impressions">{t("seo.sortImpressions")}</SelectItem>
                  <SelectItem value="position">{t("seo.sortPosition")}</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative w-full sm:w-56">
                <HugeiconsIcon
                  className="-translate-y-1/2 absolute top-1/2 left-3 text-muted-foreground"
                  icon={SearchIcon}
                  size={16}
                  strokeWidth={1.75}
                />
                <Input
                  aria-label={t(kind === "page" ? "seo.searchPages" : "seo.searchQueries")}
                  className="pl-9"
                  onChange={(event) => {
                    setPage(1);
                    setSearch(event.target.value);
                  }}
                  placeholder={t(kind === "page" ? "seo.searchPages" : "seo.searchQueries")}
                  value={search}
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* Nothing in the Search Console tabs is retryable by pressing a
            button: a missing account and a missing grant are both fixed on
            the Connections page. */}
        {tab === "audit" ? (
          <SiteAuditPanel />
        ) : notConnected ? (
          <EmptyState
            action={{ href: "/connections", label: t("seo.connectGoogle") }}
            body={t("seo.notConnectedBody")}
            title={t("seo.notConnected")}
          />
        ) : data?.needsScope ? (
          <EmptyState
            action={{ href: "/connections", label: t("seo.reconnectGoogle") }}
            body={t("seo.needsScopeBody")}
            title={t("seo.needsScope")}
          />
        ) : (
          <>
            <ErrorBanner className="mb-6" error={error} onRetry={() => void load()} />

            {isLoading ? (
              <PanelSkeleton />
            ) : data === null ? (
              // The seam between the tab switch and its first byte: no empty
              // state may paint from absent data — only this tab's skeleton.
              // (notConnected above is resolved state, so it still wins.)
              tab === "overview" ? <PanelSkeleton /> : <TableSkeleton />
            ) : sites.length === 0 ? (
              <EmptyState
                action={{
                  href: "https://search.google.com/search-console",
                  label: t("seo.openSearchConsole"),
                }}
                body={t("seo.noPropertiesBody")}
                title={t("seo.noProperties")}
              />
            ) : (
              <>
                <motion.div
                  animate={{ opacity: 1 }}
                  initial={reduce ? false : { opacity: 0 }}
                  key={panelLoading ? `${tab}-loading` : tab}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                >
                  {panelLoading ? (
                    tab === "overview" ? <PanelSkeleton /> : <TableSkeleton />
                  ) : tab === "overview" ? (
                    <div className="space-y-4">
                      {totals && deltas ? (
                        <CardCarousel label="Estadísticas SEO">
                          <div className="flex items-stretch gap-4" style={{ paddingInline: "2px" }}>
                            <div className="min-w-[200px] flex-1">
                              <KpiCard
                                delta={tileDelta(deltas.clicks, t("seo.vsPrevious"))}
                                icon={MouseLeftClick01Icon}
                                label={t("seo.clicks")}
                                value={formatCount(totals.current.clicks, locale)}
                                visual={<KpiSparkline points={series.map((row) => row.clicks)} />}
                              />
                            </div>
                            <div className="min-w-[200px] flex-1">
                              <KpiCard
                                delta={tileDelta(deltas.impressions, t("seo.vsPrevious"))}
                                icon={ScanSearchAreaIcon}
                                label={t("seo.impressions")}
                                value={formatCount(totals.current.impressions, locale)}
                                visual={<KpiSparkline points={series.map((row) => row.impressions)} />}
                              />
                            </div>
                            <div className="min-w-[200px] flex-1">
                              <KpiCard
                                delta={tileDelta(deltas.ctr, t("seo.vsPrevious"), {
                                  // Percentage points. A CTR that went 1% → 2% did
                                  // double, but "+100%" in a column of percentages
                                  // reads as a rate of 100%.
                                  formatted: `${deltas.ctr.change >= 0 ? "+" : "−"}${Math.abs(deltas.ctr.change * 100).toFixed(2)} pp`,
                                })}
                                icon={ChartLineData01Icon}
                                label={t("seo.ctr")}
                                value={formatRate(totals.current.ctr)}
                                visual={<KpiSparkline points={series.map((row) => row.ctr)} />}
                              />
                            </div>
                            <div className="min-w-[200px] flex-1">
                              <KpiCard
                                delta={tileDelta(deltas.position, t("seo.vsPrevious"), {
                                  // Signed as places climbed, so the arrow and the
                                  // colour agree with each other and with the table.
                                  formatted:
                                    formatPositionChange(deltas.position.previous - deltas.position.current) ??
                                    t("seo.unchanged"),
                                  higherIsBetter: false,
                                })}
                                icon={Target02Icon}
                                label={t("seo.position")}
                                value={formatPosition(totals.current.position)}
                                /* Negated: Search Console counts down from 1, so an
                                   improving ranking draws as a falling line unless
                                   the series is flipped first. */
                                visual={<KpiSparkline points={series.map((row) => -row.position)} />}
                              />
                            </div>
                          </div>
                        </CardCarousel>
                      ) : null}

                      <div className="rounded-[20px] border border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
                        <div className="overflow-hidden rounded-[14px] border border-border/50 bg-card shadow-xs">
                          <CardHeader>
                            <CardTitle>{t("seo.trafficTitle")}</CardTitle>
                            <CardDescription>{t("seo.trafficSubtitle")}</CardDescription>
                            <span className="ml-auto"><ChartPeriod value={range}>{t(`seo.range.${range}`)}</ChartPeriod></span>
                          </CardHeader>
                          <div className="mx-5 h-px bg-border/50" />
                          <CardBody>
                            <TrafficChart changes={changes} locale={locale} series={series} t={t} />
                          </CardBody>
                        </div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-[20px] border border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
                          <div className="overflow-hidden rounded-[14px] border border-border/50 bg-card shadow-xs">
                            <CardHeader>
                              <CardTitle>{t("seo.devicesTitle")}</CardTitle>
                              <CardDescription>{t("seo.devicesSubtitle")}</CardDescription>
                            </CardHeader>
                            <div className="mx-5 h-px bg-border/50" />
                            <CardBody>
                              <DonutChart
                                data={(data?.devices ?? []).map((row) => ({
                                  formatted: formatCount(row.clicks, locale),
                                  key: row.key,
                                  label: DEVICE_KEYS[row.key] ? t(DEVICE_KEYS[row.key]) : row.key,
                                  value: row.clicks,
                                }))}
                                emptyLabel={t("seo.noTraffic")}
                              />
                            </CardBody>
                          </div>
                        </div>
                        <div className="rounded-[20px] border border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
                          <div className="overflow-hidden rounded-[14px] border border-border/50 bg-card shadow-xs">
                            <CardHeader>
                              <CardTitle>{t("seo.countriesTitle")}</CardTitle>
                              <CardDescription>{t("seo.countriesSubtitle")}</CardDescription>
                            </CardHeader>
                            <div className="mx-5 h-px bg-border/50" />
                            <CardBody>
                              <RankedBars
                                bars={(data?.countries ?? []).map((row) => ({
                                  formatted: formatCount(row.clicks, locale),
                                  key: row.key,
                                  label: countryLabel(row.key, locale),
                                  value: row.clicks,
                                }))}
                                emptyLabel={t("seo.noTraffic")}
                              />
                            </CardBody>
                          </div>
                        </div>
                      </div>

                      <ChangeLog
                        changes={changes}
                        locale={locale}
                        onAdd={() => setChangeOpen(true)}
                        onDelete={(change) => void removeChange(change)}
                        series={series}
                        t={t}
                      />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Movers kind={kind} locale={locale} rows={data?.rows ?? []} t={t} />

                      <Card className="rounded-[20px] border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
                        <div className="overflow-hidden rounded-[14px] border border-border/50 bg-card shadow-xs">
                        <CardHeader>
                          <CardTitle>
                            {t(kind === "page" ? "seo.pagesTitle" : "seo.queriesTitle")}
                          </CardTitle>
                          <CardDescription>
                            {t(kind === "page" ? "seo.pagesSubtitle" : "seo.queriesSubtitle")}
                          </CardDescription>
                        </CardHeader>
                        <div className="mx-5 h-px bg-border/50" />
                        <div className="px-5 py-4">
                        <SeoTable
                          emptyLabel={search ? t("seo.noResults") : t("seo.noTraffic")}
                          kind={kind}
                          locale={locale}
                          rows={visible}
                          t={t}
                        />
                        </div>
                        </div>
                      </Card>

                      {filtered.length > 0 ? (
                        <Pagination
                          onPageChange={setPage}
                          onPageSizeChange={setPageSize}
                          page={page}
                          pageCount={pageCount}
                          pageSize={pageSize}
                          pageSizeOptions={[10, 20, 50]}
                        />
                      ) : null}

                      {(data?.lost ?? []).length > 0 ? (
                        <div className="rounded-[20px] border border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
                          <div className="overflow-hidden rounded-[14px] border border-border/50 bg-card shadow-xs">
                            <CardHeader>
                              <CardTitle>{t("seo.lostTitle")}</CardTitle>
                              <CardDescription>
                                {t(kind === "page" ? "seo.lostPagesSubtitle" : "seo.lostSubtitle")}
                              </CardDescription>
                            </CardHeader>
                            <div className="mx-5 h-px bg-border/50" />
                            <CardBody>
                            <ul className="space-y-2">
                              {(data?.lost ?? []).map((row) => (
                                <li className="flex items-baseline gap-3 text-sm" key={row.key}>
                                  <span className="min-w-0 flex-1 truncate" title={row.key}>
                                    {kind === "page" ? prettyPath(row.key) : row.key}
                                  </span>
                                  <DeltaChip
                                    compact
                                    tone="critical"
                                    value={`−${formatCount(row.clicks, locale)}`}
                                  />
                                </li>
                              ))}
                            </ul>
                            </CardBody>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </motion.div>
              </>
            )}
          </>
        )}
      </div>

      <ChangeDialog
        onOpenChange={setChangeOpen}
        onSaved={() => void load({ quiet: true })}
        open={changeOpen}
      />
      {confirmDialog}
    </PageContainer>
  );
}

/** A state the page cannot fix by retrying: no account, no grant, no property.
 *  Each names the one place the fix lives instead of offering a retry button
 *  that would fail identically. */
function EmptyState({
  action,
  body,
  title,
}: {
  readonly action: { readonly href: string; readonly label: string };
  readonly body: string;
  readonly title: string;
}) {
  const external = action.href.startsWith("http");
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">

        <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
          <GoogleMark size={20} />
        </div>
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="max-w-xs text-xs text-muted-foreground">{body}</p>
        </div>
        <Button asChild size="sm" variant="secondary">
          <a
            href={action.href}
            {...(external ? { rel: "noreferrer noopener", target: "_blank" } : {})}
          >
            {action.label}
          </a>
        </Button>
      </div>
    </Card>
  );
}
