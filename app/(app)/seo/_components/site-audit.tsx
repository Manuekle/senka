"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Delete01Icon,
  ChevronDownIcon,
  CircleGaugeIcon,
  Globe02Icon,
} from "@hugeicons/core-free-icons";
import { SkeletonBar } from "@/components/ai-elements/skeleton";
import { ActionSwapText } from "@/components/motion/action-swap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ScoreRing } from "@/components/ui/score-ring";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast-provider";
import { useI18n, useT } from "@/lib/i18n/provider";
import { fetchJson, uiErrorMessage, type UiError } from "@/lib/api-error-message";
import { AuditDetail, type AuditDetailRow } from "./audit-detail";
import { DeltaChip } from "./seo-table";
import { auditHealthScore } from "@/lib/seo-audit-findings";

// The audit tab: point it at a URL, and it walks the site.
//
// This panel is deliberately independent of everything else on the page.
// Search Console needs a Google account with a verified property; an audit
// needs one public URL, typed here. A shop that has not connected Google
// yet can still find out that half its titles are empty — which is often
// the thing that made them open the SEO panel in the first place.
//
// The crawl runs server-side in the background of the POST; this side is a
// form and a polling table. "Running" is the interesting row while it is on
// screen, so its page count is the one number on the page allowed to pop.

// ── Types ──────────────────────────────────────────────────────────

type AuditRow = AuditDetailRow & { readonly id: string };

type AuditsResponse = { readonly audits: readonly AuditRow[] };

// The free crawl window, mirrored from the API. The input clamps to it
// locally so the number a person sees is the number the server accepts.
const PAGES_MIN = 10;
const PAGES_MAX = 50;

/** How often the table re-reads the history while a crawl is on it. */
const POLL_MS = 4000;

// ── The live page counter ──────────────────────────────────────────

/** `value` as digit spans, the last two carrying the stagger that makes a
 *  rolling count read as rolling (see `.t-digit` in globals.css). */
function renderDigits(group: HTMLSpanElement, value: number): void {
  const chars = String(value).split("");
  group.replaceChildren();
  chars.forEach((ch, index) => {
    const span = document.createElement("span");
    span.className = "t-digit";
    span.textContent = ch;
    if (index === chars.length - 2) span.dataset.stagger = "1";
    else if (index === chars.length - 1) span.dataset.stagger = "2";
    group.appendChild(span);
  });
}

/**
 * One audit's expandable detail row.
 *
 * The open/close animation is the transitions.dev accordion: the track
 * swaps `grid-template-rows` between `0fr` and `1fr` while the inner div
 * holds the content with `overflow-hidden`. No wrapper element needed,
 * which is what makes it fit inside a table cell — a Radix disclosure
 * would need a `div` around the rows and break the table.
 *
 * Content mounts on the first open and stays mounted: collapsing an empty
 * box would read as an instant close, and remounting on every open would
 * replay nothing but cost the grouping work again.
 */
function ExpandableDetail({
  audit,
  expanded,
  previousHealth,
}: {
  readonly audit: AuditRow;
  readonly expanded: boolean;
  readonly previousHealth: number | null;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (expanded) setMounted(true);
  }, [expanded]);

  return (
    <tr>
      <td colSpan={7}>
        <div
          className="grid transition-[grid-template-rows] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            {mounted ? <AuditDetail audit={audit} previousHealth={previousHealth} /> : null}
          </div>
        </div>
      </td>
    </tr>
  );
}

/**
 * A number that re-enters per digit when it changes.
 *
 * Only used for the running audit's page count, where the number moving is
 * the signal that the crawl is alive. The first paint renders still: a
 * number that pops before anyone has looked at the table is noise.
 */
function PopNumber({ value }: { readonly value: number }) {
  const groupRef = useRef<HTMLSpanElement>(null);
  const firstPaint = useRef(true);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    if (firstPaint.current) {
      firstPaint.current = false;
      renderDigits(group, value);
      return;
    }
    // Replay: strip the class, swap the spans, reflow, put it back — the
    // order is what makes the animation run again instead of sticking.
    group.classList.remove("is-animating");
    renderDigits(group, value);
    void group.offsetHeight;
    group.classList.add("is-animating");
  }, [value]);

  return (
    <span className="tabular-nums">
      <span className="sr-only">{value}</span>
      <span aria-hidden="true" className="t-digit-group" ref={groupRef} />
    </span>
  );
}

// ── The panel ──────────────────────────────────────────────────────

export function SiteAuditPanel() {
  const t = useT();
  const { locale } = useI18n();
  const reduce = useReducedMotion();
  const { toast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(String(PAGES_MAX));
  const [lighthouse, setLighthouse] = useState(true);
  const [audits, setAudits] = useState<readonly AuditRow[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const running = audits?.some((audit) => audit.status === "running") ?? false;
  /** Whether a poll is in flight, so a slow one cannot pile onto the next. */
  const polling = useRef(false);

  const load = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    const result = await fetchJson<AuditsResponse>("/api/seo/audit", t);
    polling.current = false;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setAudits(result.data.audits);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-read while a crawl is running — the audit's pages count and status
  // arrive through the history endpoint, and this is the only channel.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [running, load]);

  const start = async () => {
    const entered = url.trim();
    if (!entered || submitting) return;
    setSubmitting(true);
    const result = await fetchJson<{ audit: AuditRow }>("/api/seo/audit", t, {
      body: JSON.stringify({
        url: entered,
        maxPages: Number.parseInt(maxPages, 10) || PAGES_MAX,
        includeLighthouse: lighthouse,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    setSubmitting(false);
    if (!result.ok) {
      toast({
        description: uiErrorMessage(t, result.error),
        status: "error",
        title: t("common.somethingWentWrong"),
      });
      return;
    }
    toast({
      description: t("seo.auditStartedToast"),
      status: "success",
      title: t("seo.auditStarted"),
    });
    setAudits((current) => [result.data.audit, ...(current ?? [])]);
    // Open the new row: the running count and, when it lands, the findings
    // are the payoff for the wait.
    setExpandedId(result.data.audit.id);
  };

  const remove = async (audit: AuditRow) => {
    if (!(await confirm({ title: t("seo.auditConfirmDelete"), description: audit.url }))) return;
    const result = await fetchJson<{ ok: boolean }>(
      `/api/seo/audit?id=${encodeURIComponent(audit.id)}`,
      t,
      { method: "DELETE" },
    );
    if (!result.ok) {
      toast({
        description: t("common.somethingWentWrongDescription"),
        status: "error",
        title: t("common.somethingWentWrong"),
      });
      return;
    }
    setAudits((current) => (current ?? []).filter((row) => row.id !== audit.id));
  };

  /* The two cards enter a step apart — an infrequent entrance, and the form
     is the thing to read first. Same spring as the rest of the app's
     entrances, and skipped entirely under reduced motion. */
  const enter = (delay: number) => ({
    animate: { opacity: 1, y: 0 },
    initial: reduce ? false : { opacity: 0, y: 8 },
    transition: { bounce: 0, delay, duration: 0.3, type: "spring" as const },
  });

  const listLoading = audits === null;

  return (
    <div className="space-y-4">
      <motion.div {...enter(0)}>
        <div className="rounded-[20px] border border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
          <div className="flex flex-col">
            <div className="overflow-hidden rounded-[14px] border border-border/50 bg-card shadow-xs">
              <div className="flex items-start gap-3 px-5 pt-5 pb-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t("seo.auditTitle")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("seo.auditSubtitle")}</p>
                </div>
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                  <HugeiconsIcon icon={CircleGaugeIcon} size={16} strokeWidth={1.75} />
                </span>
              </div>
              <div className="mx-5 h-px bg-border/50" />
              <div className="space-y-4 px-5 py-4">
                <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
              {/* The URL. One field, full width on a phone. */}
              <div className="space-y-1.5">
                <label className="font-medium text-xs" htmlFor="audit-url">
                  {t("seo.auditUrl")}
                </label>
                <div className="relative">
                  <HugeiconsIcon
                    className="-translate-y-1/2 absolute top-1/2 left-3 text-muted-foreground"
                    icon={Globe02Icon}
                    size={16}
                    strokeWidth={1.75}
                  />
                  <Input
                    autoComplete="url"
                    className="pl-9"
                    id="audit-url"
                    inputMode="url"
                    onChange={(event) => setUrl(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void start();
                    }}
                    placeholder={t("seo.auditUrlPlaceholder")}
                    type="url"
                    value={url}
                  />
                </div>
              </div>

              {/* The crawl cap. Clamped locally to the window the server
                  accepts, so the value on screen is the value used. */}
              <div className="space-y-1.5">
                <label className="font-medium text-xs" htmlFor="audit-max-pages">
                  {t("seo.auditMaxPages")}
                </label>
                <Input
                  id="audit-max-pages"
                  max={PAGES_MAX}
                  min={PAGES_MIN}
                  onChange={(event) => setMaxPages(event.target.value)}
                  type="number"
                  value={maxPages}
                />
              </div>
            </div>

            <p className="text-muted-foreground text-xs">
              {t("seo.auditMaxPagesHelp", { max: PAGES_MAX, min: PAGES_MIN })}{" "}
              <a
                className="font-medium text-foreground underline-offset-4 hover:underline"
                href="/account/billing"
              >
                {t("seo.auditUpgrade")}
              </a>
            </p>
              </div>
            </div>

            {/* Footer action strip — switch left, run right. */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-2.5 pt-2 pb-0.5">
              <div className="flex items-center gap-2.5">
                <Switch
                  checked={lighthouse}
                  label={t("seo.auditIncludeLighthouse")}
                  onCheckedChange={setLighthouse}
                />
                <span className="text-sm">{t("seo.auditIncludeLighthouse")}</span>
              </div>
              {/* Disabled while a crawl runs: the server would refuse the
                  second one anyway, and the table's running row is the
                  thing to watch until it lands. */}
              <Button
                className="w-full sm:w-auto"
                disabled={!url.trim() || submitting || running}
                onClick={() => void start()}
                type="button"
              >
                <HugeiconsIcon
                  className={running && !reduce ? "animate-spin" : undefined}
                  icon={CircleGaugeIcon}
                  size={15}
                  strokeWidth={1.75}
                />
                <ActionSwapText value={running ? "running" : "idle"}>
                  {running ? t("seo.auditRunning") : t("seo.auditStart")}
                </ActionSwapText>
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div {...enter(0.1)}>
        <div className="rounded-[20px] border border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
          <div className="overflow-hidden rounded-[14px] border border-border/50 bg-card shadow-xs">
            <div className="px-5 pt-5 pb-4">
              <p className="text-sm font-medium">{t("seo.auditPreviousTitle")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("seo.auditPreviousSubtitle")}</p>
            </div>
            <div className="mx-5 h-px bg-border/50" />
            <div className="px-5 py-4">
            <ErrorBanner className="mb-2" error={error} onRetry={() => void load()} />

            {/* The load placeholder keeps the table's own shape — one bar per
                column — so the first rows land in a space already sized for
                them. Pulse from the wrapper, never from each bar. */}
            {listLoading ? (
              <div className="t-skel-pulse-self space-y-4 py-1">
                {[0, 1, 2, 3].map((row) => (
                  <div className="flex items-center gap-4" key={row}>
                    <SkeletonBar className="h-4 w-24 max-w-[24%]" />
                    <SkeletonBar className="h-4 flex-1" />
                    <SkeletonBar className="h-4 w-16" />
                    <SkeletonBar className="h-4 w-10" />
                    <SkeletonBar className="h-4 w-8" />
                  </div>
                ))}
              </div>
            ) : (audits ?? []).length === 0 ? (
              <p className="py-6 text-center text-muted-foreground text-sm">
                {t("seo.auditEmpty")}
              </p>
            ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-muted-foreground text-xs">
                        <th className="w-8">
                          <span className="sr-only">{t("seo.auditExpandLabel")}</span>
                        </th>
                        <th className="py-2 pr-4 font-medium">{t("seo.auditColumnDate")}</th>
                        <th className="py-2 pr-4 font-medium">{t("seo.auditColumnUrl")}</th>
                        <th className="py-2 pr-4 font-medium">{t("seo.auditColumnStatus")}</th>
                        <th className="py-2 pr-4 font-medium text-right">
                          {t("seo.auditColumnPages")}
                        </th>
                        <th className="py-2 pr-4 font-medium">{t("seo.auditColumnLighthouse")}</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    {/* One body per audit: a `div` cannot wrap rows, so each
                        pair of rows — summary plus its expandable detail —
                        is its own group, separated by the bottom border. */}
                    {(audits ?? []).map((audit, index) => {
                      const expanded = expandedId === audit.id;
                      const previous = (audits ?? [])
                        .slice(index + 1)
                        .find((other) => other.url === audit.url && other.status === "done");
                      const previousHealth = previous
                        ? auditHealthScore({
                          issues: previous.issues ?? [],
                          maxPages: previous.maxPages,
                          lighthouse: previous.lighthouseScores ?? null,
                        })
                        : null;
                      const health =
                        audit.status === "done"
                          ? auditHealthScore({
                            issues: audit.issues ?? [],
                            maxPages: audit.maxPages,
                            lighthouse: audit.lighthouseScores ?? null,
                          })
                          : null;
                      const healthDelta =
                        health !== null && previousHealth !== null ? health - previousHealth : null;
                      return (
                        <tbody className="border-b border-border/50 last:border-b-0" key={audit.id}>
                          <tr className="list-fade-in">
                            <td className="py-3 pr-1">
                              <button
                                aria-expanded={expanded}
                                aria-label={t("seo.auditExpandLabel")}
                                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                onClick={() => setExpandedId(expanded ? null : audit.id)}
                                type="button"
                              >
                                <HugeiconsIcon
                                  className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                                  icon={ChevronDownIcon}
                                  size={14}
                                  strokeWidth={1.75}
                                />
                              </button>
                            </td>
                            <td className="py-3 pr-4 whitespace-nowrap tabular-nums">
                              {new Date(audit.createdAt).toLocaleDateString(
                                locale === "es" ? "es-ES" : "en-US",
                                { day: "numeric", month: "short", year: "numeric" },
                              )}
                            </td>
                            <td className="max-w-[220px] py-3 pr-4">
                              <span className="block truncate" title={audit.url}>
                                {audit.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                              </span>
                            </td>
                            <td className="py-3 pr-4">
                              {audit.status === "running" ? (
                                <StatusBadge status="in-progress" />
                              ) : audit.status === "done" ? (
                                <StatusBadge label={t("seo.auditStatusDone")} status="success" />
                              ) : (
                                <StatusBadge status="failed" title={audit.error} />
                              )}
                            </td>
                            <td className="py-3 pr-4 text-right">
                              {audit.status === "running" ? (
                                <PopNumber value={audit.pagesCrawled} />
                              ) : (
                                <span className="tabular-nums">{audit.pagesCrawled}</span>
                              )}
                            </td>
                            <td className="py-2 pr-4 align-middle">
                              {audit.lighthouseScores ? (
                                <span
                                  className="inline-flex flex-col items-start gap-0.5"
                                  title={t("seo.auditLighthouseScores", {
                                    accessibility: audit.lighthouseScores.accessibility,
                                    bestPractices: audit.lighthouseScores.bestPractices,
                                    performance: audit.lighthouseScores.performance,
                                    seo: audit.lighthouseScores.seo,
                                  })}
                                >
                                  <ScoreRing
                                    aria-label={`${t("seo.auditLighthouseSeo")}: ${audit.lighthouseScores.seo}`}
                                    dimension={36}
                                    max={100}
                                    size="xs"
                                    value={audit.lighthouseScores.seo}
                                  />
                                  {healthDelta !== null && healthDelta !== 0 ? (
                                    <DeltaChip
                                      compact
                                      tone={healthDelta > 0 ? "positive" : "critical"}
                                      value={`${healthDelta > 0 ? "+" : "−"}${Math.abs(healthDelta)}`}
                                    />
                                  ) : null}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-3 text-right">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    aria-label={t("common.delete")}
                                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => void remove(audit)}
                                    type="button"
                                  >
                                    <HugeiconsIcon icon={Delete01Icon} size={14} strokeWidth={1.75} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>{t("common.delete")}</TooltipContent>
                              </Tooltip>
                            </td>
                          </tr>
                          <ExpandableDetail audit={audit} expanded={expanded} previousHealth={previousHealth} />
                        </tbody>
                      );
                    })}
                  </table>
                </div>
            )}
            </div>
          </div>
        </div>
      </motion.div>

      {confirmDialog}
    </div>
  );
}
