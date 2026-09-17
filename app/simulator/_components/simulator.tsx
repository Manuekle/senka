"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@/components/icons/icon";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { MarketingShell, PageHeader } from "@/app/landing/_components/marketing-shell";
import { PricingSimulator } from "@/app/pricing/_components/pricing-simulator";
import styles from "@/app/landing/_components/editorial.module.css";
import { Grain } from "@/app/landing/_components/grain";
import { Reveal, Shell } from "@/app/landing/_components/primitives";
import { useT } from "@/lib/i18n/provider";

/**
 * El simulador en su propia página: el `PageHeader` abre con el título y la
 * tarjeta va directa al cuestionario (`intro={false}`). El CTA del resultado
 * lleva a `/pricing#plan-*`, donde cada tarjeta tiene su anchor.
 */
export function Simulator() {
  const t = useT();

  return (
    <MarketingShell>
      <PageHeader
        eyebrow={t("pricing.sim.eyebrow")}
        title={t("pricing.sim.title")}
        titleClassName="font-cooper"
        lede={t("pricing.sim.lede")}
      />

      <section className={`${styles.surface} ${styles.publicBody} py-20 sm:py-24`}>
        <Grain />
        <Shell className={styles.publicBodyContent}>
          <PricingSimulator />

          <Reveal delay={120}>
            <p className="mt-8 text-center">
              {/* La línea crece de izquierda a derecha al hover y se retira de
                  derecha a izquierda al salir: `background-size` 0%→100%
                  anclado abajo-izquierda, solo el texto la lleva para que el
                  icono no subraye. */}
              <Link
                href="/pricing"
                className="group inline-flex min-h-6 items-center gap-1.5 text-sm font-medium text-foreground"
              >
                <HugeiconsIcon
                  icon={ArrowLeft01Icon}
                  size={15}
                  strokeWidth={2}
                  className="transition-transform duration-200 ease-[var(--lp-ease)] group-hover:-translate-x-1"
                />
                <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-[3px] transition-[background-size] duration-300 ease-out group-hover:bg-[length:100%_1px]">
                  {t("pricing.sim.backToPricing")}
                </span>
              </Link>
            </p>
          </Reveal>
        </Shell>
      </section>
    </MarketingShell>
  );
}
