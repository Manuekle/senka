"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  FileDownloadIcon,
  Link04Icon,
  Note01Icon,
} from "@hugeicons/core-free-icons";
import { AnimatedNumber } from "@/app/_components/chart";
import { PageContainer } from "@/app/_components/page-container";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { contactStatusLabel } from "@/lib/contact-labels";
import {
  CONTACT_FIELDS,
  CSV_MAX_BYTES,
  CSV_MAX_ROWS,
  UNIQUE_FIELDS,
  autoMap,
  buildImport,
  parseCsv,
  sampleCsv,
  type ContactField,
  type CsvTable,
} from "@/lib/csv-import";
import { EASE_OUT } from "@/lib/ease";
import { useI18n } from "@/lib/i18n/provider";
import type { ContactStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

// Contacts from a spreadsheet, in three steps: pick the file, check how its
// columns map onto a contact, see what the import did.
//
// The file never leaves the browser as a file. It is parsed here so the mapping
// and its consequences — how many rows are usable, which repeat — are visible
// while they can still be changed; only the mapped contacts are posted.

type Upload = { readonly name: string; readonly size: number; readonly table: CsvTable };
type Outcome = { readonly created: number; readonly updated: number; readonly skipped: number };
type Stat = { readonly label: string; readonly value: number; readonly warn?: boolean };

const MAX_SIZE_LABEL = "5 MB";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CsvFileIcon({ className }: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 40 44" className={className} aria-hidden="true">
      <path d="M9 1.5h16.5L37 13v26a3.5 3.5 0 0 1-3.5 3.5H9A3.5 3.5 0 0 1 5.5 39V5A3.5 3.5 0 0 1 9 1.5Z" className="fill-card stroke-border" strokeWidth="1.5" />
      <path d="M25.5 1.5V9a4 4 0 0 0 4 4H37" fill="none" className="stroke-border" strokeWidth="1.5" />
      <rect x="1" y="20" width="26" height="14" rx="3.5" className="fill-emerald-500" />
      <text x="14" y="30" textAnchor="middle" className="fill-white" fontSize="8.5" fontWeight="700" letterSpacing="0.3">CSV</text>
    </svg>
  );
}

function Code({ children }: { readonly children: string }) {
  return <code className="rounded-md border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[12.5px] text-foreground">{children}</code>;
}

/** Counters that roll to their new value when the mapping changes them,
 *  rather than snapping — the number moving is how the change reads. */
function StatGrid({ stats, className }: { readonly stats: readonly Stat[]; readonly className?: string }) {
  return (
    <dl className={cn("grid gap-px overflow-hidden rounded-2xl border border-border bg-border", className)}>
      {stats.map((stat) => (
        <div key={stat.label} className="bg-card px-4 py-3.5">
          <dt className="text-xs text-muted-foreground">{stat.label}</dt>
          <dd
            className={cn(
              "mt-1 text-2xl font-semibold tabular-nums transition-colors duration-300",
              stat.warn && stat.value > 0 && "text-amber-600 dark:text-amber-400",
            )}
          >
            <AnimatedNumber value={stat.value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function downloadSample(filename: string) {
  const blob = new Blob(["﻿", sampleCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Excel on Windows still saves "CSV" as Windows-1252. UTF-8 first; a
 *  replacement character means the guess was wrong and accents would be lost. */
async function readText(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
}

export default function ContactImportPage() {
  const { t } = useI18n();
  const router = useRouter();
  const reduce = useReducedMotion();
  const inputId = useId();
  const dragDepth = useRef(0);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [mapping, setMapping] = useState<ContactField[]>([]);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const preview = useMemo(() => (upload ? buildImport(upload.table, mapping) : null), [upload, mapping]);
  const hasIdentity = mapping.includes("email") || mapping.includes("phone");
  const fade = { initial: reduce ? { opacity: 0 } : { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.2, ease: EASE_OUT } };

  const reset = useCallback(() => {
    setUpload(null);
    setMapping([]);
    setOutcome(null);
    setError(null);
    setStep(1);
  }, []);

  const back = useCallback(() => {
    if (step === 2) reset();
    else router.push("/crm");
  }, [step, reset, router]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || busy) return;
      // An open select closes itself on Escape; that press is not "go back".
      if (event.target instanceof Element && event.target.closest("[role=listbox],[role=dialog]")) return;
      back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back, busy]);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") return setFileError(t("contactImport.error.type"));
    if (file.size > CSV_MAX_BYTES) return setFileError(t("contactImport.error.size", { size: MAX_SIZE_LABEL }));
    let table: CsvTable;
    try {
      table = parseCsv(await readText(file));
    } catch {
      return setFileError(t("contactImport.error.read"));
    }
    if (table.rows.length === 0) return setFileError(t("contactImport.error.empty"));
    if (table.rows.length > CSV_MAX_ROWS) {
      return setFileError(t("contactImport.error.rows", { count: table.rows.length, max: CSV_MAX_ROWS }));
    }
    setUpload({ name: file.name, size: file.size, table });
    setMapping(autoMap(table.headers));
    setStep(2);
  };

  const setField = (column: number, field: ContactField) => {
    setMapping((current) => current.map((value, index) => {
      if (index === column) return field;
      // One column per contact field: the column that held it lets it go.
      return UNIQUE_FIELDS.has(field) && value === field ? "ignore" : value;
    }));
  };

  const submit = async () => {
    if (!preview || preview.contacts.length === 0 || !hasIdentity) return;
    setBusy(true);
    setError(null);
    const result = await fetchJson<{ created: number; updated: number }>("/api/contacts/import", t, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contacts: preview.contacts }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOutcome({ created: result.data.created, updated: result.data.updated, skipped: preview.invalid + preview.duplicates });
    setStep(3);
  };

  const title = step === 1 ? t("contactImport.uploadTitle") : step === 2 ? t("contactImport.mapTitle") : t("contactImport.doneTitle");
  const subtitle = step === 2 ? t("contactImport.mapSubtitle") : step === 3 ? t("contactImport.doneSubtitle") : null;
  const statusNotes = preview && hasIdentity && mapping.includes("status")
    ? (Object.entries(preview.byStatus) as [ContactStatus, number][]).filter(([status]) => status !== "open")
    : [];

  return (
    <PageContainer maxWidth="max-w-3xl" pattern="none">
      <button
        type="button"
        onClick={back}
        disabled={busy}
        className="-ml-1 mb-8 inline-flex items-center gap-2 rounded-lg px-1 py-0.5 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.75} />
        {t("contactImport.back")}
        <kbd className="rounded-md border border-border bg-muted px-1.5 py-px font-mono text-[11px] leading-4 text-muted-foreground">esc</kbd>
      </button>

      <header className="mb-7">
        <p className="text-sm tabular-nums text-muted-foreground">{t("contactImport.step", { current: step, total: 3 })}</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p> : null}
      </header>

      <motion.div
        key={step}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: EASE_OUT }}
      >
        {step === 1 ? (
          <>
            <label
              htmlFor={inputId}
              data-dragging={dragging}
              onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setDragging(true); }}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
              onDragLeave={(event) => {
                event.preventDefault();
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (dragDepth.current === 0) setDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                dragDepth.current = 0;
                setDragging(false);
                void readFile(event.dataTransfer.files[0]);
              }}
              className="group flex min-h-60 cursor-pointer flex-col items-center justify-center gap-5 rounded-2xl border border-dashed border-border bg-muted/25 px-6 py-10 text-center transition-[background-color,border-color] duration-200 ease-out hover:border-foreground/25 hover:bg-muted/45 has-focus-visible:ring-2 has-focus-visible:ring-ring data-[dragging=true]:border-foreground/40 data-[dragging=true]:bg-muted/60"
            >
              <CsvFileIcon className="h-12 w-11 transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-data-[dragging=true]:-translate-y-1 group-data-[dragging=true]:scale-105 motion-reduce:transition-none" />
              <span>
                <span className="block text-[15px] text-foreground">
                  <span className="font-medium underline decoration-foreground/40 underline-offset-4 transition-[text-decoration-color] duration-200 group-hover:decoration-foreground">{t("contactImport.choose")}</span>{" "}
                  {t("contactImport.orDrop")}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{t("contactImport.limit", { size: MAX_SIZE_LABEL })}</span>
              </span>
              <input
                id={inputId}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => {
                  void readFile(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <AnimatePresence initial={false}>
              {fileError ? (
                <motion.p key={fileError} role="alert" className="mt-3 text-sm text-destructive" {...fade}>{fileError}</motion.p>
              ) : null}
            </AnimatePresence>

            <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium">{t("contactImport.requirements")}</h2>
                <button
                  type="button"
                  onClick={() => downloadSample(t("contactImport.sampleFile"))}
                  className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground underline underline-offset-4 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <HugeiconsIcon icon={FileDownloadIcon} size={15} strokeWidth={1.75} />
                  {t("contactImport.downloadSample")}
                </button>
              </div>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-muted-foreground/50">
                <li>{t("contactImport.reqIdentity")} <Code>email</Code> <Code>phone</Code></li>
                <li>
                  {t("contactImport.reqOptional")} <Code>name</Code> <Code>first_name</Code> <Code>last_name</Code> <Code>status</Code> <Code>notes</Code>.{" "}
                  {t("contactImport.reqExtra")}
                </li>
                <li>{t("contactImport.reqFormat")}</li>
              </ul>
            </section>

            <section className="mt-10">
              <h2 className="text-sm text-muted-foreground">{t("contactImport.otherWays")}</h2>
              <ul className="mt-2 space-y-0.5">
                {[
                  { href: "/forms", icon: Note01Icon, label: t("contactImport.viaForm") },
                  { href: "/connections", icon: Link04Icon, label: t("contactImport.viaConnections") },
                ].map((way) => (
                  <li key={way.href}>
                    <Link href={way.href} className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 text-[15px] text-foreground outline-none transition-colors duration-150 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring">
                      <HugeiconsIcon icon={way.icon} size={18} strokeWidth={1.75} className="text-muted-foreground transition-colors duration-150 group-hover:text-foreground" />
                      {way.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}

        {step === 2 && upload && preview ? (
          <>
            <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
              <CsvFileIcon className="h-11 w-10 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{upload.name}</p>
                <p className="text-sm tabular-nums text-muted-foreground">
                  {formatBytes(upload.size)} · {t("contactImport.rowsFound", { count: preview.total })}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
                <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.75} />
                {t("contactImport.changeFile")}
              </Button>
            </div>

            <StatGrid
              className="mt-4 grid-cols-2 sm:grid-cols-4"
              stats={[
                { label: t("contactImport.statValid"), value: hasIdentity ? preview.contacts.length : 0 },
                { label: t("contactImport.statInvalid"), value: hasIdentity ? preview.invalid : preview.total, warn: true },
                { label: t("contactImport.statDuplicates"), value: preview.duplicates },
                { label: t("contactImport.statTotal"), value: preview.total },
              ]}
            />

            <section className="mt-8">
              <h2 className="text-sm font-medium">{t("contactImport.mapping")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("contactImport.mappingHint")}</p>

              <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
                <div className="hidden grid-cols-[minmax(0,1fr)_1.25rem_minmax(0,1fr)] items-center gap-3 border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground sm:grid">
                  <span>{t("contactImport.csvColumn")}</span>
                  <span />
                  <span>{t("contactImport.contactField")}</span>
                </div>
                <ul className="divide-y divide-border">
                  {upload.table.headers.map((header, column) => {
                    const sample = upload.table.rows.slice(0, 25).map((row) => row[column]).find(Boolean);
                    const ignored = mapping[column] === "ignore";
                    return (
                      <li key={`${column}-${header}`} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_1.25rem_minmax(0,1fr)] sm:items-center sm:gap-3">
                        <div className={cn("min-w-0 transition-opacity duration-200", ignored && "opacity-50")}>
                          <p className="truncate font-mono text-[13px] text-foreground">{header}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {sample ? t("contactImport.sample", { value: sample }) : t("contactImport.emptyColumn")}
                          </p>
                        </div>
                        <HugeiconsIcon
                          icon={ArrowRight01Icon}
                          size={16}
                          strokeWidth={1.75}
                          className={cn("hidden text-muted-foreground transition-opacity duration-200 sm:block", ignored && "opacity-40")}
                        />
                        <Select value={mapping[column]} onValueChange={(value) => setField(column, value as ContactField)} disabled={busy}>
                          <SelectTrigger className="w-full" aria-label={`${t("contactImport.contactField")}: ${header}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONTACT_FIELDS.map((field) => (
                              <SelectItem key={field} value={field}>{t(`contactImport.field.${field}`)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>

            <div className="mt-5 space-y-1.5 text-sm">
              <AnimatePresence initial={false} mode="popLayout">
                {!hasIdentity ? (
                  <motion.p key="identity" role="alert" className="text-amber-700 dark:text-amber-400" {...fade}>
                    {t("contactImport.needsIdentity")}
                  </motion.p>
                ) : null}
                {statusNotes.map(([status, count]) => (
                  <motion.p key={status} layout="position" className="text-muted-foreground" {...fade}>
                    {t("contactImport.statusSummary", { count, status: contactStatusLabel(t, status) })}
                  </motion.p>
                ))}
              </AnimatePresence>
            </div>

            <ErrorBanner className="mt-5" error={error} onDismiss={() => setError(null)} />

            <div className="mt-8 flex items-center justify-between gap-3">
              <Button variant="ghost" onClick={reset} disabled={busy}>{t("contactImport.back")}</Button>
              <Button size="lg" onClick={() => void submit()} disabled={busy || !hasIdentity || preview.contacts.length === 0} aria-busy={busy}>
                {busy ? <Spinner size={16} /> : null}
                {busy ? t("contactImport.importing") : t("contactImport.submit", { count: preview.contacts.length })}
              </Button>
            </div>
          </>
        ) : null}

        {step === 3 && outcome ? (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8">
            <motion.span
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 22, delay: 0.08 }}
              className="grid size-11 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            >
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={22} strokeWidth={1.75} />
            </motion.span>
            <StatGrid
              className="mt-6 grid-cols-3 rounded-xl"
              stats={[
                { label: t("contactImport.statCreated"), value: outcome.created },
                { label: t("contactImport.statUpdated"), value: outcome.updated },
                { label: t("contactImport.statSkipped"), value: outcome.skipped },
              ]}
            />
            <div className="mt-6 flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/crm">{t("contactImport.viewCrm")}</Link>
              </Button>
              <Button variant="outline" onClick={reset}>{t("contactImport.another")}</Button>
            </div>
          </div>
        ) : null}
      </motion.div>
    </PageContainer>
  );
}
