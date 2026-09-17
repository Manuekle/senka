"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { ArrowDown01Icon, ArrowUp01Icon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { Card } from "./dashboard-card";
import { cn } from "@/lib/utils";

/**
 * The rows the Meta Ads page is made of, and the vocabulary that turns Meta's
 * API into something a shop owner can read.
 *
 * They live here rather than inside `app/ads/page.tsx` because the landing
 * renders the same page as a figure, and the two had already drifted: the
 * product printed `OUTCOME_AWARENESS · PAUSED` while the marketing screenshot
 * printed «Reconocimiento · En pausa». One of them was lying about the other.
 * Now there is one row.
 *
 * Everything here takes display strings, not numbers. Formatting money and
 * counts needs the caller's locale and the caller's units — Meta sends budgets
 * in minor units and spend in major ones — and a presentational row is the
 * wrong place to know that.
 */

// ── Meta's vocabulary ───────────────────────────────────────────────

/**
 * Objective enums, current and legacy. Meta renamed the whole set to
 * `OUTCOME_*` with Ads Manager's 2022 consolidation but still returns the old
 * names on campaigns created before it, so both spellings have to land on the
 * same word.
 */
const OBJECTIVE_KEYS: Readonly<Record<string, string>> = {
  APP_INSTALLS: "ads.objApp",
  BRAND_AWARENESS: "ads.objAwareness",
  CONVERSIONS: "ads.objSales",
  EVENT_RESPONSES: "ads.objEngagement",
  LEAD_GENERATION: "ads.objLeads",
  LINK_CLICKS: "ads.objTraffic",
  MESSAGES: "ads.objMessages",
  OUTCOME_APP_PROMOTION: "ads.objApp",
  OUTCOME_AWARENESS: "ads.objAwareness",
  OUTCOME_ENGAGEMENT: "ads.objEngagement",
  OUTCOME_LEADS: "ads.objLeads",
  OUTCOME_SALES: "ads.objSales",
  OUTCOME_TRAFFIC: "ads.objTraffic",
  POST_ENGAGEMENT: "ads.objEngagement",
  PRODUCT_CATALOG_SALES: "ads.objSales",
  REACH: "ads.objAwareness",
  VIDEO_VIEWS: "ads.objVideo",
};

const STATUS_KEYS: Readonly<Record<string, string>> = {
  ACTIVE: "ads.statusActive",
  ARCHIVED: "ads.statusArchived",
  DELETED: "ads.statusDeleted",
  PAUSED: "ads.statusPaused",
};

/**
 * `OUTCOME_APP_PROMOTION` → `App promotion`. The fallback for anything Meta
 * adds after this file was written: still not a translation, but a phrase
 * rather than a shout.
 */
function humanizeEnum(raw: string): string {
  const words = raw.replace(/^OUTCOME_/, "").toLowerCase().split("_").filter(Boolean);
  if (words.length === 0) return raw;
  return words.join(" ").replace(/^./, (c) => c.toUpperCase());
}

export function formatObjective(raw: string, t: (key: string) => string): string {
  const key = OBJECTIVE_KEYS[raw?.toUpperCase() ?? ""];
  return key ? t(key) : humanizeEnum(raw ?? "");
}

export function formatStatus(raw: string, t: (key: string) => string): string {
  const key = STATUS_KEYS[raw?.toUpperCase() ?? ""];
  return key ? t(key) : humanizeEnum(raw ?? "");
}

/**
 * The dot that carries delivery state.
 *
 * It replaces a 40px megaphone tile washed emerald or amber. Every row had the
 * same megaphone, so the icon said nothing and its tint said everything — the
 * loudest element on the page was also the least informative one. A 6px dot
 * says the same thing, and leaves the row's colour budget for the numbers.
 */
export function AdsStatusDot({ status }: { readonly status: string }) {
  const upper = status?.toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        upper === "ACTIVE"
          ? "bg-emerald-500"
          : upper === "PAUSED"
            ? "bg-amber-500"
            : "bg-muted-foreground/40",
      )}
    />
  );
}

// ── Row parts ───────────────────────────────────────────────────────

/**
 * One aligned column in a row: the figure, and its name underneath.
 *
 * Three or four of these are what stop a row being a name pinned to the left
 * edge and a total pinned to the right with half the table's width of nothing
 * in between. Fixed width and `tabular-nums`, so the digits line up down the
 * whole list instead of jittering row to row.
 */
export function AdsMetric({
  label,
  value,
  width = "w-[86px]",
}: {
  readonly label: string;
  readonly value: string;
  readonly width?: string;
}) {
  return (
    <div className={cn("text-right", width)}>
      <p className="font-medium text-[13px] tabular-nums">{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

/** One label/value pair inside an opened row. */
export function AdsDetailCell({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-0.5 font-medium text-sm tabular-nums">{value}</p>
    </div>
  );
}

/**
 * How much of a budget the campaign has already eaten.
 *
 * The old panel printed budget and remaining as two unrelated figures and left
 * the subtraction to the reader. The bar is the same two numbers with the
 * comparison already done, which is the only reason anyone looks at them
 * together.
 */
export function AdsBudgetBar({
  caption,
  label,
  ratio,
  value,
}: {
  readonly caption: string;
  readonly label: string;
  /** Consumed share, 0–1. Clamped, because Meta over-delivers. */
  readonly ratio: number;
  readonly value: string;
}) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="font-medium text-sm tabular-nums">{value}</p>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-foreground/45" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">{caption}</p>
    </div>
  );
}

/**
 * The shell both tabs share: a card whose head is one focusable control and
 * whose body only exists while it is open.
 *
 * The head was a `div` with an `onClick` — a control with no role, no keyboard
 * path and no `aria-expanded`, which is a row you cannot open without a mouse.
 */
export function AdsRow({
  actions,
  children,
  expanded,
  label,
  leading,
  metrics,
  onToggle,
  subtitle,
  title,
  trailing,
}: {
  /**
   * Row-level controls (a menu, a switch). Rendered *beside* the head button
   * rather than inside it: a button nested in a button is invalid HTML, and
   * in practice the outer one swallows the click, so the row would expand
   * instead of firing the action.
   */
  readonly actions?: ReactNode;
  /** The panel. Rendered only while open. */
  readonly children?: ReactNode;
  readonly expanded: boolean;
  /** Names the control for anyone who cannot see the row. */
  readonly label: string;
  readonly leading?: ReactNode;
  readonly metrics?: ReactNode;
  readonly onToggle?: () => void;
  readonly subtitle: ReactNode;
  readonly title: string;
  readonly trailing?: ReactNode;
}) {
  return (
    <Card>
      {/* The hover tint lives on the wrapper, not the button, so the strip
          under the actions lights up with the rest of the row instead of
          stopping short of it. */}
      <div className="group flex items-stretch rounded-2xl transition-colors duration-150 hover:bg-muted/40">
        <button
          aria-expanded={expanded}
          aria-label={label}
          className="flex min-w-0 flex-1 items-center gap-4 rounded-2xl px-5 py-4 text-left"
          onClick={onToggle}
          type="button"
        >
          {leading}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-sm">{title}</p>
            <div className="mt-0.5 flex items-center gap-1.5 truncate text-muted-foreground text-xs">
              {subtitle}
            </div>
          </div>
          {metrics}
          {trailing}
          <HugeiconsIcon
            className="shrink-0 text-muted-foreground"
            icon={expanded ? ArrowUp01Icon : ArrowDown01Icon}
            size={14}
            strokeWidth={1.75}
          />
        </button>
        {actions ? (
          <div className="flex shrink-0 items-center gap-1 pr-3 pl-1">{actions}</div>
        ) : null}
      </div>

      {expanded && children ? (
        <div className="border-border border-t px-5 py-4">{children}</div>
      ) : null}
    </Card>
  );
}

// ── The two rows ────────────────────────────────────────────────────

/** Everything a campaign row prints, already formatted by the caller. */
export type CampaignRowView = {
  readonly budgetCaption: string | null;
  readonly budgetLabel: string;
  /** Consumed share of the budget, 0–1, or null when Meta sent no budget. */
  readonly budgetRatio: number | null;
  readonly budgetValue: string;
  readonly clicks: string;
  readonly conversions: string;
  readonly cpc: string;
  readonly cpm: string;
  readonly ctr: string;
  readonly impressions: string;
  readonly name: string;
  /** Already through `formatObjective`. */
  readonly objective: string;
  readonly spend: string;
  /** Meta's own value — it drives the dot, not the copy. */
  readonly status: string;
  /** Already through `formatStatus`. */
  readonly statusLabel: string;
};

export function CampaignRow({
  actions,
  expanded,
  labels,
  onToggle,
  view,
}: {
  /** Pause, edit, delete. Absent on the landing screenshot, which renders
   *  this same row with nothing to click. */
  readonly actions?: ReactNode;
  readonly expanded: boolean;
  /** Column and cell headings, so the row needs no translator of its own. */
  readonly labels: {
    readonly clicks: string;
    readonly conversions: string;
    readonly cpc: string;
    readonly cpm: string;
    readonly ctr: string;
    readonly impressions: string;
    readonly spend: string;
  };
  readonly onToggle?: () => void;
  readonly view: CampaignRowView;
}) {
  return (
    <AdsRow
      actions={actions}
      expanded={expanded}
      label={view.name}
      leading={<AdsStatusDot status={view.status} />}
      metrics={
        <>
          {/* Three columns disappear before the fourth does: spend is the one
              figure worth the width on a phone. */}
          <div className="hidden items-center gap-6 xl:flex">
            <AdsMetric label={labels.impressions} value={view.impressions} />
            <AdsMetric label={labels.clicks} value={view.clicks} />
            <AdsMetric label={labels.ctr} value={view.ctr} width="w-[62px]" />
          </div>
          <div className="hidden sm:block">
            <AdsMetric label={labels.spend} value={view.spend} width="w-[92px]" />
          </div>
        </>
      }
      onToggle={onToggle}
      subtitle={
        <>
          {view.objective}
          <span aria-hidden="true" className="text-muted-foreground">
            ·
          </span>
          {view.statusLabel}
        </>
      }
      title={view.name}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {view.budgetRatio === null ? (
          <AdsDetailCell label={view.budgetLabel} value={view.budgetValue} />
        ) : (
          <AdsBudgetBar
            caption={view.budgetCaption ?? ""}
            label={view.budgetLabel}
            ratio={view.budgetRatio}
            value={view.budgetValue}
          />
        )}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <AdsDetailCell label={labels.cpc} value={view.cpc} />
          <AdsDetailCell label={labels.cpm} value={view.cpm} />
          <AdsDetailCell label={labels.conversions} value={view.conversions} />
        </div>
      </div>
    </AdsRow>
  );
}

/** Everything a lead row prints, already formatted by the caller. */
export type LeadRowView = {
  readonly contact: string;
  readonly date: string;
  readonly fields: readonly { readonly name: string; readonly value: string }[];
  readonly form: string;
  readonly name: string;
  readonly time: string;
};

export function LeadRow({
  expanded,
  labels,
  onToggle,
  view,
}: {
  readonly expanded: boolean;
  readonly labels: { readonly date: string; readonly form: string };
  readonly onToggle?: () => void;
  readonly view: LeadRowView;
}) {
  return (
    <AdsRow
      expanded={expanded}
      label={view.name}
      leading={
        /* The initial, not a megaphone. Every lead used to carry the same
           campaign icon, which told you the row was from Meta — something the
           page's title had already said. */
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted font-medium text-muted-foreground text-xs uppercase shadow-[var(--shadow-inset)]">
          {view.name.trim().charAt(0) || "?"}
        </span>
      }
      metrics={
        <div className="hidden lg:block">
          <AdsMetric label={labels.form} value={view.form} width="w-[150px]" />
        </div>
      }
      onToggle={onToggle}
      subtitle={view.contact}
      title={view.name}
      trailing={
        <span className="hidden text-muted-foreground text-xs tabular-nums sm:block">
          {view.time}
        </span>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {view.fields.map((field) => (
          <AdsDetailCell key={field.name} label={field.name} value={field.value} />
        ))}
        <AdsDetailCell label={labels.form} value={view.form} />
        <AdsDetailCell label={labels.date} value={view.date} />
      </div>
    </AdsRow>
  );
}
