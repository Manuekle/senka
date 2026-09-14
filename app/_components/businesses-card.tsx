"use client";

import { useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Building06Icon,
  CheckIcon,
  Delete02Icon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons";
import { Card } from "./dashboard-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { WorkspaceSubscriptions } from "./workspace-subscriptions";

// The businesses on this installation, where the account lives.
//
// The sidebar switcher covers the two things done daily — see which one you
// are in, move to another. This is the other three: rename one, remove one
// from the list, and read the sentence that says what a business actually
// owns. They belong on Account rather than Settings because a business is not
// a credential: Settings is the keys this install runs on, and those are
// shared by every business in this card.

type Business = {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly primary: boolean;
  readonly logoUpdatedAt: string | null;
  readonly purchaseId?: string;
  readonly access?: "active" | "suspended";
};

export function BusinessesCard() {
  const t = useT();
  const { confirm, dialog } = useConfirmDialog();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);

  const load = useCallback(async () => {
    const result = await fetchJson<{ businesses: Business[] }>("/api/businesses", t);
    if (result.ok) {
      setBusinesses(result.data.businesses);
      setError(null);
      return;
    }
    setError(result.error);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const rename = async (id: string) => {
    const name = draftName.trim();
    if (!name) return;
    setBusy(true);
    const result = await fetchJson("/api/businesses", t, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, name }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditingId(null);
    await load();
  };

  const switchTo = async (id: string) => {
    setBusy(true);
    const result = await fetchJson("/api/businesses", t, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, active: true }),
    });
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }
    // Everything on screen belongs to the business that was active a moment
    // ago. See the note in business-switcher.tsx.
    window.location.reload();
  };

  const forget = async (business: Business) => {
    if (business.active) {
      setError({ messageKey: "business.forgetBlocked" });
      return;
    }
    const ok = await confirm({
      title: t("business.forgetConfirm"),
      description: `${business.name || t("business.unnamed")} — ${t("business.forgetHint")}`,
      confirmLabel: t("business.forget"),
    });
    if (!ok) return;
    setBusy(true);
    const result = await fetchJson(`/api/businesses?id=${encodeURIComponent(business.id)}`, t, {
      method: "DELETE",
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await load();
  };

  return (
    <Card className="mb-4 rounded-[20px] border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
      <div className="flex flex-col">
        <div className="overflow-hidden rounded-[14px] border border-border/50 bg-card p-5 shadow-xs">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
              <HugeiconsIcon icon={Building06Icon} size={16} strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium">{t("business.manageTitle")}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("business.manageDescription")}</p>
            </div>
          </div>
          <ErrorBanner className="mb-3" error={error} onDismiss={() => setError(null)} />
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {businesses.map((business) => (
              <li
                key={business.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 transition-colors",
                  business.active ? "bg-muted/50" : "bg-card hover:bg-muted/30",
                )}
              >
                {business.logoUpdatedAt ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- served by API route */
                  <img
                    src={`/api/businesses/${encodeURIComponent(business.id)}/logo?v=${encodeURIComponent(business.logoUpdatedAt)}`}
                    alt={business.name || t("business.unnamed")}
                    className="size-10 shrink-0 rounded-lg border border-border bg-card object-contain p-0.5"
                  />
                ) : (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold uppercase text-muted-foreground shadow-[var(--shadow-inset)]">
                    {(business.name || t("business.unnamed")).slice(0, 1)}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  {editingId === business.id ? (
                    <Input
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void rename(business.id);
                        }
                        if (event.key === "Escape") setEditingId(null);
                      }}
                      className="h-8 text-sm"
                      autoFocus
                    />
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {business.name || t("business.unnamed")}
                      </span>
                      {business.active ? (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          <HugeiconsIcon icon={CheckIcon} size={9} strokeWidth={2.5} />
                          {t("business.active")}
                        </span>
                      ) : null}
                    </span>
                  )}
                </div>

                <span className="flex shrink-0 items-center gap-1">
                  {editingId === business.id ? (
                    <>
                      <Button size="sm" disabled={busy} onClick={() => void rename(business.id)}>
                        {t("business.renameSave")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        {t("agents.cancel")}
                      </Button>
                    </>
                  ) : (
                    <>
                      {business.active ? null : (
                        <Button size="sm" variant="outline" disabled={busy || business.access === "suspended"} onClick={() => void switchTo(business.id)}>
                          {t("business.switchAction")}
                        </Button>
                      )}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t("business.rename")}
                        onClick={() => {
                          setEditingId(business.id);
                          setDraftName(business.name);
                        }}
                      >
                        <HugeiconsIcon icon={PencilEdit01Icon} size={14} strokeWidth={1.75} />
                      </Button>
                      {/* The original business has no "remove" — every unsuffixed
                          document and file on this install is its own, and a
                          button that hid all of it would be a trap. */}
                      {business.primary || business.active || business.purchaseId ? null : (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t("business.forget")}
                          disabled={busy}
                          onClick={() => void forget(business)}
                        >
                          <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.75} />
                        </Button>
                      )}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <WorkspaceSubscriptions />
        </div>
        {/* Scope note — outside the inner border, matching the skills card footer */}
        <div className="px-2.5 pt-2 pb-0.5">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t("business.scopeNote")}
          </p>
        </div>
      </div>
      {dialog}
    </Card>
  );
}
