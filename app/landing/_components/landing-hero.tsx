"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth/use-session";
import { useT } from "@/lib/i18n/provider";
import { ChatScreen } from "./deferred-screens";
import { YCombinatorMark } from "./brand-marks";
import { BrandGlow } from "./lighting";
import styles from "./editorial.module.css";
import { Grain } from "./grain";
import { Reveal, ScreenFrame, Shell } from "./primitives";
import { SignupDialog } from "./signup-dialog";

/**
 * The first screen: one claim, one screenshot, two ways in.
 *
 * The composition is Linear's, because it is the right one for a product whose
 * argument is visual — headline pinned to the left rail rather than centred,
 * the product immediately underneath and bleeding off the fold, so the page
 * has already shown you what it is before you decide whether to scroll.
 */
export function LandingHero() {
  const t = useT();
  const session = useSession();

  return (
    <section className={`${styles.surface} ${styles.hero} relative overflow-hidden pt-32 pb-16 sm:pt-40 sm:pb-24`}>
      {/* Texture belongs to the light, behind the copy and fading before the demo. */}
      <div aria-hidden="true" className={styles.heroAtmosphere}>
        <div className={styles.heroLight} />
        <Grain variant="hero" />
      </div>

      <Shell className="relative">
        <Reveal>
          {/* The announcement row. The container takes the app's card shape —
              a 12px squircle, `--card` surface, hairline border — and the
              only pill on it is the app's own `Badge`, which is round by
              design. A full-pill container here was the shape the product
              never uses. */}
          <Link
            // `#agentes` signed out, and that is a correctness fix rather than
            // a preference: `/agents` is behind the session gate, so the one
            // announcement on the page sent every visitor who clicked it to
            // the login wall. The section it is announcing is on this page,
            // three screens down. Signed in, the real thing is better.
            href={session.signedIn ? "/agents" : "#agentes"}
            // Nothing to prefetch for a hash, and for the app route the click
            // is deliberate — a marketing page should not pull the product's
            // JS down behind the visitor's back.
            prefetch={false}
            className="group inline-flex items-center gap-2.5 rounded-xl border border-border bg-card py-1.5 pr-3 pl-1.5 text-xs shadow-[var(--shadow-soft)] transition-[border-color,box-shadow] duration-200 hover:border-input hover:shadow-[var(--shadow-elevated)]"
          >
            <Badge className="px-2 py-0.5 text-[10px]">{t("landing.hero.badge")}</Badge>
            <span className="text-muted-foreground">{t("landing.hero.announcement")}</span>
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={13}
              strokeWidth={2}
              className="text-muted-foreground transition-transform duration-200 ease-[var(--lp-ease)] group-hover:translate-x-0.5"
            />
          </Link>
        </Reveal>

        <Reveal delay={80}>
          <div className="mt-5 inline-flex max-w-full items-center gap-2.5 text-[12px] text-muted-foreground">
            <BrandGlow colour="#FB651E"><YCombinatorMark size={22} /></BrandGlow>
            <span>{t("landing.hero.ycApplication")}</span>
          </div>
        </Reveal>

        {/* The LCP heading is visible in the server HTML, without waiting for
            hydration, per-word blur animations or a motion preference check. */}
        <h1
          className="mt-8 max-w-[24ch] text-balance font-heading font-semibold font-cooper text-[clamp(2.75rem,6.6vw,4.25rem)] leading-[1.25] tracking-[-0.03em] overflow-visible pb-[0.12em]"
        >
          {t("landing.hero.title")}
        </h1>

        <Reveal delay={120}>
          <p className="mt-7 max-w-[52ch] text-[17px] leading-relaxed tracking-[-0.03em] text-muted-foreground text-wrap-balance">
            {t("landing.hero.subtitle")}
          </p>
        </Reveal>

        <Reveal delay={180}>
          <div className="relative mt-9 flex flex-wrap items-center gap-3">
            {/* Signed in, the pair is "open the app" and nothing else to
                explain; signed out, the primary is the door and the secondary
                is the pricing — the only other page a visitor can reach. */}
            {session.signedIn ? (
              <Button asChild size="lg">
                <Link href="/dashboard">{t("landing.cta.openApp")}</Link>
              </Button>
            ) : (
              <SignupDialog autoOpenAfterMs={5000}>
                <Button size="lg">
                  {session.claimed ? t("landing.cta.signIn") : t("landing.cta.start")}
                </Button>
              </SignupDialog>
            )}
            <Button asChild size="lg" variant="outline">
              <Link href={session.signedIn ? "/settings" : "/pricing"} prefetch={false}>
                {session.signedIn ? t("landing.cta.settings") : t("landing.cta.pricing")}
              </Link>
            </Button>
            <span className="ml-1 text-[13px] text-muted-foreground">{t("landing.hero.noAccount")}</span>
          </div>
        </Reveal>

      </Shell>

      {/* The product. It sits on a wider rail than the copy and runs past the
          bottom of the fold on purpose — a screen you can see all of is a
          screen you have finished looking at. The veil at its foot does the
          rest: the page ends by going out of focus rather than by stopping. */}
      <div className="relative mx-auto mt-16 w-full max-w-[1240px] px-6 sm:mt-20 sm:px-8">
        {/* There were four hairline corner brackets standing off this frame.
            The argument was that a beam needs something to be aimed at; what
            they were on the page is four small square grids in the corners of
            a window that already has a bezel, a border and an inset lip — a
            fifth kind of edge on a composition that had four, and the only
            piece of the rig that was not light. They read as crop marks. The
            beam has the window to land on. */}
        <Reveal delay={240} lift={false}>
          {/* Brighter than the four screens below it. Every other frame on the
              page arrives after something above it has already been lit; this
              one arrives first, and a first screenshot lit at the same level
              as the fifth is a page that opens at its own average. */}
          <ScreenFrame
            hint={t("landing.hero.frameHint")}
            label="Chat"
            litIntensity={1.25}
            overlays={null}
            url="senka.ai"
          >
            <ChatScreen />
          </ScreenFrame>
        </Reveal>
      </div>

      {/* There was a second, page-wide floor pool here and it had to go. The
          hero carries `overflow: hidden` — that is what keeps its grid and its
          beam off the band below — and the pool sat 160px past the section's
          foot, so the clip fell through the middle of it and drew a hard bright
          line the full width of the page exactly on the boundary.

          Nothing is lost: the frame brings its own pool, sized to the frame and
          ending inside the section. Two floors under one object was a duplicate
          before it was a seam. */}
    </section>
  );
}
