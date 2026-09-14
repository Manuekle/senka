"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  AiScanIcon,
  CheckmarkCircle02Icon,
  Delete01Icon,
  InformationCircleIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { PageContainer } from "../../_components/page-container";
import { KpiCard } from "../../_components/kpi-card";
import { CardCarousel } from "../../_components/card-carousel";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast-provider";
import { useI18n } from "@/lib/i18n/provider";
import { usePolling } from "@/lib/use-polling";
import { fetchJson, uiErrorMessage, type UiError } from "@/lib/api-error-message";
import { ErrorBanner } from "@/components/ui/error-banner";
import type { StackReport } from "@/lib/agent-stack";
import { countOf, SLOT_KEYS, type EveInfoResult } from "@/lib/eve-info";
import type { RuntimeSessionSummary } from "@/lib/runtime-store";
import type { RunPlan, RuntimeLogEntry } from "@/lib/types";
import { StackPanel } from "./_components/stack-panel";
import { LoadedPanel } from "./_components/loaded-panel";
import { LogStream } from "./_components/log-stream";
import { PlanList } from "./_components/plan-list";
import { TeamPanel } from "./_components/team-panel";

// The runtime, seen from outside.
//
// Four questions, in the order somebody actually asks them when something is
// wrong:
//
//   1. **Is the stack wired?** Six packages and their configuration. A red
//      card here explains every symptom below it, so it is above the tabs and
//      always visible.
//   2. **What is it doing?** The log tail, grouped by session.
//   3. **What did it plan?** The agent's own checklists, ticked off live.
//   4. **What is loaded?** The runtime's `/eve/v1/info` snapshot — the honest
//      answer to "does it have that tool", after dynamic resolvers ran.
//
// Polling, not streaming. Eve's own NDJSON stream is per session and only
// exists while a turn runs; this page's whole point is the runs nobody was
// watching. Incremental polls send `?since=` so a quiet minute costs one small
// request, and the poll stands down while the tab is hidden — a dashboard left
// open in a background tab should not bill a request every two seconds
// forever.

const LOG_POLL_MS = 4_000;

type LogsResponse = {
  readonly logs?: RuntimeLogEntry[];
  readonly sessions?: RuntimeSessionSummary[];
};

export default function RuntimePage() {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const [tab, setTab] = useState<"team" | "logs" | "steps" | "loaded">("team");
  const [stack, setStack] = useState<StackReport | null>(null);
  const [info, setInfo] = useState<EveInfoResult | null>(null);
  const [logs, setLogs] = useState<RuntimeLogEntry[]>([]);
  const [sessions, setSessions] = useState<RuntimeSessionSummary[]>([]);
  const [plans, setPlans] = useState<RunPlan[]>([]);
  const [sessionFilter, setSessionFilter] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<UiError | null>(null);
  const [live, setLive] = useState(true);

  const newest = logs[0]?.at;

  /** One tick. `since` is what the newest held line says, so a quiet poll
   *  returns an empty array instead of the whole tail. */
  const loadLogs = useCallback(
    async (incremental: boolean) => {
      const query = incremental && newest ? `?since=${encodeURIComponent(newest)}` : "";
      const result = await fetchJson<LogsResponse>(`/api/runtime/logs${query}`, t);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      const fresh = result.data.logs ?? [];
      if (incremental) {
        // Nothing new is the common case and must not re-render the list.
        if (fresh.length === 0) return;
        setLogs((current) => {
          // Deduplicate by id rather than trusting `since` alone. The first
          // poll tick fires on mount, before the full load has landed a
          // `newest` timestamp to send — so it asks for everything and would
          // otherwise prepend a second copy of the whole tail.
          const seen = new Set(current.map((entry) => entry.id));
          const added = fresh.filter((entry) => !seen.has(entry.id));
          if (added.length === 0) return current;
          return [...added, ...current].slice(0, 400);
        });
      } else {
        setLogs(fresh);
      }
      if (result.data.sessions) setSessions(result.data.sessions);
    },
    [newest, t],
  );

  const loadPlans = useCallback(async () => {
    const result = await fetchJson<{ plans?: RunPlan[] }>("/api/runtime/plans", t);
    if (result.ok) setPlans(result.data.plans ?? []);
  }, [t]);

  const loadStack = useCallback(async () => {
    const result = await fetchJson<StackReport>("/api/runtime/stack", t);
    if (result.ok) setStack(result.data);
  }, [t]);

  const loadInfo = useCallback(async () => {
    const result = await fetchJson<EveInfoResult>("/api/runtime/info", t);
    if (result.ok) setInfo(result.data);
  }, [t]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadStack(), loadInfo(), loadLogs(false), loadPlans()]);
  }, [loadStack, loadInfo, loadLogs, loadPlans]);

  useEffect(() => {
    void refreshAll().finally(() => setIsLoading(false));
    // Deliberately once, on mount. `refreshAll` changes identity whenever the
    // newest log line does, and re-running the full load on every tick would
    // undo the incremental poll below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A hidden tab is a tab nobody is reading. `visibilitychange` is what keeps
  // an abandoned dashboard from polling all afternoon.
  useEffect(() => {
    const onVisibility = () => setLive(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const tick = useCallback(async () => {
    await Promise.all([loadLogs(true), loadPlans()]);
  }, [loadLogs, loadPlans]);

  usePolling(tick, LOG_POLL_MS, live);

  const clearLogs = useCallback(async () => {
    const ok = await confirm({
      title: t("runtime.clearConfirm"),
      description: t("runtime.clearConfirmBody"),
      confirmLabel: t("runtime.clear"),
    });
    if (!ok) return;
    const result = await fetchJson("/api/runtime/logs", t, { method: "DELETE" });
    if (result.ok) {
      setLogs([]);
      setSessions([]);
      setSessionFilter(null);
      toast({ title: t("runtime.cleared") });
    } else {
      toast({ title: uiErrorMessage(t, result.error), status: "error" });
    }
  }, [confirm, t, toast]);

  const tabs = useMemo(
    () => [
      { id: "team", label: t("agentTeam.title") },
      { id: "logs", label: `${t("runtime.tabLogs")}${logs.length ? ` (${logs.length})` : ""}` },
      { id: "steps", label: `${t("runtime.tabSteps")}${plans.length ? ` (${plans.length})` : ""}` },
      { id: "loaded", label: t("runtime.tabLoaded") },
    ],
    [logs.length, plans.length, t],
  );

  const loadedCount = info?.ok
    ? countOf(info.info.tools, SLOT_KEYS.tools) +
      countOf(info.info.skills, SLOT_KEYS.skills) +
      countOf(info.info.subagents, SLOT_KEYS.subagents) +
      countOf(info.info.connections, SLOT_KEYS.connections) +
      countOf(info.info.channels, SLOT_KEYS.channels) +
      countOf(info.info.schedules, SLOT_KEYS.schedules) +
      countOf(info.info.hooks, SLOT_KEYS.hooks)
    : null;

  return (
    <PageContainer maxWidth="max-w-6xl" pattern="grid">
      <div className="content-enter">
        <header className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">{t("runtime.title")}</h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              {t("runtime.subtitle")}
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => void refreshAll()}
              aria-label={t("runtime.refresh")}
            >
              <HugeiconsIcon icon={RefreshIcon} size={15} strokeWidth={1.75} />
              {t("runtime.refresh")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-destructive hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive sm:flex-none"
              onClick={() => void clearLogs()}
            >
              <HugeiconsIcon icon={Delete01Icon} size={15} strokeWidth={1.75} />
              {t("runtime.clear")}
            </Button>
          </div>
        </header>

        {error ? (
          <ErrorBanner className="mb-6" error={error} onRetry={() => void refreshAll()} />
        ) : null}

        {!isLoading ? (
          <CardCarousel label="Estadísticas de runtime">
            <div className="mb-8 flex items-stretch gap-4" style={{ paddingInline: "2px" }}>
              <div className="min-w-[220px] flex-1">
                <KpiCard
                  icon={InformationCircleIcon}
                  label={t("runtime.tabLogs")}
                  value={logs.length}
                  sub={t(logs.length > 0 ? "runtime.kpiLogsSub" : "runtime.kpiLogsSubNone")}
                />
              </div>
              <div className="min-w-[220px] flex-1">
                <KpiCard
                  icon={CheckmarkCircle02Icon}
                  label={t("runtime.kpiPlans")}
                  value={plans.length}
                  sub={t(plans.length > 0 ? "runtime.kpiPlansSub" : "runtime.kpiPlansSubNone")}
                />
              </div>
              <div className="min-w-[220px] flex-1">
                <KpiCard
                  icon={AiScanIcon}
                  label={t("runtime.tabLoaded")}
                  value={loadedCount ?? "—"}
                  sub={t(
                    loadedCount === null
                      ? "runtime.kpiLoadedUnavailable"
                      : loadedCount > 0
                        ? "runtime.kpiLoadedSub"
                        : "runtime.kpiLoadedSubNone",
                  )}
                />
              </div>
            </div>
          </CardCarousel>
        ) : null}

        <div className="mb-8">
          <StackPanel report={stack} isLoading={isLoading} />
        </div>

        <div className="space-y-4">
          <SlidingTabs
            tabs={tabs}
            value={tab}
            onValueChange={(id) => setTab(id as typeof tab)}
          />

          {tab === "logs" ? (
            <LogStream
              logs={logs}
              sessions={sessions}
              isLoading={isLoading}
              locale={locale}
              sessionFilter={sessionFilter}
              onSessionFilter={setSessionFilter}
            />
          ) : null}

          {tab === "steps" ? (
            <PlanList
              plans={sessionFilter ? plans.filter((p) => p.sessionId === sessionFilter) : plans}
              isLoading={isLoading}
              locale={locale}
            />
          ) : null}

          {tab === "loaded" ? <LoadedPanel result={info} isLoading={isLoading} /> : null}
          {tab === "team" ? <TeamPanel /> : null}
        </div>
      </div>
      {confirmDialog}
    </PageContainer>
  );
}
