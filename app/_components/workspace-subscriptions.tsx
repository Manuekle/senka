"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { useI18n } from "@/lib/i18n/provider";
import { usePolling } from "@/lib/use-polling";

type Purchase = { id: string; name: string; workspaceId: string; status: string; cancelAtPeriodEnd?: boolean; periodEnd?: number };

export function WorkspaceSubscriptions() {
  const { t, locale } = useI18n();
  const { confirm, dialog } = useConfirmDialog();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [error, setError] = useState<UiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update(); document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const load = useCallback(async () => {
    const result = await fetchJson<{ purchases: Purchase[] }>("/api/billing/workspaces", t);
    if (result.ok) { setPurchases(result.data.purchases); setError(null); }
    else setError(result.error);
  }, [t]);
  usePolling(load, 5000, visible && !busy);

  const cancel = async (purchase: Purchase) => {
    if (!(await confirm({ title: t("workspace.cancelTitle"), description: t("workspace.cancelDescription", { name: purchase.name }), confirmLabel: t("workspace.cancel") }))) return;
    setBusy(true);
    const result = await fetchJson(`/api/billing/workspaces?id=${encodeURIComponent(purchase.id)}`, t, { method: "DELETE" });
    setBusy(false);
    if (!result.ok) setError(result.error); else await load();
  };
  const open = async (id: string) => {
    setBusy(true);
    const result = await fetchJson("/api/businesses", t, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, active: true }) });
    if (!result.ok) { setError(result.error); setBusy(false); } else window.location.assign(new URL("/setup", window.location.origin));
  };
  const updatePayment = async (id: string) => {
    setBusy(true);
    const result = await fetchJson<{ url: string }>("/api/billing/workspaces", t, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "payment_method", id }) });
    if (!result.ok) { setError(result.error); setBusy(false); } else window.location.assign(result.data.url);
  };

  return <section className="mt-4 space-y-3" aria-labelledby="workspace-subscriptions-title">
    <h4 id="workspace-subscriptions-title" className="text-sm font-medium">{t("workspace.subscriptions")}</h4>
    <p className="text-xs text-muted-foreground">{t("workspace.included")}</p>
    <ErrorBanner error={error} onRetry={() => void load()} />
    <ul className="divide-y divide-border">
      {purchases.map((purchase) => <li key={purchase.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0"><p className="text-sm font-medium">{purchase.name}</p><p className="text-xs text-muted-foreground">{t(`workspace.status.${purchase.status}`)}{purchase.cancelAtPeriodEnd && purchase.periodEnd ? ` · ${t("workspace.ends", { date: new Date(purchase.periodEnd * 1000).toLocaleDateString(locale) })}` : ""}</p></div>
        <div className="flex gap-2">
          {purchase.status === "past_due" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void updatePayment(purchase.id)}>{t("workspace.updatePayment")}</Button>}
          {purchase.status === "active" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void open(purchase.workspaceId)}>{t("workspace.open")}</Button>}
          {["active", "past_due"].includes(purchase.status) && !purchase.cancelAtPeriodEnd && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void cancel(purchase)}>{t("workspace.cancel")}</Button>}
        </div>
      </li>)}
    </ul>
    {dialog}
  </section>;
}
