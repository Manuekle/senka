"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@/components/icons/icon";
import { ArrowLeft01Icon, Award05Icon, CrownIcon } from "@hugeicons/core-free-icons";
import { Halo, LightBar } from "@/app/landing/_components/lighting";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import type { LicenseInfo } from "@/lib/license/types";

export type GateState = { loading: true } | { loading: false; allowed: boolean };

/**
 * `next dev` is unlocked.
 *
 * The gate asks what a customer bought, and there is nothing to buy on a
 * laptop: /setup is the page you need *while* wiring an install up, so gating
 * it behind a licence made the one screen that diagnoses a broken local
 * environment the one screen a broken local environment cannot open.
 *
 * Only `next dev`. A self-hosted install builds with NODE_ENV=production — the
 * same reason `app/dev/layout.tsx` gates on this value — so a shipped build
 * still checks the licence, and the bundler folds the branch away there.
 */
const DEV_UNLOCKED = process.env.NODE_ENV !== "production";

/** Whether this install has a valid Enterprise license — the same check
 *  `EnterpriseGate` uses, exported so a page can gate a single section
 *  inline instead of blurring the whole screen behind it. */
export function useEnterpriseAllowed(): GateState {
  const [state, setState] = useState<GateState>(
    DEV_UNLOCKED ? { loading: false, allowed: true } : { loading: true },
  );

  useEffect(() => {
    if (DEV_UNLOCKED) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/license");
        if (!res.ok) {
          if (!cancelled) setState({ loading: false, allowed: false });
          return;
        }
        const info = (await res.json()) as LicenseInfo;
        const allowed = info.status === "valid" && info.payload?.edition === "enterprise";
        if (!cancelled) setState({ loading: false, allowed });
      } catch {
        if (!cancelled) setState({ loading: false, allowed: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function EnterpriseGate({ children }: { readonly children: React.ReactNode }) {
  const router = useRouter();
  const t = useT();
  const gate = useEnterpriseAllowed();

  if (gate.loading) {
    return <>{children}</>;
  }

  if (gate.allowed) {
    return <>{children}</>;
  }

  return (
    // Scoped to the content column, not the viewport. A `fixed inset-0`
    // backdrop also covered the sidebar, which is where the language, theme
    // and sign-out controls live — locking Settings and Setup also locked the
    // only way to switch the app out of Spanish while on either page.
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      {/* Content underneath, dimmed and inert. It no longer carries a blur of
          its own: a flat `blur-[6px]` on the subtree defocused the page's top
          edge as hard as its foot, so the whole column read as a smeared
          screenshot rather than as a room the card is standing in front of.
          The focus now comes off the ramp below. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 select-none overflow-hidden opacity-60"
      >
        {children}
      </div>

      {/* The ramp: sharp at the top, gone by the foot. Stacked backdrops, each
          masked to its own band, so the page loses focus with depth — the same
          construction as the landing's `.lp-veil`, and for the same build
          reason (a hand-written `backdrop-filter` does not survive the
          pipeline, so the blur rides on utility classes). */}
      <div aria-hidden="true" className="gate-haze z-30">
        <span className="backdrop-blur-[2px]" />
        <span className="backdrop-blur-[7px]" />
        <span className="backdrop-blur-[18px]" />
        <span />
      </div>

      <div className="absolute inset-0 z-40 flex items-center justify-center p-4">
        {/* The fixture hangs off the card's own box, so the wrapper is what is
            sized and the card fills it. Order is paint order: the cone lands
            on the card's face (`z-10`), the pool stays under it. */}
        <div className="relative w-full max-w-[420px]">
          <LightBar
            className="inset-x-[14%] top-0 z-10"
            drop="14rem"
            gap="0px"
            intensity={0.9}
          />
          <Halo className="-inset-x-12 -bottom-20 h-52" />

          <div className="relative w-full rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow-float),var(--shadow-inset)] sm:p-7">
            <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[var(--shadow-inset)]">
              <HugeiconsIcon icon={Award05Icon} size={18} strokeWidth={1.75} />
            </div>

            <h2 className="mt-4 text-center font-cooper text-[1.7rem] leading-[1.05] tracking-[-0.02em]">
              {t("gate.title")}
            </h2>
            <p className="mt-2 text-center text-[13px] leading-relaxed text-muted-foreground" style={{ fontFamily: "var(--font-sans)" }}>
              {t("gate.bodyPrefix")}{" "}
              <span className="font-medium text-foreground">{t("gate.bodyPlan")}</span>
              {t("gate.bodyMiddle")}{" "}
              <span className="font-medium text-foreground">{t("gate.bodyEdition")}</span>
              {t("gate.bodySuffix")}
            </p>

            <div className="mt-6 flex flex-col gap-2">
              <Button asChild className="w-full" size="lg">
                <Link href="/pricing">
                  <HugeiconsIcon icon={CrownIcon} size={16} strokeWidth={1.75} />
                  {t("gate.buy")}
                </Link>
              </Button>
              <button
                type="button"
                onClick={() => {
                  if (window.history.length > 1) router.back();
                  else router.push("/dashboard");
                }}
                className="group mx-auto inline-flex items-center gap-1.5 py-1 text-[13px] text-muted-foreground hover:text-foreground"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                <HugeiconsIcon
                  icon={ArrowLeft01Icon}
                  size={14}
                  strokeWidth={1.75}
                  className="transition-transform duration-200 ease-expo-out group-hover:-translate-x-0.5"
                />
                {t("gate.back")}
              </button>
              <p className="text-center text-[11px] text-muted-foreground" style={{ fontFamily: "var(--font-sans)" }}>
                {t("gate.footnote")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
