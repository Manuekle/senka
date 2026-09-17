"use client";

import { useCallback, useEffect, useRef } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  ArrowDownRight01Icon,
  ArrowUpRight01Icon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons";
import { CHART_TONE_STROKE, type ChartTone } from "@/app/_components/chart";
import {
  formatChange,
  formatCount,
  formatPercentChange,
  formatPosition,
  formatPositionChange,
  formatRate,
  type ComparedRow,
} from "@/lib/seo-metrics";
import { cn } from "@/lib/utils";

/**
 * The table both the keyword view and the page view are made of.
 *
 * One table because the two are the same question asked of a different
 * dimension — what brought people here, and is it bringing more or fewer than
 * it was — and every column means the same thing in both. The only difference
 * is what the first cell holds: a phrase somebody typed, or a URL worth
 * opening.
 *
 * Every metric carries its movement next to it rather than in a second table
 * of "changes". A click count with no previous value is the number that makes
 * an SEO page useless: 340 clicks is a triumph or a disaster depending
 * entirely on what it was a month ago, and putting the two figures a scroll
 * apart means nobody ever compares them.
 */

export type SortKey = "clicks" | "impressions" | "movement" | "position";

// ── Movement chip ──────────────────────────────────────────────────

/**
 * A change, its arrow, and its colour.
 *
 * `higherIsBetter` is the whole reason this takes a prop instead of colouring
 * by sign. Clicks up is green and clicks down is red; a *position* is a
 * ranking counted from 1, so it has already been signed as places-climbed by
 * the time it reaches here — which is why this component never inverts
 * anything itself and the caller is the one that knows.
 */
export function DeltaChip({
  compact,
  label,
  tone,
  value,
}: {
  /** Drops the label, for a chip that sits inside a table cell. */
  readonly compact?: boolean;
  readonly label?: string;
  readonly tone: ChartTone;
  /** Pre-formatted and signed. */
  readonly value: string;
}) {
  const flat = tone === "neutral";
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", CHART_TONE_STROKE[tone])}>
      {flat ? null : (
        <HugeiconsIcon
          className="shrink-0"
          icon={tone === "positive" ? ArrowUpRight01Icon : ArrowDownRight01Icon}
          size={12}
          strokeWidth={2}
        />
      )}
      <span className="font-medium tabular-nums">{value}</span>
      {label && !compact ? <span className="text-muted-foreground">{label}</span> : null}
    </span>
  );
}

/** Green for growth, red for loss, grey for a number that did not move. */
export function toneForChange(change: number): ChartTone {
  if (change > 0) return "positive";
  if (change < 0) return "critical";
  return "neutral";
}

// ── Cells ──────────────────────────────────────────────────────────

function MetricCell({
  change,
  formatted,
  percent,
  newLabel,
  isNew,
}: {
  readonly change: number;
  readonly formatted: string;
  readonly isNew?: boolean;
  readonly newLabel?: string;
  readonly percent?: string | null;
}) {
  return (
    <td className="py-3 pr-4 text-right">
      <div className="flex flex-col items-end gap-0.5">
        <span className="font-medium tabular-nums">{formatted}</span>
        {isNew ? (
          <span className="text-[11px] text-emerald-500">{newLabel}</span>
        ) : (
          <DeltaChip
            compact
            tone={toneForChange(change)}
            value={percent ?? formatChange(change)}
          />
        )}
      </div>
    </td>
  );
}

// ── Table ──────────────────────────────────────────────────────────

const SORTERS: Record<SortKey, (a: ComparedRow, b: ComparedRow) => number> = {
  clicks: (a, b) => b.current.clicks - a.current.clicks,
  impressions: (a, b) => b.current.impressions - a.current.impressions,
  movement: (a, b) => b.clicksChange - a.clicksChange,
  // Ascending: position 1 is the best row on the page, so "sorted by position"
  // has to put it first or the column is sorted backwards from what it says.
  position: (a, b) => a.current.position - b.current.position,
};

export function sortRows(rows: readonly ComparedRow[], key: SortKey): ComparedRow[] {
  return [...rows].sort(SORTERS[key]);
}

export function SeoTable({
  emptyLabel,
  kind,
  locale,
  rows,
  t,
}: {
  readonly emptyLabel: string;
  /** A query is text; a page is a URL and gets a link out to itself. */
  readonly kind: "page" | "query";
  readonly locale: string;
  readonly rows: readonly ComparedRow[];
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  /* Edge fade, mobile only. At the start only the far edge fades; once
     scrolled, the passed edge fades in; at the end the far fade lifts.
     Desktop never overflows, so the mask stays off there. */
  const updateFade = useCallback(() => {
    const el = scrollRef.current;
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
    updateFade();
    const el = scrollRef.current;
    el?.addEventListener("scroll", updateFade, { passive: true });
    window.addEventListener("resize", updateFade);
    return () => {
      el?.removeEventListener("scroll", updateFade);
      window.removeEventListener("resize", updateFade);
    };
  }, [updateFade, rows]);

  if (rows.length === 0) {
    return <div className="py-12 text-center text-muted-foreground text-sm">{emptyLabel}</div>;
  }

  return (
    /* Five numeric columns do not fit a phone, and squeezing them wraps every
       keyword onto four lines. The table keeps its width and scrolls inside
       its own card instead — the page itself never scrolls sideways. */
    <div ref={scrollRef} className="x-fade overflow-x-auto scrollbar-hide">
      <table className="w-full min-w-[42rem] text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-muted-foreground text-xs">
            <th className="py-2 pr-4 font-medium">
              {t(kind === "query" ? "seo.columnQuery" : "seo.columnPage")}
            </th>
            <th className="py-2 pr-4 text-right font-medium">{t("seo.clicks")}</th>
            <th className="py-2 pr-4 text-right font-medium">{t("seo.impressions")}</th>
            <th className="py-2 pr-4 text-right font-medium">{t("seo.ctr")}</th>
            <th className="py-2 text-right font-medium">{t("seo.position")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const positionMoved = formatPositionChange(row.positionChange);
            return (
              <tr className="border-b border-border/50 last:border-b-0" key={row.key}>
                <td className="max-w-[22rem] py-3 pr-4">
                  {kind === "page" ? (
                    <a
                      className="inline-flex items-center gap-1.5 truncate font-medium hover:underline"
                      href={row.key}
                      rel="noreferrer noopener"
                      target="_blank"
                      title={row.key}
                    >
                      <span className="truncate">{prettyPath(row.key)}</span>
                      <HugeiconsIcon
                        className="shrink-0 text-muted-foreground"
                        icon={LinkSquare02Icon}
                        size={12}
                        strokeWidth={1.75}
                      />
                    </a>
                  ) : (
                    <span className="block truncate font-medium" title={row.key}>
                      {row.key}
                    </span>
                  )}
                </td>

                <MetricCell
                  change={row.clicksChange}
                  formatted={formatCount(row.current.clicks, locale)}
                  isNew={row.isNew}
                  newLabel={t("seo.new")}
                />
                <MetricCell
                  change={row.impressionsChange}
                  formatted={formatCount(row.current.impressions, locale)}
                  isNew={row.isNew}
                  newLabel={t("seo.new")}
                />
                <MetricCell
                  change={row.ctrChange}
                  formatted={formatRate(row.current.ctr)}
                  isNew={row.isNew}
                  newLabel={t("seo.new")}
                  percent={
                    row.ctrChange === 0
                      ? "0"
                      : `${row.ctrChange > 0 ? "+" : "−"}${Math.abs(row.ctrChange * 100).toFixed(2)} pp`
                  }
                />

                <td className="py-3 text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="font-medium tabular-nums">
                      {formatPosition(row.current.position)}
                    </span>
                    {row.isNew ? (
                      <span className="text-[11px] text-emerald-500">{t("seo.new")}</span>
                    ) : positionMoved ? (
                      <DeltaChip compact tone={toneForChange(row.positionChange)} value={positionMoved} />
                    ) : (
                      <span className="text-[11px] text-muted-foreground">{t("seo.unchanged")}</span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A URL as a path. The host is the same on every row of the table — printing
 *  it two hundred times pushes the part that differs off the edge. */
export function prettyPath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

export { formatCount, formatPercentChange };
