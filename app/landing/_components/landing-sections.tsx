"use client";

import { HugeiconsIcon, type IconSvgElement } from "@/components/icons/icon";
import {
  LibraryIcon,
  Layers01Icon,
  Shield01Icon,
  WebhookIcon,
} from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { LicenseCreditCard } from "@/components/ai-elements/license-credit-card";
import { ChromaticTextReveal } from "@/components/motion/chromatic-text-reveal";
import { TextReveal } from "@/components/motion/text-reveal";
import { AnthropicLogo, GeminiLogo, OpenAiLogo, VercelLogo } from "@/components/provider-logo";
import { useT } from "@/lib/i18n/provider";
import { AdsScreen, AgentsScreen, FlowScreen, InboxScreen } from "./deferred-screens";
import {
  ElevenLabsMark,
  GoogleMark,
  InstagramMark,
  MetaMark,
  StripeMark,
  WhatsAppMark,
} from "./brand-marks";
import { MercadoPagoBrandIcon } from "@/components/icons/connection-icons";
import { BrandGlow } from "./lighting";
import { ConversationOverlay } from "./overlays";
import blueprint from "./blueprint.module.css";
import styles from "./editorial.module.css";
import { BrowserChrome } from "./browser-chrome";
import { GUARANTEE_ICONS, ServerBlueprint } from "./server-blueprint";
import {
  Disclosure,
  FigureLabel,
  Reveal,
  ScreenFrame,
  SectionIntro,
  Shell,
} from "./primitives";

// ── Channel band ────────────────────────────────────────────────────

/**
 * The places a customer already writes to you, in the platforms' own colours
 * and at a size you can read across a room.
 *
 * It used to be a four-item marquee of monochrome glyphs at 15px, printed four
 * times so the track was wide enough to scroll. Two things were wrong with it:
 * a strip that moves on its own asks to be watched and then says nothing worth
 * watching, and "Chat web" alongside three product names is a feature standing
 * in a line of brands.
 *
 * Meta stands for the leads a Meta Ads form collects, which is what the line
 * underneath says instead of the old sentence about webhooks. A webhook is an
 * automation trigger; it was never somewhere a customer writes to you, which
 * is the claim this section makes.
 */
const CHANNELS: readonly {
  /** The mark's own brand value, for the bloom under it. */
  readonly glow: string;
  readonly label: string;
  readonly mark: ReactNode;
}[] = [
  { glow: "#25D366", label: "WhatsApp", mark: <WhatsAppMark size={34} /> },
  // The magenta from the middle of the ramp, not the orange at its end: the
  // gradient runs yellow through magenta to violet, and magenta is the one
  // anybody would name if you asked them what colour Instagram is.
  { glow: "#FC01D8", label: "Instagram", mark: <InstagramMark size={34} /> },
  { glow: "#0081FB", label: "Meta", mark: <MetaMark size={38} /> },
];

/** The four routes `lib/provider-catalog.ts` can be pointed at. Keep in step
 *  with AI_PROVIDERS in lib/model-catalog.ts. */
const PROVIDERS: readonly { readonly label: string; readonly mark: ReactNode }[] = [
  { label: "Anthropic", mark: <AnthropicLogo size={20} /> },
  { label: "OpenAI", mark: <OpenAiLogo size={20} /> },
  { label: "Gemini", mark: <GeminiLogo size={20} className="grayscale" /> },
  { label: "Vercel AI Gateway", mark: <VercelLogo size={18} /> },
];

export function ChannelBand() {
  const t = useT();

  return (
    <section className="border-border border-y py-20 sm:py-24">
      <Shell>
        <TextReveal
          as="h2"
          blur={6}
          className="mx-auto max-w-[22ch] text-balance text-center font-cooper font-semibold text-[clamp(1.75rem,3.8vw,2.75rem)] text-foreground leading-[1.06] tracking-[-0.03em]"
          stagger={0.045}
          text={t("landing.channels.heading")}
          whileInView
          yOffset="24%"
        />

        <Reveal delay={80}>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-14 gap-y-9 sm:gap-x-20">
            {CHANNELS.map((channel) => (
              <span className="flex items-center gap-3.5" key={channel.label}>
                {/* The one hue the rig allows. These marks were already the
                    page's exception — full colour, on a product that has none
                    — and they were the only bright objects on a lit page
                    throwing no light of their own, which is what made them
                    read as three stickers rather than three things in the
                    room. The label beside each one stays plain: a glowing
                    logo is a light source, a glowing word is a neon sign. */}
                <BrandGlow colour={channel.glow}>{channel.mark}</BrandGlow>
                <span className="whitespace-nowrap font-cooper text-[clamp(1.25rem,2.4vw,1.75rem)] text-foreground leading-none tracking-[-0.02em]">
                  {channel.label}
                </span>
              </span>
            ))}
          </div>
        </Reveal>

        <Reveal delay={140}>
          <p className="mx-auto mt-11 max-w-[52ch] text-center text-[15px] leading-relaxed text-muted-foreground">
            {t("landing.channels.body")}
          </p>
        </Reveal>

        {/* The other half of the claim: the channels are theirs, the model is
            yours. Same hairline the feature sections use, so the two halves
            read as one section rather than as two bands stacked.

            The line names one route at a time and the row shows all three
            marks, so neither repeats the other. It is the one moving thing
            left in this section, and it moves for a reason the copy needs:
            "the model is your choice" is a list, and a list read aloud is
            what a cycling word is. */}
        <Reveal delay={200}>
          {/* The rule under the channel row, with a source on it. It is the
              one divider on the page that is also a hinge — everything above
              it is what senka connects to and everything below is what runs
              the replies — and the hot spot at its centre is where the light
              that lit the hero enters this section. A plain hairline here read
              as the section ending twice. */}
          <div className="lp-filament mt-14 border-border border-t pt-10">
            <p className="text-center text-[13px] text-muted-foreground">
              {/* The prefix cannot wrap — the component keeps it on one line so
                  the sweep has a stable box to travel across — and the word
                  slot always reserves the width of the longest option. Kept
                  short so prefix plus «Vercel AI Gateway» still fits inside a
                  360px phone's rail. */}
              <ChromaticTextReveal
                pauseDuration={1.6}
                prefix={t("landing.channels.modelPrefix")}
                words={PROVIDERS.map((provider) => provider.label)}
              />
            </p>
            <div className="mt-6 flex items-center justify-center gap-9 text-muted-foreground">
              {PROVIDERS.map((provider) => (
                <span key={provider.label} title={provider.label}>
                  {provider.mark}
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      </Shell>
    </section>
  );
}

// ── Principles ──────────────────────────────────────────────────────

const PRINCIPLES: readonly {
  readonly bodyKey: string;
  readonly figure: string;
  readonly icon: IconSvgElement;
  readonly titleKey: string;
}[] = [
  {
    bodyKey: "landing.principles.inbox.body",
    figure: "Fig 0.1",
    icon: Layers01Icon,
    titleKey: "landing.principles.inbox.title",
  },
  {
    bodyKey: "landing.principles.knowledge.body",
    figure: "Fig 0.2",
    icon: LibraryIcon,
    titleKey: "landing.principles.knowledge.title",
  },
  {
    bodyKey: "landing.principles.selfHosted.body",
    figure: "Fig 0.3",
    icon: Shield01Icon,
    titleKey: "landing.principles.selfHosted.title",
  },
];

export function Principles() {
  const t = useT();

  return (
    <section className="relative isolate overflow-hidden py-24 sm:py-32">
      <div aria-hidden="true" className="bg-pattern bg-pattern-dots pointer-events-none absolute inset-0 -z-10 opacity-45" />
      <Shell className="relative">
        <TextReveal
          as="h2"
          blur={6}
          className="max-w-[18ch] text-balance font-heading font-semibold font-cooper text-[clamp(2rem,4.4vw,3rem)] text-foreground leading-[1.02] tracking-[-0.03em]"
          stagger={0.045}
          text={t("landing.principles.heading")}
          whileInView
          yOffset="24%"
        />

        {/* Rules, not cards.

            The section used to be three `lp-cap` cards — the app's KPI tile,
            with its surface, its radius, its double edge and its sheen. That
            tile earns its weight where it holds something: a number, a
            screenshot, a scene the cursor resolves. Here it holds a sentence,
            and a filled box around a sentence is packaging.

            What is left is the measurement itself: `.lp-line` puts a hairline
            over each column, the columns sit flush so those three hairlines
            read as one rule across the row, a vertical hairline separates
            them, and the container closes the block underneath. The columns
            are the same width they were, so the rhythm of the section does not
            move — only the box around it goes.

            The leftmost column carries no left inset: its heading has to start
            on the same rail as the section's own, or the whole row reads as
            indented from the page. */}
        <div className="mt-14 grid border-border border-b sm:grid-cols-3">
          {PRINCIPLES.map((principle, index) => (
            <Reveal
              key={principle.titleKey}
              className="lp-line group flex-col py-8 sm:border-border sm:border-l sm:px-7 sm:py-9 sm:first:border-l-0 sm:first:pl-0 sm:last:pr-0"
              delay={index * 70}
            >
              <div className="flex items-center justify-between">
                <FigureLabel>{principle.figure}</FigureLabel>
                <HugeiconsIcon
                  className="text-muted-foreground transition-colors duration-200 group-hover:text-foreground"
                  icon={principle.icon}
                  size={16}
                  strokeWidth={1.5}
                />
              </div>
              <h3 className="mt-5 font-medium text-lg tracking-tight">{t(principle.titleKey)}</h3>
              <p className="mt-2.5 text-[15px] text-muted-foreground leading-relaxed">
                {t(principle.bodyKey)}
              </p>
            </Reveal>
          ))}
        </div>
      </Shell>
    </section>
  );
}

// ── Feature section shell ───────────────────────────────────────────

/**
 * The repeating unit of the page: an intro, a working screen with its data
 * floated on top, and a row of one-line disclosures for the detail that would
 * bloat the paragraph above.
 *
 * The screen is no longer wrapped in `aria-hidden`. It used to be decoration,
 * and decoration is what it stopped being the moment the tabs, the rows and
 * the canvas started responding — a focusable control inside an `aria-hidden`
 * subtree is a keyboard trap with no name attached. It is a labelled group
 * instead.
 */
function FeatureSection({
  body,
  children,
  disclosures,
  figure,
  footer,
  hint,
  id,
  label,
  overlays,
  title,
  url,
}: {
  readonly body: ReactNode;
  readonly children: ReactNode;
  readonly disclosures: readonly { readonly detail: string; readonly label: ReactNode }[];
  readonly figure: string;
  /** Optional block between the screen and the disclosures. */
  readonly footer?: ReactNode;
  /** The one line telling a visitor the screen below is operable. */
  readonly hint: string;
  readonly id: string;
  /** Names the screen for anyone who cannot see it. */
  readonly label: string;
  readonly overlays?: ReactNode;
  readonly title: readonly string[];
  /** The address its browser toolbar shows. */
  readonly url: string;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-border border-t py-24 sm:py-32">
      <Shell>
        <SectionIntro figure={figure} title={title} body={body} />
      </Shell>

      {/* The screen sits on the wide rail, not on the copy rail — the same
          `1240px` the hero mockup uses. Every figure on the page is then the
          same object photographed from the same distance; running the first
          one 120px wider than the four below it read as four screenshots that
          had been shrunk to fit. */}
      {/* `mt-20`, up from `mt-14`. The frames are lit now: a tube plus its halo
          occupies the twenty pixels directly above the bezel, and at the old
          spacing that put a bright horizontal streak within a line and a half
          of the section's own paragraph — two things competing for the same
          band of the composition. The fixture needs room above it to read as a
          fixture rather than as an underline for the copy. */}
      <div className="relative mx-auto mt-20 w-full max-w-[1240px] px-6 sm:mt-24 sm:px-8">
        <Reveal delay={60} lift={false}>
          <ScreenFrame hint={hint} label={label} overlays={overlays} url={url}>
            {children}
          </ScreenFrame>
        </Reveal>
      </div>

      <Shell>
        {footer}
        <Reveal delay={80}>
          <div className="mt-16 grid gap-x-10 sm:mt-20 sm:grid-cols-2 lg:grid-cols-3">
            {disclosures.map((item) => (
              <Disclosure key={item.detail} label={item.label}>
                {item.detail}
              </Disclosure>
            ))}
          </div>
        </Reveal>
      </Shell>
    </section>
  );
}

// ── Bandeja ─────────────────────────────────────────────────────────

export function InboxSection() {
  const t = useT();

  return (
    <FeatureSection
      id="bandeja"
      figure="Fig 01"
      url="senka.ai/inbox"
      label={t("landing.features.inbox.label")}
      hint={t("landing.features.inbox.hint")}
      title={[t("landing.features.inbox.titleLine1"), t("landing.features.inbox.titleLine2")]}
      body={t("landing.features.inbox.body")}
      overlays={
        <ConversationOverlay
          className="-bottom-2 -left-6 hidden lg:block"
          delay={240}
          channel="instagram"
          who="Lucía Romero"
          incoming={t("landing.demo.msg.lucia")}
          reply={t("landing.demo.reply.lucia")}
        />
      }
      disclosures={[
        {
          label: t("landing.features.inbox.disclosure1.label"),
          detail: t("landing.features.inbox.disclosure1.detail"),
        },
        {
          label: t("landing.features.inbox.disclosure2.label"),
          detail: t("landing.features.inbox.disclosure2.detail"),
        },
        {
          label: t("landing.features.inbox.disclosure3.label"),
          detail: t("landing.features.inbox.disclosure3.detail"),
        },
      ]}
    >
      <InboxScreen />
    </FeatureSection>
  );
}

// ── Automatizaciones ────────────────────────────────────────────────


/**
 * What a flow can do at its far end, and nothing it cannot.
 *
 * Every entry here is a credential group in Configuración with a step or a
 * tool behind it — `send_payment_link` calls `lib/stripe.ts`, `log_sheet`
 * calls `lib/google-sheets.ts`, the calendar tools call `lib/calendar.ts` off
 * the same Google service account, `send_audio` reaches ElevenLabs through
 * `lib/elevenlabs.ts`, and `http_request` is bounded by the host allowlist. A logo strip on a landing page is a promise about integrations,
 * and it is the easiest one on a page like this to write ahead of the code.
 */
/* Same rule as the channel row: a mark that carries its own colour carries its
   own light. `glow` is `null` for the two that are monochrome — a neutral
   bloom under a grey wordmark is a smudge, and this row is a footnote, not a
   light show. The three that do glow run at a third of the channel row's
   brightness, which is what puts them further away rather than making them a
   second claim. */
const CONNECTORS: readonly {
  readonly detailKey: string;
  /** The mark's brand value, or `null` when the mark has no colour of its own. */
  readonly glow: string | null;
  /** `null` for a literal brand name — nothing to translate. */
  readonly labelKey: string | null;
  readonly label: string;
  readonly mark: ReactNode;
}[] = [
  {
    detailKey: "landing.features.automation.connectorStripe",
    // Stripe's violet. The slot holds two marks and one light; Mercado Pago's
    // cyan under the same bloom would be two lamps in one 48px box.
    glow: "#635BFF",
    labelKey: "landing.features.automation.connectorPaymentsLabel",
    label: "",
    mark: (
      <span className="flex items-center gap-1.5">
        <StripeMark size={26} />
        <MercadoPagoBrandIcon size={22} />
      </span>
    ),
  },
  {
    detailKey: "landing.features.automation.connectorSheets",
    glow: "#4285F4",
    labelKey: "landing.features.automation.connectorSheetsLabel",
    label: "",
    mark: <GoogleMark size={26} />,
  },
  {
    detailKey: "landing.features.automation.connectorVoice",
    glow: "#FF5C35",
    labelKey: "landing.features.automation.connectorVoiceLabel",
    label: "",
    mark: <ElevenLabsMark height={15} />,
  },
  {
    detailKey: "landing.features.automation.connectorApi",
    glow: null,
    labelKey: "landing.features.automation.connectorApiLabel",
    label: "",
    mark: (
      <HugeiconsIcon
        className="shrink-0 text-muted-foreground"
        icon={WebhookIcon}
        size={22}
        strokeWidth={1.5}
      />
    ),
  },
];

function AutomationConnectors() {
  const t = useT();

  return (
    <Reveal delay={80}>
      <div className="mt-16 border-border border-t pt-10 sm:mt-20">
        <p className="text-center text-[13px] text-muted-foreground">
          {t("landing.features.automation.connectorsIntro")}
        </p>
        <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {CONNECTORS.map((connector) => (
            <div className="flex flex-col items-center gap-2.5 text-center" key={connector.detailKey}>
              {/* Fixed-height slot: the marks have wildly different aspect
                  ratios — a square G, a wide parallelogram, a wordmark seven
                  times wider than it is tall — and without it the labels sit
                  at four different heights. */}
              <span className="flex h-7 items-center">
                {connector.glow ? (
                  <BrandGlow colour={connector.glow} intensity={0.34}>
                    {connector.mark}
                  </BrandGlow>
                ) : (
                  connector.mark
                )}
              </span>
              <p className="mt-1 font-medium text-[15px] text-foreground">
                {connector.labelKey ? t(connector.labelKey) : connector.label}
              </p>
              <p className="max-w-[26ch] text-[13px] leading-relaxed text-muted-foreground">
                {t(connector.detailKey)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

export function AutomationSection() {
  const t = useT();

  return (
    <section
      id="automatizaciones"
      className={`${styles.automation} scroll-mt-20 border-border border-t py-24 sm:py-32`}
    >
      <Shell>
        <div className={styles.automationLayout}>
          <div>
            <Reveal>
              <FigureLabel>{t("nav.automations")}</FigureLabel>
              <TextReveal
                as="h2"
                className="mt-5 max-w-[15ch] font-cooper text-[clamp(2.5rem,4.4vw,3.5rem)] leading-[1.12] tracking-[-0.03em]"
                text={[t("landing.features.automation.titleLine1"), t("landing.features.automation.titleLine2")]}
                whileInView
              />
              <p className="mt-6 max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground">
                {t("landing.features.automation.body")}
              </p>
            </Reveal>

            <ol className={styles.process}>
              {(["message", "decision", "response"] as const).map((step, index) => (
                <li className={styles.processStep} key={step}>
                  <span aria-hidden="true" className={styles.stepNumber} data-text={`0${index + 1}`}>0{index + 1}</span>
                  <Reveal delay={index * 60}>
                    <h3 className="text-[15px] font-medium tracking-tight">
                      {t(`landing.features.automation.process.${step}.title`)}
                    </h3>
                    <p className="mt-2 max-w-[38ch] text-[14px] leading-relaxed text-foreground/70">
                      {t(`landing.features.automation.process.${step}.body`)}
                    </p>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>

          <Reveal lift={false} delay={100}>
            <figure className={styles.flowFigure}>
              <figcaption className="sr-only">
                {t("landing.features.automation.example")}: {t("landing.demo.flow.title")}
              </figcaption>
              <BrowserChrome variant="minimal" />
              <div role="img" aria-label={t("landing.features.automation.hint")}>
                <FlowScreen compact />
              </div>
              <p className={styles.flowFootnote}>{t("landing.features.automation.process.note")}</p>
            </figure>
          </Reveal>
        </div>

        <Reveal>
          <div className="mt-10 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((index) => (
              <Disclosure key={index} label={t(`landing.features.automation.disclosure${index}.label`)}>
                {t(`landing.features.automation.disclosure${index}.detail`)}
              </Disclosure>
            ))}
          </div>
        </Reveal>
        <AutomationConnectors />
      </Shell>
    </section>
  );
}

// ── Agentes ─────────────────────────────────────────────────────────

export function AgentsSection() {
  const t = useT();

  return (
    <FeatureSection
      id="agentes"
      figure="Fig 03"
      url="senka.ai/agents"
      label={t("landing.features.agents.label")}
      hint={t("landing.features.agents.hint")}
      title={[t("landing.features.agents.titleLine1"), t("landing.features.agents.titleLine2")]}
      body={t("landing.features.agents.body")}
      overlays={null}
      disclosures={[
        {
          label: t("landing.features.agents.disclosure1.label"),
          detail: t("landing.features.agents.disclosure1.detail"),
        },
        {
          label: t("landing.features.agents.disclosure2.label"),
          detail: t("landing.features.agents.disclosure2.detail"),
        },
        {
          label: t("landing.features.agents.disclosure3.label"),
          detail: t("landing.features.agents.disclosure3.detail"),
        },
      ]}
    >
      <AgentsScreen />
    </FeatureSection>
  );
}

// ── Meta Ads ────────────────────────────────────────────────────────

export function AdsSection() {
  const t = useT();

  return (
    <FeatureSection
      id="ads"
      figure="Fig 05"
      url="senka.ai/ads"
      label={t("nav.ads")}
      hint={t("landing.features.ads.hint")}
      title={[t("landing.features.ads.titleLine1"), t("landing.features.ads.titleLine2")]}
      body={t("landing.features.ads.body")}
      overlays={
        /* The screen behind already states the cost per lead, so the overlay
           shows the other half of the claim: what the lead that number is
           counting actually said once it landed in the inbox. */
        <ConversationOverlay
          className="-right-6 bottom-20 hidden lg:block"
          delay={260}
          who="Lead · Retargeting"
          incoming={t("landing.features.ads.overlayIncoming")}
          reply={t("landing.features.ads.overlayReply")}
        />
      }
      disclosures={[
        {
          label: t("landing.features.ads.disclosure1.label"),
          detail: t("landing.features.ads.disclosure1.detail"),
        },
        {
          label: t("landing.features.ads.disclosure2.label"),
          detail: t("landing.features.ads.disclosure2.detail"),
        },
        {
          label: t("landing.features.ads.disclosure3.label"),
          detail: t("landing.features.ads.disclosure3.detail"),
        },
      ]}
    >
      <AdsScreen />
    </FeatureSection>
  );
}

// ── Autoalojado ─────────────────────────────────────────────────────

/**
 * The six guarantees, as properties of one machine.
 *
 * They used to be six cards, each with its own drawing. Six drawings of six
 * things read as six products; what a buyer's technical person is actually
 * looking at is one install, so it is drawn once — `ServerBlueprint` — and the
 * guarantees are listed under it, each with the glyph it has in the drawing.
 *
 * Two entries here were true long before they were said: every inbound webhook
 * is verified by an HMAC over the raw body before it is parsed, and every
 * outbound call the agent makes is bounded by an allowlist that also refuses
 * loopback, private ranges and raw IPs.
 */
const STACK: readonly {
  readonly bodyKey: string;
  /** Keys the glyph in `GUARANTEE_ICONS`. */
  readonly id: string;
  readonly titleKey: string;
}[] = [
  {
    id: "database",
    bodyKey: "landing.selfHosted.database.body",
    titleKey: "landing.selfHosted.database.title",
  },
  {
    id: "sandbox",
    bodyKey: "landing.selfHosted.sandbox.body",
    titleKey: "landing.selfHosted.sandbox.title",
  },
  {
    id: "webhooks",
    bodyKey: "landing.selfHosted.webhooks.body",
    titleKey: "landing.selfHosted.webhooks.title",
  },
  {
    id: "keys",
    bodyKey: "landing.selfHosted.keys.body",
    titleKey: "landing.selfHosted.keys.title",
  },
  {
    id: "allowlist",
    bodyKey: "landing.selfHosted.allowlist.body",
    titleKey: "landing.selfHosted.allowlist.title",
  },
  {
    id: "traces",
    bodyKey: "landing.selfHosted.traces.body",
    titleKey: "landing.selfHosted.traces.title",
  },
];

export function SelfHostedSection() {
  const t = useT();

  return (
    <section id="autoalojado" className={`${styles.surface} ${styles.hosting} scroll-mt-20 border-border border-t py-24 sm:py-32`}>
      <Shell className={styles.hostingContent}>
        <div className={styles.hostingIntro}>
          <Reveal>
            <FigureLabel>Enterprise</FigureLabel>
            <TextReveal
              as="h2"
              className="mt-5 font-cooper text-[clamp(2.5rem,4.4vw,3.5rem)] leading-[1.12] tracking-[-0.03em]"
              text={[t("landing.selfHosted.titleLine1"), t("landing.selfHosted.titleLine2")]}
              whileInView
            />
            <p className="mt-6 max-w-[48ch] text-[15px] leading-relaxed text-muted-foreground">
              {t("landing.selfHosted.body")}
            </p>
          </Reveal>

          <Reveal lift={false} delay={80}>
            <figure className={styles.installation}>
              {/* The licence itself — the one thing Enterprise sells. It turns
                  over on click and does nothing else: a drag here would fight
                  the page's scroll. The numbers on it are a sample. */}
              <LicenseCreditCard
                className="w-full"
                flipOnly
                info={{
                  daysUntilMaintenanceEnds: null,
                  installationMatches: null,
                  maintenanceActive: true,
                  payload: {
                    company: t("landing.selfHosted.license.company"),
                    customerEmail: "",
                    deploymentType: "self-hosted",
                    edition: "enterprise",
                    features: [],
                    issuedAt: "2026-01-01T00:00:00.000Z",
                    licenseId: "5f3a9c2e-7b41-4d8a-9e06-c1d2b3a4f5e6",
                    maintenanceUntil: "2030-12-31T00:00:00.000Z",
                    schemaVersion: 1,
                  },
                  status: "valid",
                }}
                installationId="a3f9c1d0-77b2-4e58-9c31-6de0f28a4b17"
              />
              <figcaption className={styles.modelConnection}>
                <span>{t("landing.selfHosted.installation.connection")}</span>
                <div aria-hidden="true" className="mt-1 flex items-center gap-5">
                  {PROVIDERS.map((provider) => <span key={provider.label}>{provider.mark}</span>)}
                </div>
              </figcaption>
            </figure>
          </Reveal>
        </div>

        {/* One machine, then what it guarantees. The sheet is the same ruled
            plane the capability cards sit on, in the neutral ink. */}
        <Reveal lift={false}>
          <figure className={`${blueprint.sheet} ${styles.serverPlan}`} data-tone="neutral">
            <ServerBlueprint />
          </figure>
        </Reveal>

        <div className={styles.guarantees}>
          {STACK.map((item, index) => {
            const icon = GUARANTEE_ICONS[item.id];
            return (
              <Reveal key={item.id} delay={(index % 3) * 60}>
                <article className={styles.guarantee}>
                  {icon ? (
                    <HugeiconsIcon className="text-muted-foreground" icon={icon} size={18} strokeWidth={1.5} />
                  ) : null}
                  <h3 className="mt-3 text-[15px] font-medium tracking-tight">{t(item.titleKey)}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{t(item.bodyKey)}</p>
                </article>
              </Reveal>
            );
          })}
        </div>
      </Shell>
    </section>
  );
}
// The closing call to action used to live here as `ClosingSection`: a
// full-bleed band with a beam down its centre, sitting immediately above a
// footer that then said nothing. It is `ClosingPanel` in `landing-footer.tsx`
// now — one ending instead of two, and on every marketing page rather than
// only this one.
