"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { Add01Icon, Cancel01Icon, Clock01Icon, Contact01Icon, Download01Icon, DragDropIcon, FileImportIcon, Loading03Icon, SearchIcon, Target01Icon, UserAdd01Icon } from "@hugeicons/core-free-icons";
import { PageContainer } from "../../_components/page-container";
import { Card, CardBody, CardHeader, CardSeparator, CardTitle, CardDescription } from "../../_components/dashboard-card";
import { CardCarousel } from "../../_components/card-carousel";
import { KpiBars, KpiCard, KpiSparkline } from "../../_components/kpi-card";
import { AnimatedNumber, ChartPeriod, ChartSelector, StackedBars, TimeSeries } from "../../_components/chart";
import chartStyles from "../../_components/charts/tiles.module.css";
import { ContactDialog } from "../../_components/contact-dialog";
import { CrmBoard, CRM_COLUMNS, STATUS_THEME, q as crmQ, type GroupedContacts } from "./_components/crm-board";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { Skeleton, SkeletonAvatar, SkeletonBar } from "@/components/ai-elements/skeleton";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { Button } from "@/components/ui/button";
import { ActionSwapText } from "@/components/motion/action-swap";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast-provider";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import type { Contact, ContactStatus } from "@/lib/types";
import { usePolling } from "@/lib/use-polling";
import { moveContactTo } from "@/lib/contact-order";
import { countByDay } from "@/lib/chart-data";
import { contactSourceLabel, contactStatusLabel } from "@/lib/contact-labels";
import { csvCell, csvFile } from "@/lib/csv-export";

/** Skeleton for the CRM page — header, pipeline bar, search row, kanban board. */
function CrmSkeleton() {
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBar className="h-7 w-32" />
          <SkeletonBar className="h-4 w-56" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBar className="h-9 w-32 rounded-lg" />
          <SkeletonBar className="h-9 w-32 rounded-lg" />
        </div>
      </header>

      <SkeletonBar className="h-1.5 w-full rounded-full" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SkeletonBar className="h-9 w-full max-w-sm rounded-lg" />
        <SkeletonBar className="h-3 w-24" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CRM_COLUMNS.map((status, col) => (
          <div
            key={status}
            className="space-y-3 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-soft)]"
          >
            <div className="flex items-center justify-between px-1">
              <SkeletonBar className="h-3.5 w-16" />
              <SkeletonBar className="h-4 w-5 rounded-full" />
            </div>
            {Array.from({ length: col === 3 ? 1 : 2 }).map((_, card) => (
              <div key={card} className="space-y-2 rounded-xl border border-border/60 bg-background p-3">
                <div className="flex items-center gap-2">
                  <SkeletonAvatar size="size-7" />
                  <SkeletonBar className="h-3.5 w-20" />
                </div>
                <SkeletonBar className="h-3 w-28" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CrmPage() {
  const { locale, t } = useI18n();
  const reduced = useReducedMotion();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<ContactStatus | "all">("all");
  const [view, setView] = useState<"kanban" | "list" | "analytics">("list");
  const [dragActive, setDragActive] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [trendDays, setTrendDays] = useState(14);

  /** The list as it stands right now, for rolling an optimistic move back. */
  const contactsRef = useRef<Contact[]>(contacts);
  contactsRef.current = contacts;

  /** Polling stands down for the length of a drag and of the write that follows
   *  it. Both live in refs rather than state because `usePolling` re-runs — and
   *  ticks immediately — whenever its `enabled` flag flips: gating it on an
   *  `isDragging` state fired a refetch at the exact moment a card was let go,
   *  and that GET answered with the pre-move order, so the card snapped back to
   *  the column it had just left until the PUT landed and moved it again. */
  const isDraggingRef = useRef(false);
  const movesInFlight = useRef(0);

  const load = useCallback(async () => {
    const result = await fetchJson<{ contacts?: Contact[] }>("/api/contacts?limit=200", t);
    if (isDraggingRef.current) return result.ok;
    setIsLoading(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setError(null);
    setContacts(result.data.contacts ?? []);
    return true;
  }, [t]);

  // A card in the air must not be yanked out from under the pointer by a
  // background refresh, and neither must one that has landed but is still
  // being written.
  usePolling(() => {
    if (isDraggingRef.current || movesInFlight.current > 0) return;
    void load();
  }, 30_000);
  useEffect(() => { void load(); }, [load]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    // El GET local resuelve en milisegundos y el spin no llegaba a verse:
    // duración mínima para que cada clic reproduzca la animación completa.
    await Promise.all([load(), new Promise((resolve) => setTimeout(resolve, 800))]);
    setIsRefreshing(false);
  }, [load]);

  const sources = useMemo(
    () => [...new Set(contacts.map((contact) => contact.source).filter(Boolean))].sort(),
    [contacts],
  );

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((contact) => {
      if (sourceFilter !== "all" && contact.source !== sourceFilter.slice(7)) return false;
      if (statusFilter !== "all" && contact.status !== statusFilter) return false;
      return !q || contact.name.toLowerCase().includes(q) ||
        contact.phone?.includes(q) || contact.email?.toLowerCase().includes(q);
    });
  }, [contacts, search, sourceFilter, statusFilter]);

  const leadsPerDay = useMemo(
    () => countByDay(filteredContacts.map((contact) => contact.createdAt), { locale, days: trendDays }),
    [filteredContacts, locale, trendDays],
  );

  const leadsBySource = useMemo(() => {
    const counts = new Map<string, number[]>();
    for (const contact of filteredContacts) {
      const source = contact.source || "unknown";
      const values = counts.get(source) ?? CRM_COLUMNS.map(() => 0);
      const index = CRM_COLUMNS.indexOf(contact.status);
      if (index >= 0) values[index] += 1;
      counts.set(source, values);
    }
    return [...counts].map(([source, values]) => ({
      key: source,
      label: contactSourceLabel(t, source),
      values,
    }));
  }, [filteredContacts, t]);

  const grouped = useMemo(() => {
    const map: GroupedContacts = { open: [], waiting_human: [], followup_due: [], closed: [] };
    for (const c of filteredContacts) map[c.status]?.push(c);
    return map;
  }, [filteredContacts]);

  const groupedRef = useRef<GroupedContacts>(grouped);
  groupedRef.current = grouped;

  /** The board counts slots in what it draws, and what it draws is the column
   *  as the search left it. Both `moveContactTo` here and `moveContact` in the
   *  store place the card in the *whole* column, so a drop made with a search
   *  active has to be translated first — otherwise the card lands next to the
   *  card it was dropped beside only until the search is cleared. The slot is
   *  named by the card it opened above; that card's place in the full column is
   *  the real index. */
  const absoluteIndex = useCallback((id: string, status: ContactStatus, index?: number) => {
    if (index === undefined) return undefined;
    const column = contactsRef.current.filter((c) => c.status === status && c.id !== id);
    const anchor = groupedRef.current[status].filter((c) => c.id !== id)[index];
    if (!anchor) return column.length;
    const at = column.findIndex((c) => c.id === anchor.id);
    return at === -1 ? column.length : at;
  }, []);

  const openCreate = () => {
    setEditingContact(null);
    setDialogOpen(true);
  };
  const openEdit = useCallback((contact: Contact) => {
    setEditingContact(contact);
    setDialogOpen(true);
  }, []);

  /** Optimistic: the card lands in the slot it was dropped on, and only rolls
   *  back if the write actually fails. `index` is the position inside the
   *  destination column — the same ordering the store applies, computed by the
   *  same function, so the board never flickers into a different order when
   *  the refetch lands. */
  const move = useCallback(async (id: string, status: ContactStatus, index?: number) => {
    const previous = contactsRef.current;
    const current = previous.find((c) => c.id === id);
    if (!current) return;
    if (current.status === status && index === undefined) return;
    const slot = absoluteIndex(id, status, index);
    setContacts(moveContactTo(previous, id, status, slot));
    movesInFlight.current += 1;
    try {
      const result = await fetchJson("/api/contacts", t, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId: id, status, index: slot }),
      });
      if (!result.ok) {
        setContacts(previous);
        setError(result.error);
        toast({
          title: t("common.somethingWentWrong"),
          description: t("common.somethingWentWrongDescription"),
          status: "error",
        });
        return;
      }
      await load();
    } finally {
      movesInFlight.current -= 1;
    }
  }, [t, load, toast, absoluteIndex]);

  const remove = useCallback(async (id: string) => {
    if (!(await confirm({ title: t("crm.confirmDelete") }))) return;
    const result = await fetchJson(`/api/contacts?contactId=${encodeURIComponent(id)}`, t, { method: "DELETE" });
    if (!result.ok) {
      setError(result.error);
      toast({ title: t("common.somethingWentWrong"), description: t("common.somethingWentWrongDescription"), status: "error" });
    } else {
      void load();
      toast({ title: t("common.deleted"), description: t("common.deletedDescription"), status: "success" });
    }
  }, [t, load, confirm, toast]);

  /** Stable identities for everything the board takes. The board re-renders on
   *  every pointer move of a drag, and an inline prop here would rebuild its
   *  drag handlers each frame, which in turn defeats `ContactCard`'s memo and
   *  re-renders every card on the board sixty times a second. */
  const handleMove = useCallback((id: string, status: ContactStatus, index?: number) => {
    void move(id, status, index);
  }, [move]);
  const handleDelete = useCallback((id: string) => void remove(id), [remove]);
  const handleDragActive = useCallback((active: boolean) => {
    isDraggingRef.current = active;
    setDragActive(active);
  }, []);

  const exportCSV = () => {
    const header = "id,name,phone,email,channel,status,source,createdAt\r\n";
    const blob = csvFile(
      header,
      filteredContacts.map((contact) =>
        [contact.id, contact.name, contact.phone, contact.email, contact.channel, contact.status, contact.source, contact.createdAt].map(csvCell),
      ),
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const total = filteredContacts.length;
  const noResults = total === 0 && contacts.length > 0;

  return (
    <PageContainer maxWidth="max-w-[1400px]" pattern="grid">
      {confirmDialog}
      <Skeleton className="min-h-[500px]" isLoading={isLoading} skeleton={<CrmSkeleton />}>
        <div className="content-enter">
          <ErrorBanner className="mb-6" error={error} onDismiss={() => setError(null)} />
          <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">{t("crm.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("crm.subtitle")} · {t("leads.counter", { shown: total, total: contacts.length })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" asChild>
                <Link href="/crm/import">
                  <HugeiconsIcon icon={FileImportIcon} size={16} strokeWidth={1.75} />
                  {t("contactImport.cta")}
                </Link>
              </Button>
              <Button variant="outline" onClick={exportCSV} disabled={dragActive || total === 0}>
                <HugeiconsIcon icon={Download01Icon} size={16} strokeWidth={1.75} />
                {t("leads.exportCsv")}
              </Button>
              <Button variant="outline" onClick={() => void refresh()} disabled={isRefreshing || dragActive}>
                <ActionSwapText value={isRefreshing ? "refreshing" : "idle"}>
                  {isRefreshing ? t("crm.refreshing") : t("crm.contactCount", { count: total })}
                </ActionSwapText>
                <AnimatePresence initial={false}>
                  {isRefreshing ? (
                    <motion.span
                      key="refresh-spinner"
                      initial={{ opacity: 0, scale: 0.5, width: 0 }}
                      animate={{ opacity: 1, scale: 1, width: "auto" }}
                      exit={{ opacity: 0, scale: 0.5, width: 0 }}
                      transition={{ duration: reduced ? 0 : 0.2, ease: "easeInOut" }}
                      className="inline-flex overflow-hidden"
                    >
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={16}
                        strokeWidth={1.75}
                        className="animate-spin"
                      />
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </Button>
              <Button onClick={openCreate} disabled={dragActive}>
                {t("crm.addContact")}
                <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
              </Button>
            </div>
          </header>

          {/* Pipeline bar — where the pipeline actually sits, in one glance. */}
          {total > 0 ? (
            <div className="mb-5 flex h-1.5 gap-1 overflow-hidden rounded-full">
              {CRM_COLUMNS.map((status) => {
                const count = grouped[status].length;
                if (count === 0) return null;
                return (
                  <Tooltip key={status}>
                    <TooltipTrigger asChild>
                      <motion.span
                        className={cn("block h-full rounded-full", STATUS_THEME[status].bar)}
                        initial={false}
                        animate={{ flexGrow: count }}
                        transition={
                          reduced
                            ? { duration: 0 }
                            : { type: "spring", stiffness: 300, damping: 30, mass: 0.7 }
                        }
                        style={{ flexBasis: 0 }}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      {t(`contactStatus.${status}`)} · {count}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <fieldset disabled={dragActive} aria-label={locale === "es" ? "Vista del CRM" : "CRM view"} className="min-w-0 shrink-0 disabled:opacity-50">
              <SlidingTabs
                tabs={[
                  { id: "kanban", label: "Kanban" },
                  { id: "list", label: locale === "es" ? "Lista" : "List" },
                  { id: "analytics", label: locale === "es" ? "Estadísticas" : "Analytics" },
                ]}
                value={view}
                onValueChange={(mode) => {
                  if (!dragActive && (mode === "kanban" || mode === "list" || mode === "analytics")) setView(mode);
                }}
              />
            </fieldset>
            <div className="relative min-w-[200px] flex-1">
              <HugeiconsIcon
                icon={SearchIcon}
                size={16}
                strokeWidth={1.75}
                className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label={t("crm.searchPlaceholder")}
                value={search}
                disabled={dragActive}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("crm.searchPlaceholder")}
                className={cn("pl-9", search && "pr-9")}
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  disabled={dragActive}
                  aria-label={t("crm.clearSearch")}
                  className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
                </button>
              ) : null}
            </div>
            <Select value={sourceFilter} onValueChange={setSourceFilter} disabled={dragActive}>
              <SelectTrigger aria-label={t("common.filterBySource")} className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("leads.allSources")}</SelectItem>
                {sources.map((source) => (
                  <SelectItem key={source} value={`source:${source}`}>{contactSourceLabel(t, source)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(status) => setStatusFilter(status as ContactStatus | "all")} disabled={dragActive}>
              <SelectTrigger aria-label={t("common.filterByStatus")} className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("leads.allStatuses")}</SelectItem>
                {CRM_COLUMNS.map((status) => (
                  <SelectItem key={status} value={status}>{contactStatusLabel(t, status)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {view !== "analytics" ? <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {t("crm.dragHint")}
              <HugeiconsIcon icon={DragDropIcon} size={14} strokeWidth={1.75} />
            </p> : null}
          </div>

          {/* Mismo inset que el scroller del board (q(8)): los tres tabs
              arrancan en el mismo px y no hay salto al cambiar de vista. */}
          <div className="w-full min-w-0" style={{ containerType: "inline-size" }}>
          {view !== "analytics" ? <CrmBoard
            view={view}
            grouped={grouped}
            onMove={handleMove}
            onEdit={openEdit}
            onDelete={handleDelete}
            onDragActiveChange={handleDragActive}
          /> : null}

          {view !== "analytics" && total === 0 ? (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {noResults ? t("leads.noResults") : t("leads.empty")}
            </p>
          ) : null}

          {view === "analytics" ? (
            <section aria-label={locale === "es" ? "Estadísticas" : "Analytics"} style={{ padding: crmQ(8) }}>
              <CardCarousel label="Estadísticas">
                <div className="mb-4 flex items-stretch gap-4" style={{ paddingInline: "2px" }}>
                  <div className="min-w-[200px] flex-1">
                    <KpiCard
                      icon={Contact01Icon}
                      label={t("leads.kpiTotal")}
                      value={total}
                      sub={t("leads.counter", { shown: total, total: contacts.length })}
                    />
                  </div>
                  <div className="min-w-[200px] flex-1">
                    <KpiCard
                      icon={Target01Icon}
                      label={t("leads.kpiCloseRate")}
                      value={total > 0 ? `${Math.round((grouped.closed.length / total) * 100)}%` : "—"}
                      sub={t("leads.kpiCloseRateSub", { closed: grouped.closed.length, total })}
                      visual={<KpiBars ratio={total > 0 ? grouped.closed.length / total : 0} tone="positive" />}
                    />
                  </div>
                  <div className="min-w-[200px] flex-1">
                    <KpiCard
                      icon={Clock01Icon}
                      label={t("leads.kpiPending")}
                      value={grouped.waiting_human.length + grouped.followup_due.length}
                      sub={t("leads.kpiPendingSub", { waiting: grouped.waiting_human.length, followup: grouped.followup_due.length })}
                    />
                  </div>
                  <div className="min-w-[200px] flex-1">
                    <KpiCard
                      icon={UserAdd01Icon}
                      label={t("leads.kpiNew")}
                      value={leadsPerDay.reduce((sum, day) => sum + day.value, 0)}
                      sub={t("leads.kpiNewSub", { days: trendDays })}
                      visual={<KpiSparkline points={leadsPerDay.map((day) => day.value)} />}
                    />
                  </div>
                </div>
              </CardCarousel>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <div className="min-w-0 flex-1">
                      <CardTitle>{t("leads.trendTitle")}</CardTitle>
                      <CardDescription className="truncate leading-[18px]"><ChartPeriod value={String(trendDays)}>{trendDays} {locale === "es" ? "días" : "days"}</ChartPeriod></CardDescription>
                    </div>
                  </CardHeader>
                  <CardSeparator />
                  <CardBody>
                    <div className={chartStyles.root}>
                      <div className={chartStyles.stackSummary}>
                        <AnimatedNumber className={chartStyles.stackTotal} value={leadsPerDay.reduce((sum, day) => sum + day.value, 0)} />
                        <span className={chartStyles.stackCaption}>{locale === "es" ? "leads nuevos" : "new leads"}</span>
                      </div>
                      <div className={cn(chartStyles.stackLegend, "items-center [&>div]:mt-0")}>
                        <ChartSelector
                          label={t("common.filterByPeriod")}
                          value={String(trendDays)}
                          options={[7, 14, 30, 90].map((days) => ({ value: String(days), label: `${days}D` }))}
                          onChange={(value) => setTrendDays(Number(value))}
                        />
                      </div>
                      <TimeSeries
                        data={leadsPerDay}
                        emptyLabel={t("leads.trendEmpty")}
                        formatValue={(point) => (
                          <span className="tabular-nums">
                            {point.label} · {t("leads.trendTooltip", { count: point.value })}
                          </span>
                        )}
                      />
                    </div>
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader>
                    <div className="min-w-0 flex-1">
                      <CardTitle>{t("leads.bySourceTitle")}</CardTitle>
                      <CardDescription className="truncate leading-[18px]">{t("leads.bySourceDescription")}</CardDescription>
                    </div>
                  </CardHeader>
                  <CardSeparator />
                  <CardBody>
                    <StackedBars
                      columns={leadsBySource}
                      bands={CRM_COLUMNS.map((status) => ({ key: status, label: contactStatusLabel(t, status) }))}
                      emptyLabel={t("leads.bySourceEmpty")}
                      totalLabel={t("leads.bySourceTitle")}
                    />
                  </CardBody>
                </Card>
              </div>
            </section>
          ) : null}
          </div>
        </div>
      </Skeleton>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <ContactDialog
          key={editingContact?.id ?? "new"}
          editing={editingContact}
          onClose={() => setDialogOpen(false)}
          onSaved={(updated) => setContacts(updated)}
        />
      </Dialog>
    </PageContainer>
  );
}
