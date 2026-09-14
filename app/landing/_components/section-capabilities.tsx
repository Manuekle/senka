"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useSession } from "@/lib/auth/use-session";
import { useT } from "@/lib/i18n/provider";
import blueprint from "./blueprint.module.css";
import { CAPABILITY_ART } from "./capability-art";
import { Reveal, SectionIntro, Shell } from "./primitives";

/**
 * The twelve things an agent does, one card each.
 *
 * The rest of the page argues by screenshot: a section takes one surface of
 * the product, shows it at 1240px and talks about it for eight hundred words.
 * That works three or four times and then the page is fifteen thousand pixels
 * long and has covered a third of what the app does — which is exactly where
 * this landing was. The calendar, the CRM board, the public forms, the email
 * templates, the voice agents and the payment links had all shipped without
 * the page ever mentioning them.
 *
 * This is the other move: a grid where each cell is one capability, a drawing
 * of the mechanism, and two lines. Twelve features in one screen's worth of
 * page instead of twelve sections.
 *
 * A card is a way into the page it describes — but only for someone who has
 * one. Every `href` here is a gated route, so for a visitor who has never
 * signed in twelve links to `/knowledge`, `/crm`, `/leads` … are twelve trips
 * to the login screen. That is the same trap the header's calls to action were
 * pulled out of, so the cards are links when there is a session and plain
 * cards when there is not; the way in for a visitor is the one call to action
 * at the top, pointing at a page they can actually read.
 *
 * Every entry is real, and most of them are `lib/agent-capabilities.ts`
 * verbatim — the same list the capability picker builds an agent from. The
 * four that are not (CRM board, leads, forms, email templates) are pages in
 * the sidebar rather than agent tools, which is the only reason they are not
 * in that file. Nothing here is a capability the code does not have; a landing
 * page is the worst possible place to find that out.
 */

type Capability = {
  /** Keys the scene in `CAPABILITY_ART` and the i18n strings. */
  readonly id: string;
  /** The page it belongs to, so a card is a way in and not just a claim. */
  readonly href: string;
  /** How many of the three columns the card takes. Absent is one. */
  readonly span?: 2;
};

/**
 * Six, in an asymmetric bento: three rows of one wide card and one narrow one,
 * the wide card changing sides on each row. Everything else is named in one
 * line under the grid.
 *
 * The order is fixed. The cards used to trade places every few seconds; a
 * drawing that moves while you read it is a drawing you stop reading.
 */
const CAPABILITIES: readonly Capability[] = [
  { id: "knowledge", href: "/knowledge", span: 2 },
  { id: "handoff", href: "/inbox" },

  { id: "calendar", href: "/calendar" },
  { id: "leads", href: "/leads", span: 2 },

  { id: "payments", href: "/automations", span: 2 },
  { id: "voice", href: "/agents" },
];

/**
 * The card: one cell of the drawing sheet.
 *
 * Square, and edged by the sheet's own rules rather than a border of its own —
 * each cell draws its right and bottom edge and the grid draws the top and
 * left, so two cells share one line instead of stacking two.
 *
 * The link, when there is a session to link for, is an overlay stretched
 * across the cell. Swapping the outer element between a `<div>` and a `<Link>`
 * when the session resolves would remount the card; an overlay changes only
 * what is on top of it. It carries the card's title as its accessible name.
 */
function CapabilityCard({
  body,
  figure,
  href,
  scene,
  span,
  title,
}: {
  readonly body: string;
  readonly figure: string;
  readonly href: string | null;
  readonly scene: ReactNode;
  readonly span?: 2;
  readonly title: string;
}) {
  const wide = Boolean(span);

  return (
    <div
      className={`relative flex h-full flex-col border-border border-r border-b ${wide ? "lg:flex-row lg:items-stretch" : ""}`}
    >
      {/* Copy first. A wide card reads left to right — the sentence, then the
          drawing of it — and a narrow one top to bottom. Not vertically
          centred, so every heading in a row starts on the same line. */}
      <div className={`relative z-20 flex-none px-6 pt-6 pb-3 ${wide ? "lg:w-[38%] lg:pr-4 lg:pb-7" : ""}`}>
        <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">{figure}</p>
        <h3 className="mt-3 font-medium text-[15px] text-foreground tracking-tight">{title}</h3>
        <p className="mt-2.5 max-w-[42ch] text-[14px] text-muted-foreground leading-relaxed">{body}</p>
      </div>

      <div className={`lp-scene lp-scene-fill px-4 pb-7 ${wide ? "lg:min-w-0 lg:flex-1 lg:py-7" : "pt-1"}`}>
        {scene}
      </div>

      {href ? <Link aria-label={title} className="lp-focus absolute inset-0 z-30" href={href} /> : null}
    </div>
  );
}

export function CapabilitiesSection() {
  const t = useT();
  const session = useSession();

  return (
    <section id="capacidades" className="relative isolate scroll-mt-20 overflow-hidden border-border border-t py-24 sm:py-32">
      <Shell className="relative">
        <SectionIntro
          figure="Fig 04"
          title={[t("landing.capabilities.titleLine1"), t("landing.capabilities.titleLine2")]}
          body={t("landing.capabilities.body")}
          cta={{ href: "/guide", label: t("landing.capabilities.cta") }}
        />

        {/* The sheet: a ruled grid the cells sit on, edged top and left here
            and right and bottom by each cell. Below `lg` there are no spans and
            the cells simply flow. */}
        <div
          className={`${blueprint.sheet} mt-14 grid grid-cols-1 border-border border-t border-l sm:grid-cols-2 lg:grid-cols-3`}
        >
          {CAPABILITIES.map((capability, index) => {
            const Art = CAPABILITY_ART[capability.id];
            return (
              // The span lives on the grid item, which is the reveal wrapper.
              // The stagger walks by pairs, because a row here is two cards.
              <Reveal
                className={`h-full ${capability.span ? "lg:col-span-2" : ""}`}
                delay={Math.floor(index / 2) * 70}
                key={capability.id}
              >
                <CapabilityCard
                  body={t(`landing.capabilities.${capability.id}.body`)}
                  figure={`Fig 04.${index + 1}`}
                  href={session.signedIn ? capability.href : null}
                  scene={Art ? <Art /> : null}
                  span={capability.span}
                  title={t(`landing.capabilities.${capability.id}.title`)}
                />
              </Reveal>
            );
          })}
        </div>

        {/* The line that keeps the grid honest: a capability is something you
            grant, not something that is simply on. */}
        <Reveal delay={140}>
          <div className="mx-auto mt-10 max-w-[68ch] space-y-2 text-center">
            {/* The capabilities without a card of their own. A landing page
                that drops one to tidy up its grid lies by omission; one line is
                what they are worth here. */}
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              {t("landing.capabilities.andAlso")}
            </p>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              {t("landing.capabilities.footnote")}
            </p>
          </div>
        </Reveal>
      </Shell>
    </section>
  );
}
