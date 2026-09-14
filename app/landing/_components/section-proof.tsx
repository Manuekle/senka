"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { TextReveal } from "@/components/motion/text-reveal";
import proof from "@/content/proof.json";
import { useT } from "@/lib/i18n/provider";
import type { GlobeClient } from "./client-globe";
import { ClientGlobe } from "./deferred-globe";
import { DitherTerrain, type RidgePoint } from "./dither-terrain";
import { useStageLive } from "./use-stage-live";
import { FigureLabel, Haze, Reveal, Shell } from "./primitives";
import { SalesContactDialog } from "./sales-contact-dialog";

/**
 * Proof: who is running it, and what they say about it.
 *
 * This was two sections — a drifting testimonial wall, then a globe with the
 * clients on it — stacked one on the other, and they were the same claim made
 * twice. "People use this" and "here is what those people say" is one section
 * with two halves, not two sections; back to back they read as the page
 * running out of arguments and repeating itself with different furniture.
 *
 * Three things, then, each doing one job:
 *
 *   the globe   where they are — copy on the left, the sphere on the right
 *               running off the edge of the page. The crop is the composition;
 *               a sphere centred in a column with air all round it is an icon,
 *               and this section is not about the object.
 *   the quote   what one of them says. One at a time, crossfading, in the
 *               quarter under the copy a stat grid would hold.
 *   the rail    who they are — the same travelling row Fig 06 runs, at the
 *               foot of the section where a logo wall belongs.
 *
 * One quote rather than a wall of them, and that is the change that matters
 * most. A wall of nine is a wall nobody reads a single line of: the eye takes
 * it as texture, which is the honest outcome for a shape whose real message is
 * "there are a lot of these". One card at a reading size, held long enough to
 * finish, is a testimonial. The rest are still there — they come round.
 *
 * ── Where the content comes from ─────────────────────────────────────
 *
 * `content/proof.json`, and nowhere else. Both lists ship empty, and while a
 * list is empty this section says so in plain words rather than filling the
 * space with something invented — a landing page that prints made-up praise or
 * made-up customers is a fabricated endorsement whichever way you look at it,
 * and the version of that mistake nobody catches is the one that was only ever
 * meant to be a placeholder.
 *
 * The file is JSON rather than a constant in this file so that adding a client
 * is not a code change, and not in the translation dictionaries either: a real
 * quote is published in the words it was said in, not in two languages.
 */

type Testimonial = {
  /** Optional headshot: a path under `public/`. */
  readonly avatar?: string;
  /**
   * Who they are, as they would want to be named on a public page. Optional —
   * without one the role stands as the attribution on its own, which is how a
   * customer who agreed to be quoted but not named appears.
   */
  readonly name?: string;
  readonly quote: string;
  /** Role and business — the half of an attribution that carries the weight. */
  readonly role: string;
};

/* `proof.json` is data the build has no way to check, so its two lists are
   read defensively rather than asserted into shape: a typo in a hand-edited
   file should cost that one entry, not the whole page.

   Cast through `unknown` on purpose. TypeScript infers the literal shape of
   whatever happens to be in the file, so a straight cast turns a missing
   `name` into a build error — and the person who hits that is editing a JSON
   file, not this module, with a compiler message about assignability to point
   the way. The filters below are the real check, and they answer at runtime
   with the entry dropped and the placeholder still standing.

   `$comment` in the file is the field-by-field guide for whoever fills it in.
   JSON has no comments, and a schema nobody can find is a schema nobody
   follows. */
const CLIENTS: readonly GlobeClient[] = (proof.clients as unknown as GlobeClient[]).filter(
  (client) =>
    typeof client?.id === "string" &&
    typeof client.name === "string" &&
    Number.isFinite(client.lat) &&
    Number.isFinite(client.lng),
);

const TESTIMONIALS: readonly Testimonial[] = (
  proof.testimonials as unknown as Testimonial[]
).filter(
  (testimonial) => typeof testimonial?.quote === "string" && typeof testimonial.role === "string",
);

/** How long a quote holds before the next one fades in. Long, because the card
 *  is three or four lines and the whole point of showing one at a time is that
 *  it gets read to the end. */
const HOLD_MS = 8000;
/** The crossfade itself. */
const FADE_MS = 420;

/**
 * The skyline of the dithered ground, as [across, down] fractions of the
 * section at `lg` and up.
 *
 * Low and nearly flat under the copy column — the left 44%, where the heading,
 * the quote and the rail are — so the ground there is a band below the rail
 * and never under a line of text. Past the column it climbs, and it keeps
 * climbing behind the globe: the sphere is opaque, so the hill disappears
 * behind it and what shows is ground around its lower rim and under it. The
 * world sits in the landscape instead of floating over an empty half-page.
 */
const GROUND: readonly RidgePoint[] = [
  [0, 0.92],
  [0.18, 0.95],
  [0.36, 0.95],
  [0.5, 0.92],
  [0.58, 0.74],
  [0.68, 0.6],
  [0.82, 0.5],
  [1, 0.44],
];

/** The headshot, or the initials plate the app uses for a contact without one. */
function Avatar({ name, src }: { readonly name: string; readonly src?: string }) {
  if (src) {
    return (
      // Not `next/image`: the path comes out of a hand-edited JSON file, so its
      // real dimensions are unknown here, and a fixed 40px square has nothing
      // to gain from the optimiser that it does not already have.
      // biome-ignore lint/performance/noImgElement: fixed-size avatar from hand-edited content
      <img
        alt=""
        className="size-10 shrink-0 rounded-xl object-cover"
        height={40}
        src={src}
        width={40}
      />
    );
  }

  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "·";

  return (
    <span className="lp-plate flex size-10 shrink-0 items-center justify-center rounded-xl font-medium text-[13px] text-muted-foreground">
      {initials}
    </span>
  );
}

/**
 * The rotating quote.
 *
 * Every testimonial is rendered, stacked in one grid cell, and only the
 * current one is opaque. Stacking rather than swapping the text is what keeps
 * the card from resizing between a two-line quote and a five-line one — the
 * cell is as tall as the longest of them from the first paint, so nothing
 * under it moves every eight seconds.
 *
 * It holds while the section is off screen, in a background tab, or the
 * visitor asked for reduced motion — `useStageLive` answers all three — and
 * while a pointer or the keyboard is on the card, because a quote that changes
 * under someone reading it is the one way this shape can fail.
 */
function RotatingQuote({ testimonials }: { readonly testimonials: readonly Testimonial[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const live = useStageLive(wrapRef);
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!live || held || testimonials.length < 2) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % testimonials.length),
      HOLD_MS,
    );
    return () => window.clearInterval(timer);
  }, [held, live, testimonials.length]);

  return (
    <div
      className="grid"
      onBlur={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      ref={wrapRef}
    >
      {testimonials.map((testimonial, position) => {
        const current = position === index;
        return (
          <figure
            aria-hidden={current ? undefined : "true"}
            className="flex flex-col [grid-area:1/1]"
            key={testimonial.quote}
            style={
              {
                opacity: current ? 1 : 0,
                // `visibility` as well as `opacity`. A figure at zero opacity
                // is still a figure: it takes the pointer, so the card would
                // sit held by a quote nobody can see, and a screen reader
                // would find every quote at once. Delayed on the way out so it
                // is still painted while it fades.
                transition: `opacity ${FADE_MS}ms var(--lp-ease), visibility 0s linear ${
                  current ? "0ms" : `${FADE_MS}ms`
                }`,
                visibility: current ? "visible" : "hidden",
              } as CSSProperties
            }
          >
            {/* The glass quote mark: `.lp-figure`, the same treatment as the
                big numbers in the self-hosted scenes — transparent fill, a
                hairline stroke, one specular pixel along the top. A solid grey
                “ is the obvious version and it is heavier than the sentence it
                opens; this one is a shape you read past.

                Set here rather than through `Figure`, and much larger than
                `Figure`'s own size, because a quote mark is not a digit. A
                figure fills its em box top to bottom; `“` occupies the top
                third of it and nothing else, so the two set at the same size
                are not the same size on the page — at `Figure`'s 3rem this
                came out around 20px and read as a speck. The stroke is one
                hairline at 10% white whatever the glyph is set at, so going
                bigger costs nothing in weight; it just makes the mark legible
                as glass.

                `-ml-1` is the optical alignment every hanging quote wants: the
                glyph's ink starts inset from its own box, so a mark set flush
                to the rail sits a few pixels right of the sentence under it. */}
            <span aria-hidden="true" className="lp-figure -ml-1 -mb-2 block select-none font-heading text-[clamp(4.5rem,9vw,6rem)] leading-[0.8] tracking-[-0.04em]">
              “
            </span>
            <blockquote className="max-w-[46ch] font-heading text-[clamp(1rem,1.5vw,1.125rem)] text-foreground leading-[1.55]">
              {testimonial.quote}
            </blockquote>
            <figcaption className="mt-7 flex items-center gap-3">
              <Avatar name={testimonial.name ?? testimonial.role} src={testimonial.avatar} />
              <span className="min-w-0">
                <span className="block font-medium text-[14px] text-foreground leading-snug">
                  {testimonial.name ?? testimonial.role}
                </span>
                {testimonial.name ? (
                  <span className="block text-[13px] text-muted-foreground">{testimonial.role}</span>
                ) : null}
              </span>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

/**
 * One client on the rail: its mark, or its name set as one.
 *
 * A logo wall where half the entries are images and half are text looks like a
 * wall with holes in it, so both are the same object — a panel of one height
 * with either an image or a wordmark inside it. A client with no mark worth
 * reproducing is not a gap.
 */
function ClientMark({ client, echo }: { readonly client: GlobeClient; readonly echo?: boolean }) {
  return (
    <div
      aria-hidden={echo ? "true" : undefined}
      className="flex items-center gap-2 py-1"
    >
      {client.logo ? (
        // biome-ignore lint/performance/noImgElement: height-constrained mark from hand-edited content
        <img
          alt={client.name}
          className="h-5 w-auto max-w-[7rem] object-contain opacity-70"
          src={client.logo}
        />
      ) : (
        <span className="whitespace-nowrap text-[13px] text-muted-foreground tracking-tight">
          {client.name}
        </span>
      )}
    </div>
  );
}

/**
 * The travelling row of clients — `.lp-rail`, the same one Fig 06 runs its
 * guarantees on, so a second marquee on the page is the same object rather
 * than a second idea.
 *
 * `items` is rendered twice and the animation covers exactly half the track,
 * so the second copy lands where the first began and the loop has no seam.
 * Before that, a short list is repeated until it is wider than any screen it
 * will meet: three names is under 900px, and a track narrower than the rail
 * leaves a hole crossing the screen once a lap. Repeating invents nothing — it
 * is the same wall of names, twice round.
 */
function ClientRail({ clients }: { readonly clients: readonly GlobeClient[] }) {
  const filled: GlobeClient[] = [];
  while (filled.length < 8) filled.push(...clients);

  const mark = (client: GlobeClient, position: number, echo: boolean) => (
    <ClientMark
      client={client}
      echo={echo}
      key={`${echo ? "echo" : "run"}-${position}-${client.id}`}
    />
  );

  return (
    <div className="lp-rail">
      <Haze edge="left" />
      <div
        className="lp-rail-track"
        data-dir="left"
        style={{ "--lp-drift": "64s" } as CSSProperties}
      >
        {filled.map((client, position) => mark(client, position, false))}
        {filled.map((client, position) => mark(client, position, true))}
      </div>
      <Haze edge="right" />
    </div>
  );
}

/**
 * What stands where content will go.
 *
 * A dashed box that names the file to edit, rather than an approximation of
 * the thing that is missing. Grey blocks the shape of a quote are the worse
 * option twice over: on the page they read as something that failed to load,
 * and in the repo they are one deploy away from being mistaken for real.
 */
function Placeholder({
  children,
  className,
}: {
  readonly children: string;
  readonly className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-muted-foreground/30 border-dashed px-5 py-6 ${className ?? ""}`}
    >
      <p className="text-[13px] text-muted-foreground leading-relaxed">{children}</p>
      <p className="mt-2 font-mono text-[11.5px] text-muted-foreground/70">content/proof.json</p>
    </div>
  );
}

export function ProofSection() {
  const t = useT();

  return (
    /* `overflow-hidden` is the crop, and the crop is the composition. */
    <section
      className="relative scroll-mt-20 overflow-hidden border-border border-t py-24 sm:py-32"
      id="clientes"
    >
      {/* `#testimonios` survives as an anchor of its own, on a zero-width
          marker — two ids on one element is a choice between them, and both
          were linkable while this was two sections. */}
      <span aria-hidden="true" className="-top-20 absolute block h-20 w-px" id="testimonios" />

      {/* ── The ground ──────────────────────────────────────────────────
          First in the section, so everything positioned after it — the globe
          included — paints over it. From `lg` only: below that the section
          stacks and the rail and the quote run full width, so there is no
          empty half for the ground to stand in, only text to sit under. */}
      <DitherTerrain className="inset-0 hidden lg:block" ridge={GROUND} />

      {/* ── The globe band ──────────────────────────────────────────────
          Its own positioning context, so the sphere is centred on the copy and
          the quote rather than on the whole section — the rail at the foot is
          a separate object and the globe should not be measured against it.

          `flex flex-col` up to `lg`, plain block above it: that is what puts
          the globe in the right place at both sizes from one element rather
          than two. On a phone the children stack in source order — copy,
          globe, quote — so the section still opens with its heading instead of
          with a sphere. From `lg` the globe goes absolute and the other two
          close back up around it.

          Two `<ClientGlobe>`s behind breakpoint classes would have been the
          obvious way to do that and it is the expensive one: each is a live
          WebGL context and a frame loop, and the hidden one goes on drawing
          frames nobody sees. */}
      <div className="relative flex flex-col lg:block">
        <Shell className="pointer-events-none relative z-10">
          {/* `pointer-events-none` on the Shell, `auto` back on below: from `lg`
              the globe sits absolute behind this copy, and the Shell is full
              width even where its text only fills the left 44% — without this
              the empty right half eats every pointerdown aimed at the sphere.
              The text, badge and link stay clickable through the inner `auto`. */}
          <div className="pointer-events-auto lg:max-w-[44%]">
            <Reveal>
              <FigureLabel>Fig 07</FigureLabel>
              {/* `font-cooper` last, and that ordering is load-bearing.
                  `TextReveal` runs this className through `twMerge`, which
                  treats `font-cooper` and `font-heading` as the same
                  font-family utility and keeps whichever comes last — with
                  Cooper written first it was dropped outright, and this
                  heading came out in Saans while every other display line on
                  the page was Cooper.

                  Written out rather than taken from `SectionIntro`, whose
                  two-column layout puts the body copy to the right of the
                  title — which is exactly where the globe is. */}
              <TextReveal
                as="h2"
                blur={6}
                className="mt-4 text-balance font-heading font-semibold font-cooper text-[clamp(2.25rem,5vw,3.5rem)] text-foreground leading-[1.02] tracking-[-0.03em]"
                stagger={0.045}
                text={[t("landing.proof.titleLine1"), t("landing.proof.titleLine2")]}
                whileInView
                yOffset="24%"
              />
            </Reveal>

            <Reveal delay={70}>
              <p className="mt-6 max-w-[42ch] text-[17px] text-muted-foreground leading-relaxed tracking-[-0.03em] text-wrap-balance">
                {t("landing.proof.body")}
              </p>
              <div className="mt-6">
                <SalesContactDialog
                  bodyKey="landing.proof.contactModal.body"
                  source="clients"
                  titleKey="landing.proof.contactModal.title"
                  triggerLabelKey="landing.proof.cta"
                  triggerVariant="link"
                />
              </div>
            </Reveal>
          </div>
        </Shell>

        {/* The globe hangs off the band, not off the content rail: `right-0`
            here is the viewport's edge, so the sphere is cropped by the browser
            window the way the reference crops it. Anchored to `Shell` instead
            it would stop at the 1120px rail and sit in the gutter with a margin
            around it — cropped by nothing, which is the same as not cropped.

            `pointer-events-none` for the whole layer: on `lg` it covers the
            right side of the band top to bottom. The globe itself opts back in
            with `pointer-events-auto` on its own root (see `ClientGlobe`), so
            the layer never intercepts anything while the sphere stays
            draggable — and the Shells above open their empty halves the same
            way, so no transparent box stands between the pointer and the
            sphere. */}
        <div className="pointer-events-none relative mt-14 flex justify-center px-6 lg:absolute lg:inset-y-0 lg:right-0 lg:mt-0 lg:block lg:w-[70vw] lg:px-0">
          {/* Sized and offset in `vw`, not `rem`, and not in `%` of the
              wrapper. A fixed rem width is one globe for every screen: the one
              that crops nicely at 1440 is wider than the viewport at 1024,
              where its left rim lands in the middle of the paragraph.
              Percentages of the wrapper have the same problem one level
              removed. In `vw` the crop is the same fraction of the sphere at
              every width — which is what "bleeds off the edge" means — and the
              gap between the copy and the rim holds at every size. */}
          <ClientGlobe
            className="max-w-[22rem] sm:max-w-[28rem] lg:absolute lg:top-[62%] lg:right-[-13vw] lg:w-[64vw] lg:max-w-none lg:-translate-y-1/2"
            clients={CLIENTS}
          />
        </div>

        {/* Held to the left half from `lg`, so the quote ends where the sphere
            begins: type in the bottom-left quarter, the world in the right
            half, which is the reference's whole arrangement. Same
            `pointer-events` split as the copy Shell above — the quote card
            keeps its hover-hold, the empty right half lets drags through to
            the globe behind it. */}
        <Shell className="pointer-events-none relative z-10 mt-16 lg:mt-24">
          <div className="pointer-events-auto lg:max-w-[44%]">
            {TESTIMONIALS.length === 0 ? (
              <Reveal delay={60}>
                <Placeholder className="max-w-[46ch]">
                  {t("landing.proof.emptyTestimonials")}
                </Placeholder>
              </Reveal>
            ) : (
              <Reveal delay={60} lift={false}>
                <RotatingQuote testimonials={TESTIMONIALS} />
              </Reveal>
            )}
          </div>
        </Shell>
      </div>

      {/* ── The rail ────────────────────────────────────────────────────
          Outside the globe band, at the foot of the section, full rail width.
          A logo wall is a footer to an argument, not a column beside one.
          `pointer-events-none`: nothing in here is interactive, and on tall
          screens the sphere reaches down this far — a transparent Shell must
          not stand between the pointer and the globe. */}
      <Shell className="pointer-events-none relative z-10 mt-20 sm:mt-24">
        <div className="lg:max-w-[44%]">
          <Reveal>
            <p className="lp-eyebrow">{t("landing.proof.clientsLabel")}</p>
          </Reveal>
          {CLIENTS.length === 0 ? (
            <Reveal delay={60}>
              <Placeholder className="mt-6 max-w-[46ch]">{t("landing.proof.emptyClients")}</Placeholder>
            </Reveal>
          ) : (
            <Reveal delay={60} lift={false}>
              <div className="mt-6">
                <ClientRail clients={CLIENTS} />
              </div>
            </Reveal>
          )}
        </div>
      </Shell>
    </section>
  );
}
