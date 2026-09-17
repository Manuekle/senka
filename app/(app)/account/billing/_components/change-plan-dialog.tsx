"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  ArrowLeft01Icon,
  ArrowUp01Icon,
  CheckmarkCircle02Icon,
  InvoiceIcon,
  MinusSignCircleIcon,
} from "@hugeicons/core-free-icons";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import type { BillingState } from "@/lib/billing-store";
import { featuresLost, getPlan, planMove, PLANS, type PlanId } from "@/lib/plans";
import { Spinner } from "@/components/ui/spinner";

const DOWNGRADE_REASONS = ["expensive", "unused", "missing", "switching", "other"] as const;

/**
 * Changing plan, in place.
 *
 * Two steps, and only one of them is ever more than a click: picking an
 * upgrade sends it straight away, picking a downgrade opens a confirm step
 * that says what is being given up, asks why, and wants the plan name typed.
 * See `lib/plans.ts` for why the two directions are not symmetric.
 */
export function ChangePlanDialog({
  state,
  onChanged,
  children,
}: {
  readonly state: BillingState;
  readonly onChanged: (next: BillingState) => void;
  readonly children: React.ReactNode;
}) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [downgradeTo, setDowngradeTo] = useState<PlanId | null>(null);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState<UiError | null>(null);

  const reset = useCallback(() => {
    setDowngradeTo(null);
    setReason("");
    setTyped("");
    setBusy(null);
    setError(null);
  }, []);

  const onOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) reset();
    },
    [reset],
  );

  const submit = useCallback(
    async (plan: PlanId, confirm: boolean) => {
      setBusy(plan);
      setError(null);
      const result = await fetchJson<{ state: BillingState }>("/api/billing/plan", t, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, confirm, reason: reason || undefined }),
      });
      setBusy(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onChanged(result.data.state);
      onOpenChange(false);
    },
    [onChanged, onOpenChange, reason, t],
  );

  /** Paying more is meant to be one click, so an upgrade starts checkout and
   *  falls back to recording the change when Stripe is not configured yet. */
  const upgrade = useCallback(
    async (plan: PlanId) => {
      setBusy(plan);
      setError(null);
      const checkout = await fetchJson<{ url: string }>("/api/billing/checkout", t, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "subscription", plan }),
      });
      if (checkout.ok) {
        window.location.href = checkout.data.url;
        return;
      }
      await submit(plan, false);
    },
    [submit, t],
  );

  const lost = useMemo(
    () => (downgradeTo ? featuresLost(state.plan, downgradeTo) : []),
    [downgradeTo, state.plan],
  );

  const effectiveDate = useMemo(() => {
    const iso = state.periodEnd;
    const date = iso ? new Date(iso) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return date.toLocaleDateString(locale === "es" ? "es-AR" : "en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, [locale, state.periodEnd]);

  const targetName = downgradeTo ? t(getPlan(downgradeTo).nameKey) : "";
  const typedMatches = typed.trim().toLowerCase() === targetName.toLowerCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {downgradeTo === null ? (
          <>
            <DialogHeader>
              <DialogTitle icon={<HugeiconsIcon icon={InvoiceIcon} size={18} strokeWidth={1.75} />}>
                {t("billing.changePlanTitle")}
              </DialogTitle>
              <DialogDescription>{t("billing.changePlanDescription")}</DialogDescription>
            </DialogHeader>

            <ErrorBanner error={error} onDismiss={() => setError(null)} />

            <div className="flex flex-col gap-2">
              {PLANS.map((plan) => {
                const move = planMove(state.plan, plan.id);
                const isCurrent = move === "current";
                return (
                  <div
                    key={plan.id}
                    className={cn(
                      "rounded-xl border p-3.5 transition-colors",
                      isCurrent ? "border-primary/30 bg-muted/40" : "border-border bg-card",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{t(plan.nameKey)}</p>
                          {isCurrent ? (
                            <Badge variant="secondary">{t("billing.currentBadge")}</Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t(plan.summaryKey)}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-medium tabular-nums">
                        ${plan.amount.toLocaleString("en-US")}
                        <span className="text-xs font-normal text-muted-foreground">
                          {plan.interval === "month"
                            ? t("billing.perMonth")
                            : ` ${t("billing.oneTime")}`}
                        </span>
                      </p>
                    </div>

                    {isCurrent ? null : (
                      <div className="mt-3">
                        {plan.interval === "once" ? (
                          <Button asChild size="sm" variant="secondary">
                            <Link href="/pricing">{t("billing.contactSales")}</Link>
                          </Button>
                        ) : move === "upgrade" ? (
                          <Button
                            size="sm"
                            disabled={busy !== null}
                            onClick={() => void upgrade(plan.id)}
                          >
                            {busy === plan.id ? (
                              <Spinner />
                            ) : (
                              <HugeiconsIcon icon={ArrowUp01Icon} size={16} strokeWidth={1.75} />
                            )}
                            {t("billing.upgradeAction", { plan: t(plan.nameKey) })}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy !== null}
                            onClick={() => setDowngradeTo(plan.id)}
                            className="text-muted-foreground"
                          >
                            <HugeiconsIcon
                              icon={MinusSignCircleIcon}
                              size={16}
                              strokeWidth={1.75}
                            />
                            {t("billing.downgradeAction", { plan: t(plan.nameKey) })}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle icon={<HugeiconsIcon icon={InvoiceIcon} size={18} strokeWidth={1.75} />}>
                {t("billing.downgradeTitle", { plan: targetName })}
              </DialogTitle>
              <DialogDescription>
                {t("billing.downgradeEffective", { date: effectiveDate })}
              </DialogDescription>
            </DialogHeader>

            <ErrorBanner error={error} onDismiss={() => setError(null)} />

            {lost.length > 0 ? (
              <div className="rounded-xl border border-border bg-muted/30 p-3.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("billing.downgradeLose")}
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {lost.map((key) => (
                    <li key={key} className="flex items-start gap-2 text-sm">
                      <HugeiconsIcon
                        icon={MinusSignCircleIcon}
                        size={14}
                        strokeWidth={1.75}
                        className="mt-0.5 shrink-0 text-muted-foreground"
                      />
                      {t(key)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">{t("billing.downgradeReasonLabel")}</span>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger
                  aria-label={t("billing.downgradeReasonLabel")}>
                  <SelectValue placeholder={t("billing.downgradeReasonPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {DOWNGRADE_REASONS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {t(`billing.downgradeReason.${id}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">
                {t("billing.downgradeTypeLabel", { plan: targetName })}
              </span>
              <Input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={targetName}
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            <DialogFooter>
              <Button variant="outline" onClick={reset} disabled={busy !== null}>
                {t("billing.dialogBack")}
              </Button>
              <Button
                variant="destructive"
                disabled={!typedMatches || reason === "" || busy !== null}
                onClick={() => void submit(downgradeTo, true)}
              >
                {busy === downgradeTo ? <Spinner /> : null}
                {t("billing.downgradeConfirm")}
              </Button>
            </DialogFooter>
          </>
        )}

        {downgradeTo === null ? (
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("billing.cancel")}</Button>
            </DialogClose>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
