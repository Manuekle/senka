"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  ArrowLeft01Icon,
  CrownIcon,
  Invoice04Icon,
  StripeIcon,
  Calendar01Icon,
  CheckIcon,
} from "@hugeicons/core-free-icons";
import { PageContainer } from "../../../_components/page-container";
import { Card, CardHeader, CardTitle, CardDescription, CardSeparator, CardBody } from "../../../_components/dashboard-card";
import { Button } from "@/components/ui/button";
import { StripeMark } from "@/app/landing/_components/brand-marks";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton, SkeletonBar } from "@/components/ai-elements/skeleton";
import { useI18n } from "@/lib/i18n/provider";
import { fetchJson } from "@/lib/api-error-message";
import type { BillingState } from "@/lib/billing-store";
import { getPlan } from "@/lib/plans";
import type { LicenseInfo } from "@/lib/license/types";
import { ChangePlanDialog } from "./_components/change-plan-dialog";
import { PaymentMethodDialog } from "./_components/payment-method-dialog";

export default function BillingPage() {
  const { locale, t } = useI18n();
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/license")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: LicenseInfo | null) => {
        if (data) setLicense(data);
      })
      .catch(() => null);
  }, []);

  const loadBilling = useCallback(async () => {
    const result = await fetchJson<BillingState>("/api/billing/plan", t);
    if (result.ok) setBilling(result.data);
    setLoading(false);
  }, [t]);

  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  const cancelPending = useCallback(async () => {
    const result = await fetchJson<{ state: BillingState }>("/api/billing/plan", t, {
      method: "DELETE",
    });
    if (result.ok) setBilling(result.data.state);
  }, [t]);

  const pendingDate = useMemo(() => {
    const iso = billing?.pendingChange?.effectiveAt;
    if (!iso) return "";
    return new Date(iso).toLocaleDateString(locale === "es" ? "es-AR" : "en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, [billing?.pendingChange?.effectiveAt, locale]);

  // The plan the customer is on is what `Change plan` moves, so that is what
  // this card names. A verified Enterprise licence still wins: it is the one
  // edition proved by something stronger than a local file.
  const edition =
    license?.payload?.edition ??
    (billing && billing.plan !== "none"
      ? t(getPlan(billing.plan).nameKey)
      : billing || license
        ? t("billing.noPlan")
        : "—");
  const company = license?.payload?.company ?? "—";
  const maintenanceUntil = license?.payload?.maintenanceUntil
    ? new Date(license.payload.maintenanceUntil).toLocaleDateString(locale === "es" ? "es-AR" : "en-US")
    : "—";

  return (
    <PageContainer maxWidth="max-w-4xl" pattern="grid">
      <Skeleton className="min-h-[500px]" isLoading={loading} skeleton={<BillingSkeleton />}>
      <div className="content-enter">
        <header className="mb-8">
          <Link
            href="/account"
            className="group mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon
              icon={ArrowLeft01Icon}
              size={14}
              strokeWidth={1.75}
              className="transition-transform duration-200 ease-expo-out group-hover:-translate-x-0.5"
            />
            {t("billing.back")}
          </Link>
          <h1 className="text-2xl font-semibold">{t("billing.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("billing.subtitle")}
          </p>
        </header>

        {billing?.paymentPastDue ? (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 px-5 py-4">
            <HugeiconsIcon
              icon={Calendar01Icon}
              size={18}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-destructive"
            />
            <div>
              <p className="text-sm font-medium text-destructive">{t("billing.pastDueTitle")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("billing.pastDueBody")}</p>
            </div>
          </div>
        ) : null}

        <Card className="mb-4">
          <CardHeader>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
              <HugeiconsIcon icon={CrownIcon} size={16} strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle>{t("billing.planTitle")}</CardTitle>
              <CardDescription>
                {license || billing
                  ? `${edition.charAt(0).toUpperCase() + edition.slice(1)}${company === "—" ? "" : ` · ${company}`}`
                  : t("billing.loading")}
              </CardDescription>
            </div>
            <StatusBadge
              className="hidden shrink-0 sm:inline-flex"
              status={license?.status === "valid" && license.maintenanceActive ? "active" : "in-review"}
              label={license?.status === "valid" && license.maintenanceActive ? t("billing.statusActive") : t("billing.statusReview")}
            />
          </CardHeader>
          <CardSeparator />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <HugeiconsIcon icon={Calendar01Icon} size={12} strokeWidth={1.75} />
                  {t("billing.maintenanceUntil")}
                </p>
                <p className="mt-1 text-sm font-medium">{maintenanceUntil}</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <HugeiconsIcon icon={CheckIcon} size={12} strokeWidth={1.75} />
                  {t("billing.statusLabel")}
                </p>
                <p className="mt-1 text-sm font-medium">
                  {license?.status === "valid"
                      ? t("billing.licenseValid")
                      : license?.status === "missing"
                        ? t("billing.licenseMissing")
                        : t("billing.licenseInvalid")}
                </p>
              </div>
            </div>
            {billing?.pendingChange ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium">{t("billing.pendingTitle")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("billing.pendingBody", {
                      plan: t(getPlan(billing.pendingChange.to).nameKey),
                      date: pendingDate,
                    })}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => void cancelPending()}>
                  {t("billing.pendingKeep", {
                    plan: billing.plan === "none" ? "—" : t(getPlan(billing.plan).nameKey),
                  })}
                </Button>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {billing ? (
                <ChangePlanDialog state={billing} onChanged={setBilling}>
                  <Button size="sm">{t("billing.changePlan")}</Button>
                </ChangePlanDialog>
              ) : (
                <Button size="sm" disabled>
                  {t("billing.changePlan")}
                </Button>
              )}
              <Button asChild variant="secondary" size="sm">
                <Link href="/pricing">{t("billing.viewPricing")}</Link>
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground shadow-[var(--shadow-inset)]">
              <HugeiconsIcon icon={StripeIcon} size={16} strokeWidth={1.75} className="text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle>{t("billing.paymentTitle")}</CardTitle>
              <CardDescription>{t("billing.paymentDescription")}</CardDescription>
            </div>
          </CardHeader>
          <CardSeparator />
          <CardBody>
            <p className="text-sm text-muted-foreground">
              {billing?.hasPaymentMethod ? t("billing.paymentOnFile") : t("billing.paymentEmpty")}
            </p>
            <PaymentMethodDialog>
              {/* Same recipe as the Connect buttons on /numbers — outline
                  surface with a soft brand tint at rest, stronger on hover.
                  Stripe violet here, with the Stripe brand mark. */}
              <Button
                variant="outline"
                className="mt-3 border-[#635BFF]/50 bg-[#635BFF]/10 text-[#4338CA] hover:border-[#635BFF]/70 hover:bg-[#635BFF]/20 hover:text-[#4338CA] dark:text-[#A5A3FF] dark:hover:text-[#A5A3FF]"
              >
                <StripeMark size={16} />
                {t("billing.paymentAdd")}
              </Button>
            </PaymentMethodDialog>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
              <HugeiconsIcon icon={Invoice04Icon} size={16} strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle>{t("billing.invoicesTitle")}</CardTitle>
              <CardDescription>{t("billing.invoicesDescription")}</CardDescription>
            </div>
          </CardHeader>
          <CardSeparator />
          <CardBody>
            <p className="py-6 text-center text-sm text-muted-foreground">{t("billing.invoicesEmpty")}</p>
          </CardBody>
        </Card>
      </div>
      </Skeleton>
    </PageContainer>
  );
}

function BillingSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonBar className="h-3 w-16" />
      <div className="mb-4 space-y-2">
        <SkeletonBar className="h-7 w-32" />
        <SkeletonBar className="h-4 w-64" />
      </div>

      {/* Plan card */}
      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-3 p-5">
          <SkeletonBar className="size-9 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBar className="h-4 w-28" />
            <SkeletonBar className="h-3 w-40" />
          </div>
          <SkeletonBar className="hidden h-5 w-16 rounded-full sm:block" />
        </div>
        <div className="h-px bg-border" />
        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <SkeletonBar className="h-16 rounded-xl" />
            <SkeletonBar className="h-16 rounded-xl" />
          </div>
          <div className="flex gap-2">
            <SkeletonBar className="h-9 w-28 rounded-lg" />
            <SkeletonBar className="h-9 w-32 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Payment method card */}
      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-3 p-5">
          <SkeletonBar className="size-9 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBar className="h-4 w-32" />
            <SkeletonBar className="h-3 w-48" />
          </div>
        </div>
        <div className="h-px bg-border" />
        <div className="space-y-3 p-5">
          <SkeletonBar className="h-3 w-40" />
          <SkeletonBar className="h-8 w-32 rounded-md" />
        </div>
      </div>

      {/* Invoices card */}
      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-3 p-5">
          <SkeletonBar className="size-9 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBar className="h-4 w-28" />
            <SkeletonBar className="h-3 w-40" />
          </div>
        </div>
        <div className="h-px bg-border" />
        <div className="p-5">
          <SkeletonBar className="h-4 w-full" />
        </div>
      </div>
    </div>
  );
}
