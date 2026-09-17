"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Add01Icon,
  CheckIcon,
  Copy01Icon,
  Delete01Icon,
  LinkSquare02Icon,
  FileEditIcon,
} from "@hugeicons/core-free-icons";
import { PageContainer } from "../../_components/page-container";
import { Card } from "../../_components/dashboard-card";
import { ErrorBanner } from "@/components/ui/error-banner";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton, SkeletonBar } from "@/components/ai-elements/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast-provider";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { useI18n } from "@/lib/i18n/provider";
import { relativeTime } from "@/lib/format";
import type { Form } from "@/lib/types";

type FormRow = Form & { readonly responseCount: number; readonly completedCount: number };

/** Skeleton for the Forms list — header + button, then a table of rows. */
function FormsSkeleton() {
  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBar className="h-7 w-32" />
          <SkeletonBar className="h-4 w-56" />
        </div>
        <SkeletonBar className="h-9 w-28 rounded-lg" />
      </header>
      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-4 border-b border-border px-4 py-2.5">
          <SkeletonBar className="h-3 w-32" />
          <SkeletonBar className="h-3 w-16" />
          <SkeletonBar className="h-3 w-20" />
          <SkeletonBar className="h-3 w-20" />
          <SkeletonBar className="ml-auto h-3 w-16" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border/50 px-4 py-3 last:border-0">
            <div className="flex-[2] space-y-1.5">
              <SkeletonBar className="h-3.5 w-32" />
              <SkeletonBar className="h-3 w-20" />
            </div>
            <SkeletonBar className="h-5 w-16 rounded-full" />
            <SkeletonBar className="h-3 w-14" />
            <SkeletonBar className="h-3 w-16" />
            <SkeletonBar className="ml-auto h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Table scroller with scroll-aware edge fades — mobile only.
 *
 * At the start only the far edge fades; once scrolled, the passed edge fades
 * in; at the end the far fade lifts. On desktop the table fits without
 * scrolling, so the mask stays off and the page never scrolls sideways.
 */
function FormsTableScroller({
  forms,
  copied,
  onCopy,
  onTogglePublished,
  onRemove,
}: {
  readonly forms: FormRow[];
  readonly copied: string | null;
  readonly onCopy: (form: FormRow) => void;
  readonly onTogglePublished: (form: FormRow) => void;
  readonly onRemove: (form: FormRow) => void;
}) {
  const { locale, t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);

  /* Edge fade, mobile only. At the start only the far edge fades; once
     scrolled, the passed edge fades in; at the end the far fade lifts. */
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
  }, [updateFade, forms]);

  return (
    <div ref={scrollRef} className="x-fade overflow-x-auto scrollbar-hide">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
            <th className="py-2 pr-4 font-medium">{t("forms.columnName")}</th>
            <th className="py-2 pr-4 font-medium">{t("forms.columnStatus")}</th>
            <th className="py-2 pr-4 font-medium">
              {t("forms.columnResponses")}
            </th>
            <th className="py-2 pr-4 font-medium">
              {t("forms.columnUpdated")}
            </th>
            <th className="py-2 text-right font-medium">
              {t("forms.columnActions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {forms.map((form) => (
            <tr key={form.id} className="border-b border-border/50 last:border-b-0">
              <td className="max-w-[240px] py-3 pr-4">
                <Link href={`/forms/${form.id}`} className="font-medium hover:underline">
                  {form.name}
                </Link>
                <p className="text-xs text-muted-foreground">/f/{form.slug}</p>
              </td>
              <td className="py-3 pr-4">
                <button type="button" onClick={() => onTogglePublished(form)}>
                  <StatusBadge
                    status={form.status === "published" ? "active" : "draft"}
                    label={t(`forms.status.${form.status}`)}
                    title={t(
                      form.status === "published" ? "forms.unpublish" : "forms.publish",
                    )}
                  />
                </button>
              </td>
              <td className="py-3 pr-4">
                <span>{t("forms.responses", { count: form.responseCount })}</span>
                {form.responseCount > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("forms.completedOf", {
                      completed: form.completedCount,
                      total: form.responseCount,
                    })}
                  </p>
                ) : null}
              </td>
              <td className="py-3 pr-4 text-xs text-muted-foreground">
                {relativeTime(form.updatedAt, locale)}
              </td>
              <td className="py-3 text-right">
                <div className="flex items-center justify-end gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onCopy(form)}
                        className="inline-flex rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label={t("forms.copyLink")}
                      >
                        <span
                          className="t-icon-swap"
                          data-state={copied === form.id ? "b" : "a"}
                        >
                          <span className="t-icon" data-icon="a">
                            <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.75} />
                          </span>
                          <span className="t-icon" data-icon="b">
                            <HugeiconsIcon icon={CheckIcon} size={14} strokeWidth={1.75} />
                          </span>
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {copied === form.id ? t("forms.linkCopied") : t("forms.copyLink")}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={`/f/${form.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label={t("forms.openPublic")}
                      >
                        <HugeiconsIcon
                          icon={LinkSquare02Icon}
                          size={14}
                          strokeWidth={1.75}
                        />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent>{t("forms.openPublic")}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onRemove(form)}
                        className="inline-flex rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={t("forms.delete")}
                      >
                        <HugeiconsIcon icon={Delete01Icon} size={14} strokeWidth={1.75} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t("forms.delete")}</TooltipContent>
                  </Tooltip>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FormsPage() {
  const { t } = useI18n();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { toast } = useToast();
  const [forms, setForms] = useState<FormRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<UiError | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchJson<{ forms?: FormRow[] }>("/api/forms", t);
    setIsLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setForms(result.data.forms ?? []);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** The link someone pastes into an ad or an email. Built from the browser's
   *  own origin so it is right on localhost, on a preview URL and in
   *  production without a setting to keep in sync. */
  const publicUrl = (slug: string) =>
    typeof window === "undefined" ? `/f/${slug}` : `${window.location.origin}/f/${slug}`;

  const copyLink = async (form: FormRow) => {
    try {
      await navigator.clipboard.writeText(publicUrl(form.slug));
      setCopied(form.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard is permission-gated; the link is visible on the detail page.
    }
  };

  const togglePublished = async (form: FormRow) => {
    const result = await fetchJson(`/api/forms/${form.id}`, t, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: form.status === "published" ? "draft" : "published" }),
    });
    if (!result.ok) setError(result.error);
    else void load();
  };

  const remove = async (form: FormRow) => {
    if (!(await confirm({ title: t("forms.confirmDelete") }))) return;
    const result = await fetchJson(`/api/forms/${form.id}`, t, { method: "DELETE" });
    if (!result.ok) {
      setError(result.error);
      toast({ title: t("common.somethingWentWrong"), description: t("common.somethingWentWrongDescription"), status: "error" });
    } else {
      void load();
      toast({ title: t("common.deleted"), description: t("common.deletedDescription"), status: "success" });
    }
  };

  return (
    <PageContainer maxWidth="max-w-6xl" pattern="grid">
      {confirmDialog}
      <Skeleton
        className="min-h-[400px]"
        isLoading={isLoading}
        skeleton={<FormsSkeleton />}
      >
        <div className="content-enter">
          <ErrorBanner className="mb-6" error={error} onDismiss={() => setError(null)} />

          <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">{t("forms.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("forms.subtitle")}</p>
            </div>
            {/* The two questions in front of the picker are onboarding: they
                choose which template is recommended for an account that has
                never made one. Somebody making their fourth form has already
                answered them, so this jumps to the gallery. */}
            <Link
              href={forms.length > 0 ? "/forms/new?pick=1" : "/forms/new"}
              className="inline-flex self-start items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--shadow-inset)] transition duration-150 hover:border-input hover:bg-accent sm:self-auto"
            >
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
              {t("forms.new")}
            </Link>
          </header>

          {forms.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                  <HugeiconsIcon icon={FileEditIcon} size={20} strokeWidth={1.75} />
                </div>
                <p className="text-sm font-medium">{t("forms.empty")}</p>
                <p className="max-w-xs text-xs text-muted-foreground">{t("forms.emptyHint")}</p>
                <Link
                  href="/forms/new"
                  className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--shadow-inset)] transition duration-150 hover:border-input hover:bg-accent"
                >
                  <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
                  {t("forms.new")}
                </Link>
              </div>
            </Card>
          ) : (
            <Card className="rounded-[20px] border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)] overflow-visible">
              <div className="overflow-hidden rounded-[14px] border border-border/50 bg-card px-5 py-4 shadow-xs">
                <FormsTableScroller
                  forms={forms}
                  copied={copied}
                  onCopy={(form) => void copyLink(form)}
                  onTogglePublished={(form) => void togglePublished(form)}
                  onRemove={(form) => void remove(form)}
                />
              </div>
            </Card>
          )}
        </div>
      </Skeleton>
    </PageContainer>
  );
}
