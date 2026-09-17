"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon, type IconSvgElement } from "@/components/icons/icon";
import {
  CheckmarkBadge02Icon,
  AlertCircleIcon,
  CancelCircleIcon,
  HelpCircleIcon,
  MinusSignIcon,
  Loading03Icon,
  RefreshIcon,
  Copy01Icon,
  Download01Icon,
  Upload01Icon,
  CheckIcon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { FileUpload, type FileUploadItem } from "@/components/motion/file-upload";
import { DockerBrandIcon, NodejsBrandIcon, SupabaseBrandIcon } from "@/components/icons/connection-icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton, SkeletonBar } from "@/components/ai-elements/skeleton";
import { useI18n } from "@/lib/i18n/provider";
import { useSound } from "@/components/sound-provider";
import { cn } from "@/lib/utils";
import { fetchJson, networkErrorMessage, readApiError, type UiError } from "@/lib/api-error-message";
import { ErrorBanner } from "@/components/ui/error-banner";
import type { CheckStatus, SetupCheck } from "../../api/setup/route";
import { PageContainer } from "../../_components/page-container";
import { KpiBars, KpiCard } from "../../_components/kpi-card";
import { CardCarousel } from "../../_components/card-carousel";
import { EnterpriseGate } from "@/components/enterprise-gate";
import {
  Card,
  CardDescription,
  CardHeader,
  CardSeparator,
  CardTitle,
} from "../../_components/dashboard-card";
import { Spinner } from "@/components/ui/spinner";

type Summary = { ready: boolean; failing: number; warning: number; total: number };

const STATUS_ICON: Record<CheckStatus, IconSvgElement> = {
  ok: CheckmarkBadge02Icon,
  warn: AlertCircleIcon,
  fail: CancelCircleIcon,
  unknown: HelpCircleIcon,
  skipped: MinusSignIcon,
};

const STATUS_TONE: Record<CheckStatus, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  fail: "text-destructive",
  unknown: "text-muted-foreground",
  skipped: "text-muted-foreground",
};

/** Detail strings the API returns as dictionary keys rather than prose, so the
 *  explanation follows the language toggle like the rest of the app. */
const DETAIL_KEYS = new Set([
  "docker.notInstalled",
  "docker.required",
  "postgres.noContainer",
  "postgres.noUrl",
  "postgres.required",
  "postgres.badIdentifier",
  "postgres.queryFailed",
  "postgres.hosted",
  "postgres.hostedSupabase",
  "postgres.hostedContainer",
  "embeddings.missing",
  "env.missing",
]);

export default function SetupPage() {
  const { t } = useI18n();
  const { cue } = useSound();

  const [checks, setChecks] = useState<SetupCheck[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<UiError | null>(null);

  const [copied, setCopied] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [importQueue, setImportQueue] = useState<FileUploadItem[]>([]);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    const result = await fetchJson<{ checks: SetupCheck[]; summary: Summary }>("/api/setup", t);
    if (result.ok) {
      setChecks(result.data.checks);
      setSummary(result.data.summary);
      setError(null);
    } else {
      setError(result.error);
    }
    setIsLoading(false);
    setRefreshing(false);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        // A copy that landed is an outcome, so it gets the confirmation cue.
        // `tick` is the nav/menu hover sound and made a copy feel like a
        // pointer passing over something.
        cue("success");
        setCopied(text);
        setTimeout(() => setCopied((prev) => (prev === text ? null : prev)), 1600);
      } catch {
        setError({ messageKey: "setup.copyFailed" });
      }
    },
    [cue, t],
  );

  const applyImport = useCallback(
    async (send: () => Promise<Response>) => {
      setImporting(true);
      setImportResult(null);
      try {
        const res = await send();
        if (!res.ok) {
          // The route names the reason in a code; the sentence comes from the
          // dictionary so the import panel speaks the same language as the page.
          setImportResult((await readApiError(res, t)).message);
          return false;
        }
        const data = (await res.json()) as {
          applied?: string[];
          ignored?: string[];
        };
        cue("success");
        setImportResult(
          t("setup.importApplied", {
            count: data.applied?.length ?? 0,
            ignored: data.ignored?.length ?? 0,
          }),
        );
        void load();
        return true;
      } catch (err) {
        setImportResult(networkErrorMessage(t, err));
        return false;
      } finally {
        setImporting(false);
      }
    },
    [cue, load, t],
  );

  const importFiles = useCallback(
    (added: FileUploadItem[]) => {
      for (const item of added) {
        const file = item.file;
        if (!file) continue;
        setImportQueue((prev) =>
          prev.map((entry) =>
            entry.id === item.id ? { ...entry, status: "uploading", progress: 40 } : entry,
          ),
        );
        void applyImport(() => {
          const form = new FormData();
          form.append("file", file);
          return fetch("/api/settings/import", { method: "POST", body: form });
        }).then((ok) => {
          setImportQueue((prev) =>
            prev.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    status: ok ? "success" : "error",
                    progress: ok ? 100 : 0,
                    error: ok ? undefined : t("setup.importFailed"),
                  }
                : entry,
            ),
          );
        });
      }
    },
    [applyImport, t],
  );

  const importPasted = useCallback(() => {
    const content = pasted.trim();
    if (!content) return;
    void applyImport(() =>
      fetch("/api/settings/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    ).then((ok) => {
      if (ok) setPasted("");
    });
  }, [applyImport, pasted]);

  const counts = useMemo(
    () => ({
      ok: checks.filter((c) => c.status === "ok").length,
      warn: checks.filter((c) => c.status === "warn").length,
      fail: checks.filter((c) => c.status === "fail").length,
    }),
    [checks],
  );

  /** One outcome's share of every check, for the meter on its tile. */
  const share = (count: number) => (checks.length > 0 ? count / checks.length : 0);

  return (
    <EnterpriseGate>
      <PageContainer maxWidth="max-w-6xl" pattern="grid">
      <Skeleton className="min-h-[500px]" isLoading={isLoading} skeleton={<SetupSkeleton />}>
        <div className="content-enter">
          <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">{t("setup.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("setup.subtitle")}</p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--shadow-inset)] transition duration-150 hover:border-input hover:bg-accent disabled:opacity-60"
            >
              <HugeiconsIcon
                icon={refreshing ? Loading03Icon : RefreshIcon}
                size={16}
                strokeWidth={1.75}
                className={cn(refreshing && "animate-spin")}
              />
              {t("setup.recheck")}
            </button>
          </header>

          <ErrorBanner
            className="mb-4"
            error={error}
            onRetry={() => void load()}
            onDismiss={() => setError(null)}
          />

          <CardCarousel label="Estadísticas de instalación">
            <div className="mb-6 flex items-stretch gap-4" style={{ paddingInline: "2px" }}>
              <div className="min-w-[220px] flex-1">
                <KpiCard
                  icon={CheckmarkCircle02Icon}
                  label={t("setup.countOk")}
                  value={counts.ok}
                  sub={t(counts.ok > 0 ? "setup.countOkSub" : "setup.countOkSubNone")}
                  visual={<KpiBars ratio={share(counts.ok)} tone="positive" />}
                />
              </div>
              <div className="min-w-[220px] flex-1">
                <KpiCard
                  icon={AlertCircleIcon}
                  label={t("setup.countWarn")}
                  value={counts.warn}
                  sub={t(counts.warn > 0 ? "setup.countWarnSub" : "setup.countWarnSubNone")}
                  visual={<KpiBars ratio={share(counts.warn)} tone="warning" />}
                />
              </div>
              <div className="min-w-[220px] flex-1">
                <KpiCard
                  icon={CancelCircleIcon}
                  label={t("setup.countFail")}
                  value={counts.fail}
                  sub={t(counts.fail > 0 ? "setup.countFailSub" : "setup.countFailSubNone")}
                  visual={<KpiBars ratio={share(counts.fail)} tone="critical" />}
                />
              </div>
            </div>
          </CardCarousel>

          <Card
            className={cn(
              "mb-6",
              summary?.ready ? "border-emerald-500/40" : "border-amber-500/40",
            )}
          >
            <div className="flex items-start gap-3 px-5 py-4">
              <HugeiconsIcon
                icon={summary?.ready ? CheckmarkCircle02Icon : AlertCircleIcon}
                size={18}
                strokeWidth={1.75}
                className={cn(
                  "mt-0.5 shrink-0",
                  summary?.ready
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400",
                )}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {summary?.ready ? t("setup.readyTitle") : t("setup.notReadyTitle")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {summary?.ready ? t("setup.readyHint") : t("setup.notReadyHint")}
                </p>
              </div>
            </div>
          </Card>

          <div className="gap-4 lg:columns-2">
            <Card className="mb-4 break-inside-avoid">
              <CardHeader>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} size={17} strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <CardTitle>{t("setup.checksTitle")}</CardTitle>
                  <CardDescription>{t("setup.checksDescription")}</CardDescription>
                </div>
              </CardHeader>
              <CardSeparator />
              <ul className="divide-y divide-border">
                {checks.map((check) => (
                  <li key={check.id} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <HugeiconsIcon
                        icon={STATUS_ICON[check.status]}
                        size={17}
                        strokeWidth={1.75}
                        className={cn("mt-0.5 shrink-0", STATUS_TONE[check.status])}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-medium">
                          {check.id === "docker" ? <DockerBrandIcon size={14} /> : null}
                          {check.id === "docker" && check.detail === "postgres.hostedSupabase" ? <SupabaseBrandIcon size={14} /> : null}
                          {check.id === "node" ? <NodejsBrandIcon size={14} /> : null}
                          {t(`setup.check.${check.id}`)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t(`setup.check.${check.id}.hint`)}
                        </p>
                        <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                          {DETAIL_KEYS.has(check.detail)
                            ? t(`setup.detail.${check.detail}`)
                            : check.detail}
                        </p>
                        {check.fix ? (
                          <button
                            type="button"
                            onClick={() => void copy(check.fix!)}
                            className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-left transition-colors hover:border-input hover:bg-accent"
                          >
                            <code className="truncate font-mono text-xs">{check.fix}</code>
                            <HugeiconsIcon
                              icon={copied === check.fix ? CheckIcon : Copy01Icon}
                              size={14}
                              strokeWidth={1.75}
                              className="shrink-0 text-muted-foreground"
                            />
                          </button>
                        ) : null}
                        {check.link ? (
                          check.link.startsWith("/") ? (
                            <Link
                              href={check.link}
                              className="mt-2 inline-block text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                            >
                              {t("setup.openSettings")}
                            </Link>
                          ) : (
                            <a
                              href={check.link}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="mt-2 inline-block text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                            >
                              {t("setup.openDownload")}
                            </a>
                          )
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="mb-4 break-inside-avoid">
              <CardHeader>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                  <HugeiconsIcon icon={Upload01Icon} size={17} strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <CardTitle>{t("setup.importTitle")}</CardTitle>
                  <CardDescription>{t("setup.importDescription")}</CardDescription>
                </div>
              </CardHeader>
              <CardSeparator />
              <div className="space-y-4 px-5 py-4">
                <FileUpload
                  value={importQueue}
                  onValueChange={setImportQueue}
                  onFilesAdded={importFiles}
                  accept=".env,.txt,.json"
                  multiple={false}
                  title={t("setup.importDropTitle")}
                  description={t("setup.importDropDescription")}
                  browseLabel={t("setup.importBrowse")}
                />

                <div>
                  <label
                    htmlFor="setup-paste"
                    className="mb-2 block text-sm font-medium"
                  >
                    {t("setup.pasteLabel")}
                  </label>
                  <Textarea
                    id="setup-paste"
                    value={pasted}
                    onChange={(event) => setPasted(event.target.value)}
                    placeholder={'AI_GATEWAY_API_KEY="vck_…"\nWORKFLOW_POSTGRES_URL="postgres://…"'}
                    rows={4}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    className="mt-2"
                    size="sm"
                    disabled={importing || pasted.trim().length === 0}
                    onClick={importPasted}
                  >
                    {importing ? (
                      <Spinner size={15} strokeWidth={2} />
                    ) : null}
                    {t("setup.importAction")}
                  </Button>
                </div>

                {importResult ? (
                  <p className="text-xs text-muted-foreground" role="status">
                    {importResult}
                  </p>
                ) : null}
              </div>
            </Card>

            <Card className="mb-4 break-inside-avoid">
              <CardHeader>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                  <HugeiconsIcon icon={Download01Icon} size={17} strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <CardTitle>{t("setup.exportTitle")}</CardTitle>
                  <CardDescription>{t("setup.exportDescription")}</CardDescription>
                </div>
              </CardHeader>
              <CardSeparator />
              <div className="space-y-3 px-5 py-4">
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {t("setup.exportWarning")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <a href="/api/settings/export?format=env" download>
                      {t("setup.exportEnv")}
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a href="/api/settings/export?format=json" download>
                      {t("setup.exportJson")}
                    </a>
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </Skeleton>
      </PageContainer>
    </EnterpriseGate>
  );
}

function SetupSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <SkeletonBar className="h-7 w-56" />
        <SkeletonBar className="h-4 w-full max-w-md" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
            <SkeletonBar className="h-7 w-10" />
            <SkeletonBar className="mt-2 h-3 w-20" />
            <SkeletonBar className="mt-4 h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>

      {/* Status banner */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <SkeletonBar className="size-5 shrink-0 rounded-full" />
          <div className="space-y-2">
            <SkeletonBar className="h-4 w-40" />
            <SkeletonBar className="h-3 w-64" />
          </div>
        </div>
      </div>

      {/* Masonry: checks / import / export */}
      <div className="gap-4 lg:columns-2">
        <div className="mb-4 break-inside-avoid rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-3 p-5">
            <SkeletonBar className="size-9 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBar className="h-4 w-32" />
              <SkeletonBar className="h-3 w-48" />
            </div>
          </div>
          <div className="h-px bg-border" />
          <div className="divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2 px-5 py-4">
                <SkeletonBar className="h-4 w-40" />
                <SkeletonBar className="h-3 w-56" />
              </div>
            ))}
          </div>
        </div>

        <div className="mb-4 break-inside-avoid rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-3 p-5">
            <SkeletonBar className="size-9 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBar className="h-4 w-28" />
              <SkeletonBar className="h-3 w-44" />
            </div>
          </div>
          <div className="h-px bg-border" />
          <div className="space-y-4 p-5">
            <SkeletonBar className="h-24 w-full rounded-xl" />
            <SkeletonBar className="h-20 w-full rounded-xl" />
            <SkeletonBar className="h-9 w-28 rounded-lg" />
          </div>
        </div>

        <div className="mb-4 break-inside-avoid rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-3 p-5">
            <SkeletonBar className="size-9 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBar className="h-4 w-28" />
              <SkeletonBar className="h-3 w-44" />
            </div>
          </div>
          <div className="h-px bg-border" />
          <div className="space-y-3 p-5">
            <SkeletonBar className="h-3 w-48" />
            <div className="flex gap-2">
              <SkeletonBar className="h-9 w-24 rounded-lg" />
              <SkeletonBar className="h-9 w-24 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
