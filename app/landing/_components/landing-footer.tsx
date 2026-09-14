"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { SenkaMark } from "@/components/icons/senka-mark";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth/use-session";
import { useI18n, useT } from "@/lib/i18n/provider";
import { LEGAL_LINKS } from "@/lib/legal";
import { PrivacyPreferencesButton } from "@/components/privacy-consent";
import { InstagramMark, LinkedInMark, MetaMark, TikTokMark, WhatsAppMark, YCombinatorMark, YouTubeMark } from "./brand-marks";
import { LINKS, PAGES, Wordmark } from "./landing-header";
import { BrandGlow, Halo, LightBar } from "./lighting";
import { Shell } from "./primitives";
import styles from "./editorial.module.css";
import { Grain } from "./grain";

/**
 * Public pages only.
 *
 * Every column here used to be product routes — Panel, Bandeja, CRM, Leads,
 * Conexiones, Cuenta, twenty of them — and every one is behind the login. A
 * signed-out visitor, which is every visitor a footer is written for, clicked
 * any of them and landed on `/login?next=…`. That is not a sitemap, it is
 * twenty ways to be bounced, and it read as a template precisely because a
 * template is the only thing that would list a product's internal navigation
 * to strangers.
 *
 * What is left is what a stranger can actually open: the sections of the page
 * they are on, and the three pages that are not gated. The section list is
 * imported from the header rather than retyped, so the bar at the top and the
 * column at the bottom cannot disagree about what this page contains.
 */
const RESOURCES = [
  ...PAGES.filter((page) => page.href !== "/team"),
] as const;

const COMPANY = PAGES.filter((page) => page.href === "/team");

const SOCIAL_LINKS = [
  { colour: "#FC01D8", className: undefined, href: "#", label: "Instagram", mark: InstagramMark },
  { colour: "#0A66C2", className: undefined, href: "#", label: "LinkedIn", mark: LinkedInMark },
  { colour: "#ff0000", className: undefined, href: "#", label: "YouTube", mark: YouTubeMark },
  { colour: "#25F4EE", className: "tiktok-glow", href: "#", label: "TikTok", mark: TikTokMark },
] as const;

/**
 * The three channels, arriving.
 *
 * The section's claim, drawn: senka at the centre of three rings and the
 * places people already write to you sitting on them. It is the one
 * illustration on the marketing surface and it is made entirely of pieces that
 * were already here — the mark, `BrandGlow`, and the plate every card in the
 * product uses — so it cannot drift away from the rest of the page.
 *
 * Rings, and hairline ones. A filled ripple would be the heaviest object in
 * the footer, competing with the sentence it sits beside; an outline is a
 * diagram. They are set at 42% radius rather than round, which is the squircle
 * the whole interface is drawn in.
 *
 * It bleeds off the panel's right edge on purpose. Centred in its own half it
 * is a picture in a box; running off it is a thing the panel is a window onto,
 * which is the same argument the screenshots make further up the page.
 *
 * `aria-hidden`, and below `lg` it is not rendered at all: at that width the
 * copy takes the whole panel and a 20rem illustration underneath it is a
 * second screenful of decoration on a phone.
 */
/** The four-point star, once. Concave sides pulled tight to the centre, which
 *  is what makes the arms read as spikes of light rather than as a diamond. */
const SPARK_PATH =
  "M12 0C12.3 6.9 17.1 11.7 24 12C17.1 12.3 12.3 17.1 12 24C11.7 17.1 6.9 12.3 0 12C6.9 11.7 11.7 6.9 12 0Z";

/**
 * The sparks, across the whole panel.
 *
 * Hand-placed, not generated. `Math.random()` in a component that renders on
 * the server and again on the client produces two different fields and a
 * hydration mismatch — and even seeded, a random scatter clumps, which is the
 * one thing a field like this must not do.
 *
 * Weighted, not even: dense across the right-hand half where the orbit is,
 * thinning towards the copy. They sit behind the content, so a stray one under
 * a word is not a legibility problem, but a star burning through the middle of
 * a sentence is still the reader wondering what it means.
 *
 * Sizes carry the depth. The 13-14px ones are near and flare to full; the 5-6px
 * ones are far and barely arrive.
 */
const SPARKS = [
  { dur: 4.3, size: 7, x: 4, y: 66 },
  { dur: 6.1, size: 5, x: 11, y: 88 },
  { dur: 5.2, size: 6, x: 19, y: 24 },
  { dur: 7.4, size: 5, x: 27, y: 91 },
  { dur: 4.9, size: 8, x: 33, y: 12 },
  { dur: 6.7, size: 5, x: 39, y: 74 },
  { dur: 5.6, size: 6, x: 44, y: 33 },
  { dur: 4.1, size: 9, x: 48, y: 84 },
  { dur: 7.9, size: 6, x: 53, y: 17 },
  { dur: 5.9, size: 11, x: 57, y: 52 },
  { dur: 4.6, size: 7, x: 61, y: 8 },
  { dur: 6.4, size: 8, x: 63, y: 90 },
  { dur: 5.4, size: 6, x: 67, y: 30 },
  { dur: 7.1, size: 13, x: 70, y: 66 },
  { dur: 4.4, size: 7, x: 73, y: 14 },
  { dur: 6.9, size: 9, x: 76, y: 44 },
  { dur: 5.1, size: 6, x: 79, y: 82 },
  { dur: 6.2, size: 11, x: 82, y: 22 },
  { dur: 4.7, size: 7, x: 85, y: 58 },
  { dur: 7.6, size: 8, x: 88, y: 36 },
  { dur: 5.8, size: 6, x: 90, y: 88 },
  { dur: 4.2, size: 14, x: 93, y: 12 },
  { dur: 6.6, size: 7, x: 95, y: 70 },
  { dur: 5.3, size: 9, x: 97, y: 47 },
  { dur: 7.2, size: 6, x: 99, y: 26 },
  { dur: 4.8, size: 8, x: 86, y: 6 },
] as const;

function SparkField() {
  return (
    <>
      {SPARKS.map((spark) => (
        <span
          className="lp-spark"
          key={`${spark.x}-${spark.y}`}
          style={
            {
              /* A head start, so nobody flares on the first frame with anybody
                 else. Derived from the position rather than stored: two more
                 columns in the table would be two more things to keep unique
                 by hand, and arithmetic cannot collide the way a typed number
                 can. */
              animationDelay: `${-((spark.x * 13 + spark.y * 7) % 79) / 10}s`,
              height: `${spark.size}px`,
              left: `${spark.x}%`,
              top: `${spark.y}%`,
              width: `${spark.size}px`,
              "--lp-spark-dur": `${spark.dur}s`,
              /* Near ones burn; far ones only just arrive. */
              "--lp-spark-peak": spark.size >= 11 ? 1 : spark.size >= 8 ? 0.72 : 0.45,
            } as CSSProperties
          }
        >
          <svg fill="currentColor" viewBox="0 0 24 24">
            <path d={SPARK_PATH} />
          </svg>
        </span>
      ))}
    </>
  );
}

function ChannelArc() {
  /* Three concentric circles about one centre, each with an arm turning at its
     own rate and a channel tile riding it. Written as geometry — one centre,
     three diameters, three periods — rather than as offsets, because a tile
     that is not on its ring is the one thing this drawing cannot survive.

     The periods are coprime-ish on purpose: 45, 61 and 79 seconds never line
     the three up again inside a session, so the group never resolves into the
     spoke that three equal periods would draw. */
  const CENTRE = 11;

  const RINGS = [
    { colour: "#25D366", d: 9, from: 0.58, mark: <WhatsAppMark size={22} />, secs: 45 },
    { colour: "#FC01D8", d: 15, from: 0.14, mark: <InstagramMark size={22} />, secs: 61 },
    { colour: "#0081FB", d: 21, from: 0.79, mark: <MetaMark size={24} />, secs: 79 },
  ] as const;

  return (
    <div aria-hidden="true" className="pointer-events-none relative hidden size-[22rem] lg:block">
      {RINGS.map((ring) => {
        /* A negative delay is a head start: the animation begins mid-cycle, so
           `from` is a fraction of a lap and the three tiles never leave the
           gate together. */
        const timing = {
          animationDelay: `${-ring.secs * ring.from}s`,
          "--lp-orbit-dur": `${ring.secs}s`,
        } as CSSProperties;
        const box = {
          height: `${ring.d}rem`,
          left: `${CENTRE - ring.d / 2}rem`,
          top: `${CENTRE - ring.d / 2}rem`,
          width: `${ring.d}rem`,
        };

        return (
          <span key={ring.colour}>
            <span className="lp-arc" style={box} />
            <span className="lp-orbit" style={{ ...box, ...timing }}>
              <span className="lp-orbit-tile">
                {/* The arm turns the tile with it; this turns it back, so a
                    logo three quarters of the way round is not upside down. */}
                <span className="lp-orbit-upright" style={timing}>
                  <span className="lp-arc-tile flex size-11">
                    <BrandGlow colour={ring.colour} intensity={0.8}>
                      {ring.mark}
                    </BrandGlow>
                  </span>
                </span>
              </span>
            </span>
          </span>
        );
      })}

      {/* The centre the rings are about, and the only lit object in the group:
          a pool under it, and the mark milled rather than flat, so it reads as
          the thing being orbited instead of a fourth logo. */}
      <span
        className="absolute flex size-16 items-center justify-center"
        style={{ left: `${CENTRE - 2}rem`, top: `${CENTRE - 2}rem` }}
      >
        <Halo className="-inset-16" />
        <SenkaMark className="relative h-10 w-auto" metal />
      </span>
    </div>
  );
}

/**
 * The closing call to action, in the footer rather than in a section above it.
 *
 * It used to be `ClosingSection`: a full-bleed band with a beam down its
 * centre, immediately above a footer that then said nothing. Two closing
 * gestures in a row, and the second one was the weaker — which is why the
 * footer read as generic no matter what went into it. Folded into the panel it
 * is one ending, and every marketing page gets it instead of only the landing.
 *
 * The fixture is the same tube over the same kind of card as everywhere else,
 * and the bolt is the same `GlowMark` it was in the section: nothing about the
 * composition was wrong, it was in the wrong place.
 */
function ClosingPanel({ editorial }: { readonly editorial: boolean }) {
  const t = useT();
  const session = useSession();

  return (
    <div className={`lp-cta px-6 py-8 sm:px-12 sm:py-14 ${editorial ? styles.surface : ""}`}>
      {editorial ? <Grain variant="closing" /> : null}
      <LightBar className="inset-x-[34%] top-0" drop="20rem" intensity={0.9} />

      {/* The field belongs to the panel, not to the orbit. Inside the arc it
          was a 22rem square of stars with three quarters of the card dark
          around it — a lit patch rather than lit air. Across the whole panel,
          weighted towards the side something is moving, it is the room the
          orbit is turning in. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 block">
        <SparkField />
      </span>

      {/* The pool the orbit sits in. Wide enough to reach past the outer ring:
          a halo that stops inside the thing it is lighting is a disc. */}
      <Halo className="-right-24 -bottom-24 h-[34rem] w-[34rem]" />

      {/* No bolt over the heading. It was a `GlowMark` in a recessed plate and
          it was the right object in the wrong room: in the old full-bleed
          closing band it was the one lit thing on an empty page, and inside a
          panel that already has a fixture above it and a lit orbit beside it
          it is a third light source in a box the size of a postcard. The
          heading leads. */}
      <div className="relative flex items-center justify-between gap-8">
        <div className="max-w-[46ch]">
          <h2 className="max-w-[18ch] text-balance font-cooper font-heading font-semibold text-[clamp(1.875rem,3.4vw,2.75rem)] text-foreground leading-[1.04] tracking-[-0.03em]">
            {t("landing.closing.title")}
          </h2>
          <p className="mt-4 max-w-[44ch] text-[15px] leading-relaxed text-muted-foreground">
            {t("landing.closing.body")}
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button asChild className="w-full justify-center sm:w-auto" size="lg">
              <Link href={session.signedIn ? "/dashboard" : "/login"} prefetch={!session.signedIn}>
                {session.signedIn
                  ? t("landing.cta.openApp")
                  : session.claimed
                    ? t("landing.cta.signIn")
                    : t("landing.cta.install")}
              </Link>
            </Button>
            <Button asChild className="w-full justify-center sm:w-auto" size="lg" variant="outline">
              <Link href="/pricing">{t("landing.cta.pricing")}</Link>
            </Button>
          </div>
        </div>

        {/* Pushed past the panel's right edge; `overflow: hidden` on `.lp-cta`
            is what crops it. */}
        <div className="-mr-16 shrink-0">
          <ChannelArc />
        </div>
      </div>
    </div>
  );
}

/**
 * The page's last surface.
 *
 * It used to be a slab: five equal columns of links, a 12px sentence and two
 * toggles, on flat page colour. Every other section on this page had been
 * given a light and a reason to be looked at, and then the page ended by
 * simply running out — which is what "generic" actually means here. Three
 * things changed, and none of them is decoration:
 *
 * The top edge is lit. `.lp-filament` is the divider the channel band already
 * uses: a hairline with the source visible on it. This is the one rule on the
 * page that is also the end of the page, and it is directly under the closing
 * block's beam, so the light carries over the boundary instead of stopping at
 * it.
 *
 * The brand column says something. `builtOn` — Eve, Next.js and Postgres, who
 * operates it, and the sentence about conversations not leaving your machine —
 * was set at 12px in the bottom bar next to a theme toggle, which is where a
 * page puts text it does not expect anyone to read. It is the most specific
 * thing this product can say about itself and it is the reason a self-hosting
 * reader is on the page at all, so it moved up beside the wordmark, at a size
 * you can read, under a label that says what it is.
 *
 * And the bottom bar became a bottom bar: a copyright line, the two legal
 * links a reader goes to a footer to find, and the preferences.
 */
export function LandingFooter({ editorial = false }: { readonly editorial?: boolean }) {
  const t = useT();
  const { locale } = useI18n();
  const pathname = usePathname();
  const year = new Date().getFullYear();

  /* Section links are bare fragments on the landing and full paths anywhere
     else — pricing, the guide and the legal pages share this footer, and a
     bare `#agentes` there points at nothing. Same rule the header follows. */
  const onLanding = pathname === "/";

  return (
    /* Full width and no inset. The inset was there to show page ground around
       a panel; with the panel gone there is no edge to hold off from, and
       stopping the wordmark's crop sixteen pixels short of the viewport is a
       margin nobody asked for. */
    <footer className="lp-footer pt-8">
      <Shell>
        <ClosingPanel editorial={editorial} />
      </Shell>

      <Shell className="relative z-[1] pt-12 lg:pt-20">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-12 lg:gap-x-8 lg:gap-y-12">
          {/* Wider than a link column and deliberately so: it carries a
              paragraph, and a 24ch measure next to two lists of one-word links
              is a column of confetti. Full width on mobile so the four link
              columns below it can sit two-up instead of stacking five tall. */}
          <div className="col-span-2 lg:col-span-4 lg:pr-8">
            <Wordmark />
            <p className="mt-4 max-w-[30ch] text-[13px] leading-relaxed text-muted-foreground">
              {t("landing.footer.tagline")}
            </p>

            <p className="lp-eyebrow mt-6 lg:mt-8">{t("landing.footer.stackLabel")}</p>
            <p className="mt-2.5 max-w-[42ch] text-[13px] leading-relaxed text-muted-foreground">
              {t("landing.footer.builtOn")}
            </p>

            <div className="mt-6 flex items-center gap-2.5 text-[12px] text-muted-foreground">
              <BrandGlow colour="#FB651E"><YCombinatorMark size={22} /></BrandGlow>
              <span>{t("landing.footer.ycApplication")}</span>
            </div>

            <div className="mt-6">
              <p className="lp-eyebrow">{t("landing.footer.socialLabel")}</p>
              <nav aria-label={t("landing.footer.socialLabel")} className="mt-3 flex items-center gap-4">
                {SOCIAL_LINKS.map(({ colour, className, href, label, mark: Mark }) => (
                  <a
                    aria-label={label}
                    className="lp-focus flex size-6 items-center justify-center transition-transform hover:-translate-y-0.5"
                    href={href}
                    key={label}
                    title={label}
                  >
                    <BrandGlow className={className} colour={colour} intensity={className === "tiktok-glow" ? 0.42 : 1}><Mark size={16} /></BrandGlow>
                  </a>
                ))}
              </nav>
            </div>
          </div>

          <div className="lg:col-span-2">
            <h3 className="font-medium text-[13px] text-foreground">
              {t("landing.footer.colSections")}
            </h3>
            <ul className="mt-4 space-y-2.5">
              {LINKS.map((link) => (
                <li key={link.id}>
                  <a
                    className="lp-focus text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
                    href={onLanding ? `#${link.id}` : `/#${link.id}`}
                  >
                    {t(link.labelKey)}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h3 className="font-medium text-[13px] text-foreground">{t("landing.footer.colLegal")}</h3>
            <ul className="mt-4 space-y-2.5">
              {LEGAL_LINKS.map((link) => <li key={link.href}>
                <Link className="lp-focus text-[13px] text-muted-foreground hover:text-foreground" href={link.href}>{link[locale]}</Link>
              </li>)}
              <li><PrivacyPreferencesButton className="lp-focus min-h-11 text-left text-[13px] text-muted-foreground hover:text-foreground" /></li>
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h3 className="font-medium text-[13px] text-foreground">{t("landing.footer.colResources")}</h3>
            <ul className="mt-4 space-y-2.5">
              {RESOURCES.map((link) => (
                <li key={link.href}>
                  <Link
                    className="lp-focus text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
                    href={link.href}
                  >
                    {t(link.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h3 className="font-medium text-[13px] text-foreground">{t("landing.footer.colCompany")}</h3>
            <ul className="mt-4 space-y-2.5">
              {COMPANY.map((link) => (
                <li key={link.href}>
                  <Link
                    className="lp-focus text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
                    href={link.href}
                  >
                    {t(link.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4 border-border border-t pt-6 lg:mt-14">
          <p className="text-[12px] text-muted-foreground">
            © {year} senka. {t("landing.footer.rights")}
          </p>

          {/* The same two controls the sidebar carries, in the place a site
              puts its preferences. They are the app's own components, so the
              behaviour, the tooltips and the keyboard handling are the ones
              the product already has.

              The theme one repaints this page: the marketing surface follows
              `<html>` now. The language one does too — the marketing copy runs
              through the same dictionary as the rest of the app, so switching
              it here retranslates the whole page, landing included. */}
          <div className="-mx-2.5 ml-auto flex items-center gap-1">
            <ThemeToggle />
            <LanguageToggle />
          </div>
        </div>
      </Shell>

      {/* The signature, cropped by the footer's own bottom edge. */}
      <p className="lp-footmark">senka</p>
    </footer>
  );
}
