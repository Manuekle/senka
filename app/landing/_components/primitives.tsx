"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { Add01Icon, ArrowRight01Icon, MouseLeftClick01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { TextReveal } from "@/components/motion/text-reveal";
import { cn } from "@/lib/utils";
import { BrowserChrome } from "./browser-chrome";
import { LightBar, LuminousText } from "./lighting";

/**
 * The building blocks every landing section is made of. They exist so the
 * sections read as content rather than as layout: a section file should say
 * "figure 02, this heading, this body, this mockup" and nothing about how far
 * anything travels on the way in.
 */

/**
 * The progressive blur along one edge of a moving surface.
 *
 * Used by the testimonial wall (top and bottom) and the self-hosted rail (left
 * and right); `.lp-wall-haze` decides which side the band sits on and which
 * way its ramps run, from `edge`.
 *
 * Two layers, not five, and the number is a measurement rather than a taste:
 * a `backdrop-filter` over a surface that is moving re-blurs every frame, so
 * the cost is one full pass per layer per frame. Five layers on the wall ran
 * at 43fps, three at 51, two at 59 — and dropping the blur radii instead of
 * the layer count did nothing, which is what says it is the passes and not the
 * pixels. Two masked layers still read as progressive: each ramp is a
 * gradient, so the blur arrives gradually rather than in steps, which was
 * always the point of masking them.
 *
 * Same construction as `.lp-veil` under the screenshots and for the same build
 * reason: the pipeline strips a hand-written `backdrop-filter`, so the blur is
 * carried on spans with utility classes.
 *
 * Order matters: the spans are read by `:nth-child`, which masks each one to
 * its own ramp — the first covers nearly the whole band, the second only the
 * outer part, so the blur piles up towards the edge things disappear over.
 */
export function Haze({ edge }: { readonly edge: "top" | "bottom" | "left" | "right" }) {
  return (
    <div aria-hidden="true" className="lp-wall-haze" data-edge={edge}>
      <span className="backdrop-blur-[3px]" />
      <span className="backdrop-blur-[10px]" />
    </div>
  );
}

/**
 * Marks a subtree to fade, rise and sharpen into place when it scrolls into
 * view. The animation lives in globals.css; `useReveal` in landing.tsx flips
 * the class. `delay` staggers siblings — 60–90ms apart is the range where a
 * group still reads as one gesture instead of a queue.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  lift = true,
  style,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly delay?: number;
  /**
   * Off for anything large. A 900px screenshot travelling 10px on the way in
   * is a whole window sliding for a distance you cannot see it cover — the
   * eye reads the edges moving and nothing else. Big surfaces fade; small
   * ones lift.
   */
  readonly lift?: boolean;
  readonly style?: CSSProperties;
}) {
  return (
    <div
      data-reveal
      data-reveal-still={lift ? undefined : ""}
      className={className}
      style={{ ...style, "--lp-d": `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}

/** The outer rail. Every section sits on it so the page has one left edge. */
export function Shell({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1120px] px-6 sm:px-8", className)}>{children}</div>
  );
}

/** The small monospaced label that numbers a section, e.g. `Fig 02`. */
export function FigureLabel({ children }: { readonly children: ReactNode }) {
  return <p className="lp-eyebrow">{children}</p>;
}

/**
 * A section's opening: figure number, a display-serif heading on the left, and
 * the supporting paragraph on the right. Below the tablet breakpoint the two
 * columns stack, because a 40-character measure next to a two-word heading is
 * a column of confetti.
 */
export function SectionIntro({
  body,
  cta,
  figure,
  title,
}: {
  readonly body: ReactNode;
  readonly cta?: { readonly href: string; readonly label: string };
  readonly figure: string;
  /** One entry per line. `TextReveal` sets the line breaks, not `<br />`. */
  readonly title: readonly string[];
}) {
  return (
    <div className="grid gap-8 md:grid-cols-2 md:gap-12">
      <Reveal>
        <FigureLabel>{figure}</FigureLabel>
        {/* The heading reveals a word at a time rather than sliding in as one
            block. A 3.5rem display line arriving as a rectangle is the motion
            a template does; word by word is the sentence assembling itself,
            which is the one place on the page where the extra beat is the
            point. Tuned well under the component's defaults — 45ms apart and
            6px of blur, so a six-word heading is finished in ~400ms instead of
            still settling after the reader has started on the paragraph. */}
        <TextReveal
          as="h2"
          blur={6}
          className="mt-4 text-balance font-heading font-semibold font-cooper text-[clamp(2.25rem,5vw,3.5rem)] text-foreground leading-[1.25] tracking-[-0.03em] overflow-visible pb-[0.12em]"
          stagger={0.045}
          text={title as string[]}
          whileInView
          yOffset="24%"
        />
      </Reveal>
      <Reveal delay={70} className="flex flex-col justify-end">
        <p className="max-w-[46ch] text-[17px] leading-relaxed tracking-[-0.03em] text-muted-foreground text-wrap-balance">{body}</p>
        {cta ? (
          <a
            href={cta.href}
            // `min-h-6` is the WCAG 2.2 target-size floor (24px). This renders
            // as a 20px line box, and it is a standalone link on its own line
            // rather than one inside a sentence, so the inline exemption does
            // not apply — a thumb on a phone had four pixels less than the
            // minimum to aim at. The height grows the hit box without moving
            // the text, which stays centred in it.
            className="group mt-6 inline-flex min-h-6 w-fit items-center gap-1.5 text-sm font-medium text-foreground"
          >
            {cta.label}
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={15}
              strokeWidth={2}
              className="transition-transform duration-200 ease-[var(--lp-ease)] group-hover:translate-x-1"
            />
          </a>
        ) : null}
      </Reveal>
    </div>
  );
}

/**
 * Cycles through an array of strings with the text-swap animation.
 * Each text stays visible for `interval` ms before swapping to the next.
 */
export function TextSwap({
  texts,
  interval = 2400,
  className,
}: {
  readonly texts: readonly string[];
  readonly interval?: number;
  readonly className?: string;
}) {
  const [index, setIndex] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const dataRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (texts.length <= 1) return;

    const id = setInterval(() => {
      const el = ref.current;
      const dataEl = dataRef.current;
      if (!el || !dataEl) return;

      // Phase 1: exit
      el.classList.add("is-exit");

      setTimeout(() => {
        // Phase 2: swap text, jump to enter-start
        const nextIndex = (index + 1) % texts.length;
        setIndex(nextIndex);
        // Update data-text manually for shimmer ::before
        dataEl.setAttribute("data-text", texts[nextIndex]);
        el.classList.remove("is-exit");
        el.classList.add("is-enter-start");

        // Phase 3: force reflow, then animate back
        void el.offsetHeight;
        el.classList.remove("is-enter-start");
      }, 150);
    }, interval);

    return () => clearInterval(id);
  }, [texts.length, interval, index, texts]);

  const current = texts[index];

  return (
    <span className={cn("relative inline-flex", className)}>
      {/* Swap animation layer */}
      <span ref={ref} className="t-text-swap font-cooper">
        {current}
      </span>
      {/* Shimmer overlay layer */}
      <span
        ref={dataRef}
        className="t-shimmer font-cooper pointer-events-none absolute inset-0"
        data-text={current}
        aria-hidden
      >
        {current}
      </span>
    </span>
  );
}

/**
 * transitions.dev "Number pop-in" (`.t-digit-group` / `.t-digit` in
 * globals.css), one character per span. `groupKey` remounts the whole group —
 * a fresh DOM node plays `.is-animating`'s entrance on its own, no manual
 * class-toggle-and-reflow dance needed. The two `data-stagger` steps that ship
 * with the effect only cover a two-character run, so longer figures ($2,490)
 * get their delay from an inline `animationDelay` instead, at the same
 * `--digit-stagger` step.
 *
 * Shared rather than local to the pricing page: the landing's pricing band
 * quotes the same figures under the same billing toggle, and two copies of the
 * same twelve lines is how the two stop matching.
 */
export function DigitPop({
  groupKey,
  luminous = false,
  text,
}: {
  readonly groupKey: string;
  /**
   * Mills each character: the metallic ramp and the bloom of `LuminousText`,
   * per glyph rather than around the figure.
   *
   * Per glyph because it cannot be otherwise. `background-clip: text` is
   * painted by the element that declares it and masked by the text inside it,
   * and a descendant that composites separately — which every one of these
   * spans is, animating opacity and a blur — is painted outside that operation
   * and comes out with the transparent fill and nothing behind it. Wrapped
   * around the group, the whole figure went invisible for the 500ms of its own
   * entrance: the animation still ran, on text nobody could see, so the number
   * looked like it had changed without moving. On each span the clip and the
   * animation are the same element and the filter applies to the already
   * clipped glyph.
   *
   * The ramps line up into one because every digit is the same height.
   */
  readonly luminous?: boolean;
  readonly text: string;
}) {
  return (
    <span className="t-digit-group is-animating" key={groupKey}>
      {[...text].map((char, index) => {
        const style = { animationDelay: `calc(var(--digit-stagger) * ${index})` };
        return luminous ? (
          <LuminousText
            className="t-digit"
            // biome-ignore lint/suspicious/noArrayIndexKey: the run is static per render, only `groupKey` ever changes
            key={index}
            style={style}
            text={char}
          />
        ) : (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: the run is static per render, only `groupKey` ever changes
            key={index}
            className="t-digit"
            style={style}
          >
            {char}
          </span>
        );
      })}
    </span>
  );
}

/**
 * The expandable one-liners that close a feature section, and the FAQ rows.
 * A CSS-grid accordion (grid-template-rows 0fr ↔ 1fr) so the panel height
 * animates with no JS measuring; the chevron flips and the body blurs in.
 * `data-open` is React state; the head is a button with `aria-expanded`.
 */
export function Disclosure({
  children,
  label,
}: {
  readonly children: ReactNode;
  readonly label: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // If label is a string, wrap it with shimmer effect (Cooper + shimmer)
  const labelContent =
    typeof label === "string" ? (
      <span className="t-shimmer font-cooper" data-text={label}>
        {label}
      </span>
    ) : (
      label
    );

  return (
    <div className="t-acc border-border border-t" data-open={open}>
      <button
        type="button"
        className="t-acc-head flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium text-foreground"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {labelContent}
        <HugeiconsIcon
          icon={Add01Icon}
          size={15}
          strokeWidth={2}
          className="t-acc-chevron shrink-0 text-muted-foreground"
        />
      </button>
      <div className="t-acc-panel">
        <div className="t-acc-panel-inner">
          <p className="pt-4 pb-4 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
            {children}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Puts a working app screen inside a frame that reads as a screenshot, and
 * gives the overlaid data cards a positioning context. `overlays` is passed
 * separately from `children` so it can escape the frame's `overflow: hidden`
 * and hang over the edge, which is what stops the composition looking like a
 * picture inside a box.
 *
 * The screens inside are operable — the tabs switch, the rows expand, the flow
 * canvas pans — so the frame is a labelled group rather than `aria-hidden`
 * decoration. `label` names what is running in it; `hint` is the one line that
 * tells a visitor the thing can be touched, which nothing else on the page
 * says.
 *
 * The veil is a sibling of the frame, not a child of the screen: it overhangs
 * the bezel so the whole window dissolves at the foot. It sits under
 * `overlays` in the stack, because a floating card is the layer that is
 * supposed to stay sharp.
 */
export function ScreenFrame({
  children,
  className,
  hint,
  label,
  lit = true,
  litIntensity = 1,
  overlays,
  url,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  /** One line under the frame saying what a visitor can do with it. */
  readonly hint?: ReactNode;
  readonly label: string;
  /**
   * The strip light over the frame's top edge, and the pool it leaves under
   * it. On by default, because a screenshot that is lit and one that is not
   * are two different objects and this page has five of them — the whole
   * argument for a rig rather than an effect is that the fifth screen is
   * under the same lamp as the first.
   *
   * `intensity` is the only thing a caller tunes. The hero's frame runs
   * brighter than the four below it: it is the one screenshot arriving with
   * nothing above it to have been lit already.
   */
  readonly lit?: boolean;
  readonly litIntensity?: number;
  readonly overlays?: ReactNode;
  /** The address the toolbar shows. Omit for a frame with no browser chrome. */
  readonly url?: string;
}) {
  return (
    <div className="relative">
      {/* ── The window ──────────────────────────────────────────────────
          Its own positioning context, and that is the whole point of it
          existing: everything anchored to the *bottom* of a screenshot — the
          veil, the pool of light under it — has to be measured from the frame
          and not from this component's outer box, because the outer box also
          holds the hint line under the picture.

          It did not, and the numbers were not close. On the automation figure
          the frame ended at 4018 and the veil ran 4099→4269: the entire
          progressive blur sat *below* the window, over the empty gap and
          across the hint text, washing out the one line on the page that tells
          a visitor the screen is operable — and leaving 80px of dead space
          where the screenshot was supposed to be dissolving. `bottom: -40px`
          and `height: 24%` are correct values; they were just being resolved
          against a box 200px taller than the thing they describe. */}
      <div className="relative">
        {/* The lamp. The box sits on the frame's top edge — `top-0`, not above
            it — and `LightBar` lifts the tube out of it by its own gap. Put
            the whole fixture above the frame instead and the cone starts above
            it too, so the sliver that shows over the bezel is the brightest
            part of the wash: a smear along the top edge rather than a lamp.

            The tube is inset from the frame's sides by 14% each way, so it is
            shorter than what it lights. A fixture as wide as its subject is a
            backlit panel; one that is narrower throws a cone with edges, and
            the corners of the frame stay in the dark where they belong.

            Behind the frame, and by paint order rather than by `z-index`. Both
            fixtures are rendered *before* the frame and neither carries a
            z-index, so the frame's opaque `--card` covers the half of the cone
            that would otherwise fall across the interface — a screenshot with
            white poured down its first two hundred pixels is a screenshot you
            cannot read, and that is the failure mode of every landing page
            that discovered this effect. What survives is the tube, its bloom,
            and the light spilling past the window's edges, which is what you
            would actually see in a room.

            `-z-10` would have been the obvious way to say the same thing and
            it is wrong here: `.lp` paints its own `--background`, so a negative
            index does not put the beam behind the frame, it puts it behind the
            page.

            No pool under the foot, unlike the pricing card and the closing
            mark. A window whose bottom is being dissolved by the veil and lit
            from underneath at the same time is three treatments arguing over
            the same forty pixels — the wash erasing the edge, a glow insisting
            there is one, and the page under both. Light pools under objects
            that end; these end by going out of focus. One treatment at the
            foot, and it is the veil. */}
        {lit ? (
          <LightBar className="inset-x-[14%] top-0 z-10" drop="24rem" gap="0px" intensity={litIntensity} />
        ) : null}

        {/* Two elements, two borders: the bezel and the screen inside it. */}
        {/* `role="img"` on the bezel and `inert` on everything inside it.
            Both halves matter.

            These are screenshots. They are built out of the product's real
            components, so the chat mockup contains a real `<textarea>`, real
            copy buttons, real thumbs-up/thumbs-down, and the flow canvas
            contains a button on every node — 108 focusable controls across the
            five frames on this page, against 68 that a visitor can actually
            use. Tabbing from the header to the pricing button went through all
            of them, and a screen reader announced every one as an operable
            control that does nothing: the composer is `readOnly` with a no-op
            submit, the tool output is a fixed string.

            `pointer-events-none` was here and only solved the mouse. `inert`
            is the property that says "this subtree is a picture": out of the
            tab order, out of the accessibility tree, and no pointer events
            either, so it replaces the class rather than joining it. The
            animations are unaffected — they are driven by state and by writing
            to the nodes directly, not by dispatching events.

            The frame then has to say what it is, which is what `role="img"`
            and the label do: one image with a name, where there used to be a
            group of a hundred phantom buttons. */}
        <div aria-label={label} className={cn("lp-frame", className)} role="img">
          {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: `inert` is the point — see above. */}
          <div className="lp-frame-inner flex flex-col" inert>
            {url ? <BrowserChrome url={url} /> : null}
            {children}
          </div>
        </div>

        {/* Progressive blur, then the wash onto the page. Three layers, all
            pointer-transparent; `.lp-veil` in globals.css carries the ramp
            each one is masked by.

            Two blurs, not five, and the number came off a profiler: a backdrop
            blur re-computes whenever its backdrop moves, so every frame of a
            scroll re-blurred five stacked layers under every mockup on the
            page. Five cost 47ms a frame while scrolling, two cost 32.

            The blur is a utility class rather than a `backdrop-filter` in that
            stylesheet because the build strips hand-written `backdrop-filter`
            declarations — the note over `.lp-overlay` has the detail. */}
        <div aria-hidden="true" className="lp-veil">
          <span className="backdrop-blur-[3px]" />
          <span className="backdrop-blur-[14px]" />
          <span />
        </div>
      </div>

      {overlays}

      {hint ? (
        <p className="relative z-[2] mt-5 flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
          <HugeiconsIcon icon={MouseLeftClick01Icon} size={14} strokeWidth={1.75} className="shrink-0" />
          {hint}
        </p>
      ) : null}
    </div>
  );
}
