"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  UserIcon,
  CheckIcon,
  Add01Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  Delete01Icon,
  PencilEdit01Icon,
  SearchIcon,
  Download01Icon,
} from "@hugeicons/core-free-icons";
import { PageContainer } from "../../_components/page-container";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { Card } from "../../_components/dashboard-card";
import { ChannelIcon } from "../../_components/channel-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton, SkeletonBar } from "@/components/ai-elements/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Pagination } from "@/components/ai-elements/pagination";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/motion/checkbox";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast-provider";
import { useI18n, useT } from "@/lib/i18n/provider";
import { countryOptions } from "@/lib/countries";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { csvCell, csvFile } from "@/lib/csv-export";
import type { Contact, ContactStatus, ChannelId } from "@/lib/types";
import { usePolling } from "@/lib/use-polling";

// Validation patterns
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[\d\s\-()]{7,20}$/;

/** Skeleton for the Inbox page — header + search, then a list of contact rows. */
function InboxSkeleton() {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBar className="h-7 w-24" />
          <SkeletonBar className="h-4 w-64" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBar className="h-9 w-9 rounded-lg sm:w-24" />
          <SkeletonBar className="h-9 w-9 rounded-lg sm:w-40" />
        </div>
      </header>
      <SkeletonBar className="h-9 w-full rounded-lg" />
      <div className="flex items-center gap-2 px-1">
        <SkeletonBar className="size-4 rounded" />
        <SkeletonBar className="h-3 w-20" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-[var(--shadow-soft)]"
          >
            <SkeletonBar className="size-4 shrink-0 rounded" />
            <SkeletonBar className="size-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBar className="h-4 w-40" />
              <SkeletonBar className="h-3 w-64" />
            </div>
            <SkeletonBar className="hidden h-3 w-12 sm:block" />
            <SkeletonBar className="h-8 w-20 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function InboxPage() {
  const t = useT();
  const { locale } = useI18n();
  const { confirm } = useConfirmDialog();
  const { toast } = useToast();
  const phoneCountries = useMemo(() => countryOptions(locale), [locale]);
  const reduce = useReducedMotion();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState<ContactStatus>("open");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Portal target for floating bulk bar: `main#main-content` has no animated
  // transform, while `.page-enter`/`.content-enter` keep `translateY(0)` via
  // fill-mode `both` — which would hijack any `fixed` descendant.
  const [mainEl, setMainEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setMainEl(document.getElementById("main-content"));
  }, []);

  // Create form state
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPhoneIso, setNewPhoneIso] = useState("ar");
  const newPhoneDial = phoneCountries.find((c) => c.iso2 === newPhoneIso)?.dial ?? "+54";
  const [newEmail, setNewEmail] = useState("");
  const [newChannel, setNewChannel] = useState<ChannelId | "form">("form");
  const [newNotes, setNewNotes] = useState("");

  // Validation state
  const [error, setError] = useState<UiError | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [shakingFields, setShakingFields] = useState<Set<string>>(new Set());
  const shakeTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // No arrival cue here: the shell polls the same queue on every route and
  // owns the `chime`. Ringing it again on the one page you could already see
  // the new row on would just be the same bell twice.
  const load = useCallback(async () => {
    const result = await fetchJson<{ contacts?: Contact[] }>("/api/contacts?limit=200", t);
    setIsLoading(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setError(null);
    setContacts(
      (result.data.contacts ?? []).filter(
        (c) => c.status === "waiting_human" || c.status === "followup_due",
      ),
    );
    return true;
  }, [t]);

  /** Change something, then refresh. False (with the banner up) when the
   *  server refused, so callers don't clear a form whose save didn't land. */
  const send = useCallback(
    async (init: RequestInit & { url?: string }): Promise<boolean> => {
      const { url = "/api/contacts", ...rest } = init;
      const result = await fetchJson(url, t, rest);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      await load();
      return true;
    },
    [load, t],
  );

  // One immediate call from `usePolling` covers the first paint too.
  usePolling(() => void load(), 30_000);


  // Trigger shake animation on a field
  const triggerShake = useCallback((key: string) => {
    const existing = shakeTimeouts.current.get(key);
    if (existing) clearTimeout(existing);
    setShakingFields((prev) => new Set(prev).add(key));
    const timeout = setTimeout(() => {
      setShakingFields((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      shakeTimeouts.current.delete(key);
    }, 300);
    shakeTimeouts.current.set(key, timeout);
  }, []);

  // Validate create form
  const validateCreateForm = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    let hasError = false;

    // At least one of name/phone/email required
    if (!newName.trim() && !newPhone.trim() && !newEmail.trim()) {
      errors.name = t("inbox.errorIdentityRequired");
      hasError = true;
      triggerShake("name");
    }

    // Phone validation (if provided)
    const fullPhoneCheck = newPhone.trim() ? (newPhone.trim().startsWith("+") ? newPhone.trim() : `${newPhoneDial}${newPhone.trim().replace(/^0+/, "")}`) : "";
    if (newPhone.trim() && !PHONE_REGEX.test(fullPhoneCheck)) {
      errors.phone = t("inbox.errorPhoneFormat");
      hasError = true;
      triggerShake("phone");
    }

    // Email validation (if provided)
    if (newEmail.trim() && !EMAIL_REGEX.test(newEmail.trim())) {
      errors.email = t("inbox.errorEmailFormat");
      hasError = true;
      triggerShake("email");
    }

    setFormErrors(errors);
    return !hasError;
  }, [newName, newPhone, newPhoneDial, newEmail, triggerShake, t]);

  const resume = (id: string) => {
    void send({
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId: id, status: "open" }),
    });
  };

  const remove = async (id: string) => {
    if (!(await confirm({ title: t("inbox.confirmDelete") }))) return;
    const ok = await send({
      url: `/api/contacts?contactId=${encodeURIComponent(id)}`,
      method: "DELETE",
    });
    if (ok) {
      setExpandedId(null);
      toast({ title: t("common.deleted"), description: t("common.deletedDescription"), status: "success" });
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.notes && c.notes.toLowerCase().includes(q)),
    );
  }, [contacts, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  // Clamped on render: a search that shortens the list must not strand you on
  // a page that no longer exists.
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  const startEdit = (contact: Contact) => {
    setEditingId(contact.id);
    setEditName(contact.name);
    setEditNotes(contact.notes ?? "");
    setEditStatus(contact.status);
  };

  const saveEdit = (id: string) => {
    void send({
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contactId: id,
        status: editStatus,
        name: editName.trim() || undefined,
        notes: editNotes.trim() || undefined,
      }),
    }).then((ok) => {
      if (ok) setEditingId(null);
    });
  };

  // ── Bulk selection ───────────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filtered.length) return new Set();
      return new Set(filtered.map((c) => c.id));
    });
  }, [filtered]);

  const bulkStatus = (status: ContactStatus) => {
    const ids = [...selectedIds];
    Promise.all(
      ids.map((id) =>
        send({
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contactId: id, status }),
        }),
      ),
    ).then((results) => {
      if (results.every(Boolean)) setSelectedIds(new Set());
    });
  };

  const bulkDelete = async () => {
    const ids = [...selectedIds];
    if (!(await confirm({ title: t("inbox.confirmBulkDelete", { count: ids.length }) }))) return;
    const results = await Promise.all(
      ids.map((id) =>
        send({
          url: `/api/contacts?contactId=${encodeURIComponent(id)}`,
          method: "DELETE",
        }),
      ),
    );
    if (!results.every(Boolean)) return;
    setSelectedIds(new Set());
    setExpandedId(null);
    toast({ title: t("common.deleted"), description: t("common.deletedDescription"), status: "success" });
  };

  const exportCSV = (list: Contact[]) => {
    const header = "id,name,phone,email,channel,status,source,createdAt\r\n";
    const blob = csvFile(
      header,
      list.map((c) =>
        [c.id, c.name, c.phone, c.email, c.channel, c.status, c.source, c.createdAt].map(csvCell),
      ),
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const createContact = (e: FormEvent) => {
    e.preventDefault();
    if (!validateCreateForm()) return;
    const fullPhone = newPhone.trim() ? (newPhone.trim().startsWith("+") ? newPhone.trim() : `${newPhoneDial}${newPhone.trim().replace(/^0+/, "")}`) : undefined;
    void send({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contact: {
          name: newName.trim() || fullPhone || newEmail.trim(),
          phone: fullPhone,
          email: newEmail.trim() || undefined,
          channel: newChannel,
          source: "inbox",
          notes: newNotes.trim() || undefined,
          lastMessage: newNotes.trim() || undefined,
          lastMessageAt: new Date().toISOString(),
        },
      }),
    }).then((ok) => {
      if (!ok) return;
      setNewName("");
      setNewPhone("");
      setNewEmail("");
      setNewNotes("");
      setFormErrors({});
      setShowCreate(false);
    });
  };

  return (
    <PageContainer maxWidth="max-w-6xl" pattern="grid">
      <Skeleton className="min-h-[400px]" isLoading={isLoading} skeleton={<InboxSkeleton />}>
        <div className="content-enter">
          <ErrorBanner
            className="mb-6"
            error={error}
            onRetry={() => void load()}
            onDismiss={() => setError(null)}
          />
          <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">{t("inbox.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("inbox.subtitle")}</p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {contacts.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      aria-label={t("inbox.exportCsv")}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--shadow-inset)] transition duration-150 hover:border-input hover:bg-accent"
                      onClick={() => exportCSV(filtered.length > 0 ? filtered : contacts)}
                      type="button"
                    >
                      <HugeiconsIcon icon={Download01Icon} size={16} strokeWidth={1.75} />
                      CSV
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t("inbox.exportCsv")}</TooltipContent>
                </Tooltip>
              )}
              <button
                aria-label={t("inbox.createContact")}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--shadow-inset)] transition duration-150 hover:border-input hover:bg-accent"
                onClick={() => setShowCreate(!showCreate)}
                type="button"
              >
                <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
                {t("inbox.createContact")}
              </button>
            </div>
          </header>

          {/* Search */}
          {contacts.length > 0 && (
            <div className="relative mb-4">
              <HugeiconsIcon icon={SearchIcon} size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={t("inbox.search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("inbox.search")}
                className="pl-9"
              />
            </div>
          )}

          {/* Create contact form — accordion */}
          <motion.div layout>
            <motion.div
              initial={false}
              animate={{ height: showCreate ? "auto" : 0, opacity: showCreate ? 1 : 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25, mass: 0.8 }}
              style={{ overflow: "hidden" }}
            >
              <Card className="mb-6">
                <form onSubmit={createContact} className="space-y-4 p-5">
                  <p className="text-sm font-medium">{t("inbox.createContact")}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className={cn("t-input-wrap", formErrors.name && "is-error")}>
                      <label className="block space-y-1.5 text-sm">
                        <span className="font-medium">{t("inbox.name")}</span>
                        <div className={cn("t-input", formErrors.name && "is-error", shakingFields.has("name") && "is-shaking")}>
                          <Input
                            value={newName}
                            onChange={(e) => {
                              setNewName(e.target.value);
                              if (formErrors.name) setFormErrors((p) => { const n = { ...p }; delete n.name; return n; });
                            }}
                            placeholder={t("inbox.namePlaceholder")}
                            autoComplete="one-time-code"
                            data-1p-ignore="true"
                          />
                        </div>
                      </label>
                      {formErrors.name && <p className="t-error-msg mt-1 text-xs text-destructive">{formErrors.name}</p>}
                    </div>
                    <div className={cn("t-input-wrap", formErrors.phone && "is-error")}>
                      <label className="block space-y-1.5 text-sm">
                        <span className="font-medium">{t("inbox.phone")}</span>
                        <div className="flex gap-2">
                          <Select onValueChange={setNewPhoneIso} value={newPhoneIso}>
                            <SelectTrigger
                              aria-label={t("inbox.phone")} className="w-[4.5rem] shrink-0 justify-center px-2">
                              <span className="flex items-center gap-2">
                                {(() => {
                                  const selected = phoneCountries.find((c) => c.iso2 === newPhoneIso) ?? phoneCountries[0];
                                  return selected ? (
                                    <img
                                      src={selected.flag}
                                      alt={selected.name}
                                      className="h-4 w-6 rounded-[2px] object-cover"
                                    />
                                  ) : null;
                                })()}
                                <span className="sr-only">
                                  <SelectValue />
                                </span>
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {phoneCountries.map((c) => (
                                <SelectItem key={c.iso2} value={c.iso2}>
                                  <span className="flex items-center gap-2">
                                    <img
                                      src={c.flag}
                                      alt=""
                                      loading="lazy"
                                      decoding="async"
                                      className="h-3 w-[18px] rounded-[1px] object-cover"
                                    />
                                    <span>{c.dial}</span>
                                    <span className="text-muted-foreground truncate">{c.name}</span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className={cn("t-input flex-1", formErrors.phone && "is-error", shakingFields.has("phone") && "is-shaking")}>
                            <Input
                              value={newPhone}
                              onChange={(e) => {
                                setNewPhone(e.target.value);
                                if (formErrors.phone) setFormErrors((p) => { const n = { ...p }; delete n.phone; return n; });
                              }}
                              placeholder="11 1234-5678"
                              autoComplete="one-time-code"
                              data-1p-ignore="true"
                            />
                          </div>
                        </div>
                      </label>
                      {formErrors.phone && <p className="t-error-msg mt-1 text-xs text-destructive">{formErrors.phone}</p>}
                    </div>
                    <div className={cn("t-input-wrap", formErrors.email && "is-error")}>
                      <label className="block space-y-1.5 text-sm">
                        <span className="font-medium">{t("inbox.email")}</span>
                        <div className={cn("t-input", formErrors.email && "is-error", shakingFields.has("email") && "is-shaking")}>
                          <Input
                            value={newEmail}
                            onChange={(e) => {
                              setNewEmail(e.target.value);
                              if (formErrors.email) setFormErrors((p) => { const n = { ...p }; delete n.email; return n; });
                            }}
                            placeholder="lead@empresa.com"
                            autoComplete="one-time-code"
                            data-1p-ignore="true"
                          />
                        </div>
                      </label>
                      {formErrors.email && <p className="t-error-msg mt-1 text-xs text-destructive">{formErrors.email}</p>}
                    </div>
                    <label className="block space-y-1.5 text-sm">
                      <span className="font-medium">{t("inbox.channel")}</span>
                      <Select value={newChannel} onValueChange={(v) => setNewChannel(v as ChannelId | "form")}>
                        <SelectTrigger
                          aria-label={t("inbox.channel")} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="form">{t("inbox.channelForm")}</SelectItem>
                          <SelectItem value="web">{t("inbox.channelWeb")}</SelectItem>
                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                  </div>
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-medium">{t("inbox.notes")}</span>
                    <Input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder={t("inbox.notesPlaceholder")} />
                  </label>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm">{t("inbox.create")}</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => { setShowCreate(false); setFormErrors({}); }}>{t("inbox.cancel")}</Button>
                  </div>
                </form>
              </Card>
            </motion.div>
          </motion.div>

          {filtered.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                  <HugeiconsIcon icon={UserIcon} size={20} strokeWidth={1.75} />
                </div>
                <p className="text-sm font-medium">{t("inbox.empty")}</p>
                <p className="max-w-xs text-xs text-muted-foreground">{t("inbox.emptyHint")}</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-2">
              {/* Select all */}
              <div className="flex items-center gap-2 px-1">
                <Checkbox
                  checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onCheckedChange={toggleSelectAll}
                  aria-label={selectedIds.size === filtered.length && filtered.length > 0 ? t("inbox.deselectAll") : t("inbox.selectAll")}
                />
                <span className="text-xs text-muted-foreground">
                  {selectedIds.size === filtered.length && filtered.length > 0
                    ? t("inbox.deselectAll")
                    : t("inbox.selectAll")}
                </span>
              </div>

              {visible.map((contact) => {
                const isExpanded = expandedId === contact.id;
                const isSelected = selectedIds.has(contact.id);
                const attrs = Object.entries(contact.attributes);
                return (
                  <Card key={contact.id}>
                    <div className="flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-4">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(contact.id)}
                        aria-label={contact.name}
                        className="shrink-0"
                      />
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)] sm:size-10">
                        <ChannelIcon channel={contact.channel} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{contact.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {contact.lastMessage || contact.email || contact.phone || contact.source}
                        </p>
                        {/* Status badge inline on mobile below the name */}
                        <div className="mt-1 sm:hidden">
                          <StatusBadge
                            status={contact.status === "followup_due" ? "pending" : "warning"}
                            label={contact.status === "followup_due" ? t("inbox.followup") : t("inbox.handoff")}
                          />
                        </div>
                      </div>
                      {/* Status badge — only visible sm+ (shown inline on mobile above) */}
                      <div className="hidden shrink-0 sm:flex sm:min-w-[110px] sm:items-center sm:justify-center">
                        <StatusBadge
                          status={contact.status === "followup_due" ? "pending" : "warning"}
                          label={contact.status === "followup_due" ? t("inbox.followup") : t("inbox.handoff")}
                        />
                      </div>
                      <span className="hidden text-xs text-muted-foreground sm:block">
                        {relativeTime(contact.lastMessageAt)}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-expanded={isExpanded}
                              aria-label={isExpanded ? t("inbox.collapse") : t("inbox.expand")}
                              onClick={() => setExpandedId(isExpanded ? null : contact.id)}
                            >
                              <span className="t-icon-swap" data-state={isExpanded ? "b" : "a"}>
                                <span className="t-icon" data-icon="a">
                                  <HugeiconsIcon icon={ChevronDownIcon} size={14} strokeWidth={1.75} />
                                </span>
                                <span className="t-icon" data-icon="b">
                                  <HugeiconsIcon icon={ChevronUpIcon} size={14} strokeWidth={1.75} />
                                </span>
                              </span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            {isExpanded ? t("inbox.collapse") : t("inbox.expand")}
                          </TooltipContent>
                        </Tooltip>
                        <Button
                          aria-label={t("inbox.resume")}
                          onClick={() => resume(contact.id)}
                          size="sm"
                          variant="outline"
                        >
                          <HugeiconsIcon icon={CheckIcon} size={14} strokeWidth={1.75} />
                          <span className="hidden sm:inline">{t("inbox.resume")}</span>
                        </Button>
                      </div>
                    </div>
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                      <motion.div
                        key="detail"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={
                          reduce
                            ? { duration: 0 }
                            : {
                                height: { type: "spring", stiffness: 300, damping: 30, mass: 0.8 },
                                opacity: { duration: 0.15, ease: "easeOut" },
                              }
                        }
                        style={{ overflow: "hidden" }}
                      >
                        <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground space-y-2">
                          {editingId === contact.id ? (
                          /* Edit mode */
                          <div className="space-y-3">
                            <label className="block space-y-1">
                              <span className="font-medium text-foreground">{t("inbox.name")}</span>
                              <Input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="h-8 text-xs"
                              />
                            </label>
                            <label className="block space-y-1">
                              <span className="font-medium text-foreground">{t("inbox.notes")}</span>
                              <Input
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                className="h-8 text-xs"
                              />
                            </label>
                            <label className="block space-y-1">
                              <span className="font-medium text-foreground">{t("inbox.status")}</span>
                              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as ContactStatus)}>
                                <SelectTrigger
                                  aria-label={t("inbox.status")} className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="open">{t("inbox.statusOpen")}</SelectItem>
                                  <SelectItem value="waiting_human">{t("inbox.statusWaitingHuman")}</SelectItem>
                                  <SelectItem value="followup_due">{t("inbox.statusFollowupDue")}</SelectItem>
                                  <SelectItem value="closed">{t("inbox.statusClosed")}</SelectItem>
                                </SelectContent>
                              </Select>
                            </label>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => saveEdit(contact.id)}>
                                {t("inbox.save")}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                {t("inbox.cancel")}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          /* View mode */
                          <>
                            {contact.phone && <p>{t("inbox.phone")}: {contact.phone}</p>}
                            {contact.email && <p>{t("inbox.email")}: {contact.email}</p>}
                            <p>{t("inbox.source")}: {contact.source}</p>
                            <p>{t("inbox.status")}: {contact.status}</p>
                            {contact.notes && <p>{t("inbox.notes")}: {contact.notes}</p>}
                            {attrs.length > 0 && (
                              <div className="mt-2">
                                <p className="font-medium text-foreground">{t("inbox.attributes")}:</p>
                                {attrs.map(([k, v]) => (
                                  <p key={k}>{k}: {v}</p>
                                ))}
                              </div>
                            )}
                            <div className="mt-3 flex gap-2 pt-2 border-t border-border">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startEdit(contact)}
                              >
                                <HugeiconsIcon icon={PencilEdit01Icon} size={14} strokeWidth={1.75} />
                                {t("inbox.edit")}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => remove(contact.id)}
                              >
                                <HugeiconsIcon icon={Delete01Icon} size={14} strokeWidth={1.75} />
                                {t("inbox.delete")}
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                );
              })}

              <Pagination
                className="pt-3"
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                page={currentPage}
                pageCount={pageCount}
                pageSize={pageSize}
              />

              {/* Floating bulk action bar — portaled to `main`, absolute to
                  its bottom, centered. Escapes the animated wrappers. */}
              {mainEl &&
                createPortal(
                  <AnimatePresence>
                    {selectedIds.size > 0 && (
                      <div
                        key="bulk-bar-wrap"
                        className="pointer-events-none absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4"
                      >
                        <motion.div
                          key="bulk-bar"
                          initial={{ opacity: 0, y: 24 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 24 }}
                          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 30 }}
                          className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur"
                        >
                      <span className="px-1 text-sm font-medium whitespace-nowrap">
                        {selectedIds.size} {t("inbox.selected")}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => bulkStatus("open")}>
                        <HugeiconsIcon icon={CheckIcon} size={14} strokeWidth={1.75} />
                        {t("inbox.bulkReopen")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => bulkStatus("closed")}>
                        {t("inbox.bulkClose")}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={bulkDelete}>
                        <HugeiconsIcon icon={Delete01Icon} size={14} strokeWidth={1.75} />
                        {t("inbox.bulkDelete")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => exportCSV(contacts.filter((c) => selectedIds.has(c.id)))}
                      >
                        <HugeiconsIcon icon={Download01Icon} size={14} strokeWidth={1.75} />
                        CSV
                      </Button>
                    </motion.div>
                      </div>
                    )}
                  </AnimatePresence>,
                  mainEl,
                )}
              {/* Spacer so floating bar never covers pagination */}
              {selectedIds.size > 0 && <div aria-hidden="true" className="h-20" />}
            </div>
          )}
        </div>
      </Skeleton>
    </PageContainer>
  );
}
