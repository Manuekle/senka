"use client";

import { useMemo, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { AlertCircleIcon, CheckmarkCircle02Icon, ChevronDownIcon } from "@hugeicons/core-free-icons";
import { ScoreGauge } from "@/components/ui/score-gauge";
import { ScoreRing } from "@/components/ui/score-ring";
import { GaugeMeter } from "@/components/ui/gauge-meter";
import { useT } from "@/lib/i18n/provider";
import {
  AUDIT_IMPACT,
  auditHealthScore,
  groupAuditIssues,
  rankAuditGroups,
  type AuditImpact,
  type AuditIssue,
  type AuditIssueType,
} from "@/lib/seo-audit-findings";

// What one expanded audit row shows: the summary the table cannot fit, the
// Lighthouse scores or why they are missing, and the findings grouped by
// kind with the pages each one affects.
//
// The groups read as a to-do list on purpose: one heading per fix ("28
// pages with a title Google truncates"), then the pages. Counted are pages,
// not problems — a page with 30 unannotated images is one fix, listed once.

export type AuditDetailRow = {
  readonly url: string;
  readonly status: "running" | "done" | "failed";
  readonly createdAt: string;
  readonly finishedAt?: string;
  readonly maxPages: number;
  readonly pagesCrawled: number;
  readonly includeLighthouse: boolean;
  readonly lighthouseScores?: {
    readonly performance: number;
    readonly accessibility: number;
    readonly bestPractices: number;
    readonly seo: number;
  } | null;
  readonly lighthouseError?: "quota" | "timeout" | "unavailable";
  readonly error?: string;
  readonly issues?: readonly AuditIssue[];
};

/** How many example paths a group shows before "View details".
 *  Four rows keep every card roughly the same height in the row. */
const VISIBLE_PAGES = 4;

const IMPACT_PILL: Record<AuditImpact, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  low: "bg-muted text-muted-foreground",
};

const IMPACT_DOT: Record<AuditImpact, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-muted-foreground",
};

const IMPACT_LABEL: Record<AuditImpact, string> = {
  critical: "seo.impactCritical",
  high: "seo.impactHigh",
  medium: "seo.impactMedium",
  low: "seo.impactLow",
};

/**
 * One finding as a card: name → what it means → impact → affected
 * pages → examples → details. The pages past the first few hide behind
 * a transitions.dev accordion ("View details"), so a 200-page group
 * doesn't set the height of the row.
 */
function IssueGroupCard({
  pages,
  type,
}: {
  readonly pages: readonly string[];
  readonly type: AuditIssueType;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const impact = AUDIT_IMPACT[type];
  const rest = pages.slice(VISIBLE_PAGES);

  return (
    <div className="min-w-[260px] flex-1 rounded-[20px] border border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
      <div className="rounded-[14px] border border-border/50 bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-sm">{t(`seo.auditIssue.${type}`)}</p>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium ${IMPACT_PILL[impact]}`}>
          <span aria-hidden="true" className={`size-1 rounded-full ${IMPACT_DOT[impact]}`} />
          {t(IMPACT_LABEL[impact])}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-muted-foreground text-xs leading-relaxed">
        {t(`seo.auditIssueDesc.${type}`)}
      </p>
      <p className="mt-2.5 text-[11px] font-medium text-muted-foreground tabular-nums">
        {t("seo.auditPagesAffected", { count: pages.length })}
      </p>
      <ul className="mt-1.5 space-y-1">
        {pages.slice(0, VISIBLE_PAGES).map((page) => (
          <li className="truncate font-mono text-[11px] text-muted-foreground" key={page} title={page}>
            {page || "/"}
          </li>
        ))}
      </ul>
      {rest.length > 0 ? (
        <>
          <div
            className="grid transition-[grid-template-rows] duration-250 ease-smooth-out motion-reduce:transition-none"
            style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
          >
            <div className="overflow-hidden">
              <ul className="space-y-1 pt-1">
                {rest.map((page, index) => (
                  <li
                    className="truncate font-mono text-[11px] text-muted-foreground"
                    key={`${page}-${index}`}
                    title={page}
                  >
                    {page || "/"}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <button
            aria-expanded={open}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-foreground/80 transition-colors hover:text-foreground"
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            {open ? t("seo.auditShowLess") : t("seo.auditViewDetails", { count: rest.length })}
            <HugeiconsIcon
              aria-hidden="true"
              className={`transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
              icon={ChevronDownIcon}
              size={12}
              strokeWidth={2}
            />
          </button>
        </>
      ) : null}
      </div>
    </div>
  );
}

function formatDuration(start: string, end: string): string {
  const seconds = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 1000));
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min`;
}

export function AuditDetail({
  audit,
  previousHealth,
}: {
  readonly audit: AuditDetailRow;
  /** Health of the previous finished audit for the same URL, if any. */
  readonly previousHealth: number | null;
}) {
  const t = useT();

  // Worst impact first, then biggest pile — the groups read as the
  // fix-first list without a separate section for it.
  const groups = useMemo(
    () => rankAuditGroups(groupAuditIssues(audit.issues ?? [])),
    [audit.issues],
  );

  const total = audit.issues?.length ?? 0;
  const duration = audit.finishedAt ? formatDuration(audit.createdAt, audit.finishedAt) : null;
  const lighthouseErrorKey =
    audit.lighthouseError === "quota"
      ? "seo.auditLighthouseQuota"
      : audit.lighthouseError === "timeout"
        ? "seo.auditLighthouseTimeout"
        : "seo.auditLighthouseUnavailable";

  const health =
    audit.status === "done"
      ? auditHealthScore({
        issues: audit.issues ?? [],
        maxPages: audit.maxPages,
        lighthouse: audit.lighthouseScores ?? null,
      })
      : null;
  const healthStatus =
    health === null
      ? null
      : health >= 80
        ? t("seo.healthExcellent")
        : health >= 60
          ? t("seo.healthGood")
          : health >= 40
            ? t("seo.healthFair")
            : t("seo.healthCritical");
  const healthDelta = health !== null && previousHealth !== null ? health - previousHealth : null;

  const categories = audit.lighthouseScores
    ? ([
      ["seo.auditLighthousePerformance", audit.lighthouseScores.performance],
      ["seo.auditLighthouseAccessibility", audit.lighthouseScores.accessibility],
      ["seo.auditLighthouseBestPractices", audit.lighthouseScores.bestPractices],
      ["seo.auditLighthouseSeo", audit.lighthouseScores.seo],
    ] as const)
    : null;

  return (
    <div className="space-y-5 px-1 py-4">
      <p className="text-muted-foreground text-xs tabular-nums">
        {`${audit.pagesCrawled} / ${audit.maxPages} ${t("seo.auditColumnPages").toLowerCase()} · ${total} ${t("seo.auditDetailIssues").toLowerCase()} · ${t("seo.healthCategories", { count: groups.length })}`}
        {duration ? ` · ${duration}` : null}
      </p>

      {health !== null ? (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <ScoreGauge
            label={t("seo.healthTitle")}
            max={100}
            size="md"
            status={healthStatus ?? undefined}
            value={health}
          />
          <div className="min-w-[200px] flex-1 space-y-2">
            <p
              className={
                healthDelta === null || healthDelta === 0
                  ? "text-muted-foreground text-xs tabular-nums"
                  : healthDelta > 0
                    ? "text-emerald-600 text-xs tabular-nums dark:text-emerald-400"
                    : "text-destructive text-xs tabular-nums"
              }
            >
              {healthDelta === null
                ? t("seo.healthFirstAudit")
                : t(healthDelta >= 0 ? "seo.healthDelta" : "seo.healthDeltaDown", {
                  count: healthDelta,
                })}
            </p>
            {categories ? (
              <div className="space-y-2">
                {categories.map(([labelKey, score]) => (
                  <div className="flex items-center gap-2.5" key={labelKey}>
                    <ScoreRing
                      aria-label={`${t(labelKey)}: ${score}`}
                      dimension={32}
                      max={100}
                      size="xs"
                      value={score}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs">{t(labelKey)}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">{score}</span>
                  </div>
                ))}
              </div>
            ) : audit.includeLighthouse ? (
              <p className="flex items-start gap-2 text-muted-foreground text-xs">
                <HugeiconsIcon className="mt-0.5 shrink-0" icon={AlertCircleIcon} size={13} strokeWidth={1.75} />
                {t(lighthouseErrorKey)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <section className="space-y-2.5">
        <h4 className="font-medium text-xs">
          {t("seo.auditDetailIssues")}
          {total > 0 ? <span className="ml-1.5 text-muted-foreground tabular-nums">{total}</span> : null}
        </h4>

        {audit.status === "running" ? (
          <div className="flex items-center gap-4">
            <GaugeMeter
              color="#16B9DF"
              label={`${t("seo.auditColumnPages")}: ${audit.pagesCrawled} / ${audit.maxPages}`}
              max={audit.maxPages}
              showValue
              size="sm"
              value={audit.pagesCrawled}
            />
            <p className="text-muted-foreground text-xs">{t("seo.auditRunningDetail")}</p>
          </div>
        ) : audit.status === "failed" ? (
          <p className="flex items-start gap-2 text-muted-foreground text-xs">
            <HugeiconsIcon className="mt-0.5 shrink-0" icon={AlertCircleIcon} size={13} strokeWidth={1.75} />
            {audit.error}
          </p>
        ) : groups.length === 0 ? (
          <p className="flex items-start gap-2 text-xs">
            <HugeiconsIcon className="mt-0.5 shrink-0" icon={CheckmarkCircle02Icon} size={13} strokeWidth={1.75} />
            {t("seo.auditNoIssues")}
          </p>
        ) : (
          <div className="flex flex-row flex-wrap gap-2.5">
            {groups.map((group) => (
              <IssueGroupCard key={group.type} pages={group.pages} type={group.type} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
