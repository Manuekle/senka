"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  AlertCircleIcon,
  ArchiveArrowDownIcon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  Delete02Icon,
  FullSignalIcon,
  Mail02Icon,
  MoreHorizontalIcon,
  ReplyIcon,
  SmileIcon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import Image from "next/image";
import { useT } from "@/lib/i18n/provider";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

/**
 * Where the rendered email is shown: inside a phone, in a mail client, because
 * that is where it will be read. A bare desktop pane wide enough to make a
 * 560px email look comfortable told you nothing about the one place it
 * actually has to work — and neither does an email floating on a white
 * rectangle with no toolbar, no sender and no subject around it.
 *
 * The geometry below is measured off `public/frames/iphone17.png`, whose
 * screen area is a transparent cut-out. The client goes *behind* the frame
 * image, so the bezel supplies the rounded corners and the Dynamic Island
 * lands on top of the content the way it really does.
 */
const SCREEN = { left: 10.08, top: 10.04, width: 79.84, height: 79.93 };

/** The display's own corner radius, as a share of the frame box. The bezel
 *  covers these corners anyway, but its edge pixels are antialiased, and a
 *  square white corner behind them showed through as a bright speck. */
const SCREEN_RADIUS = "13.7% / 6.3%";

/** iPhone 17 in points. The client renders at this width and is scaled to
 *  whatever the pane can spare, so line breaks land where they would on the
 *  real thing rather than where the panel happens to be wide. */
const DEVICE = { width: 402, height: 874 };

/** How wide the frame is allowed to get in a tall, wide dock. Past this the
 *  phone stops looking like a phone and starts looking like a poster. */
const FRAME_MAX_WIDTH = 460;

/** The swap, in milliseconds. Out is short because nothing is worth watching
 *  yet; in is longer because the new email is. */
const FADE_OUT_MS = 130;
const FADE_IN_MS = 260;

/** iOS type, in points. Every size in the client comes from here rather than
 *  from a guess, which is most of why it reads as a phone and not as a
 *  small web page. */
const TYPE = {
  status: 16,
  title: 25,
  sender: 15.5,
  body: 13.5,
  chip: 11.5,
  action: 15,
} as const;

/** The two mail-client palettes. Not app tokens on purpose: this is somebody
 *  else's app, and it has to keep looking like it whatever our theme does. */
type Palette = {
  /** The screen behind everything, for the moment before the email paints. */
  readonly bg: string;
  /** Toolbars and the header block. */
  readonly chrome: string;
  /** The message well the email sits in. */
  readonly body: string;
  readonly text: string;
  readonly muted: string;
  readonly faint: string;
  readonly line: string;
  readonly control: string;
  /** iOS blue, the one colour in the client that isn't grey. */
  readonly tint: string;
};

const CLIENT: Record<"light" | "dark", Palette> = {
  light: {
    bg: "#ffffff",
    chrome: "#ffffff",
    body: "#f2f2f7",
    text: "#0b0b0c",
    muted: "#6c7076",
    faint: "#9ca1a8",
    line: "rgba(0,0,0,0.08)",
    control: "rgba(120,120,128,0.10)",
    tint: "#0a7cff",
  },
  dark: {
    bg: "#000000",
    chrome: "#0a0a0b",
    body: "#121215",
    text: "#f2f3f5",
    muted: "#9fa5ad",
    faint: "#71767e",
    line: "rgba(255,255,255,0.10)",
    control: "rgba(120,120,128,0.24)",
    tint: "#3a92ff",
  },
};

type PreviewPaneProps = {
  /** Rendered email, or null while there's nothing to show. */
  readonly html: string | null;
  /** The subject the template resolves to, shown as the message headline the
   *  way a mail client shows it. */
  readonly subject?: string | null;
  /** Who the email goes out as, for the sender row. */
  readonly from?: string | null;
  /** A template that doesn't compile — the message replaces the email. */
  readonly error?: string | null;
  /** No template picked yet. */
  readonly empty?: boolean;
};

export function PreviewPane({ html, subject, from, error, empty }: PreviewPaneProps) {
  const t = useT();
  // The phone follows the app's own theme. Two schemes matter for an email —
  // one with a background of its own, one without — but which one you're
  // looking at is already a decision you made for the whole app.
  const { theme } = useTheme();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
        <MicroLabel>{t("emailTemplates.preview")}</MicroLabel>
      </div>

      {/* No scrollbar here on purpose: the phone is measured to the space it
          has, so the preview is always one whole phone rather than a tall
          thing you have to scroll to see the bottom of. */}
      <div className="min-h-0 flex-1 overflow-hidden px-3 pb-5">
        {empty ? (
          <Placeholder title={t("emailTemplates.noTemplate")}>
            {t("emailTemplates.noTemplateHint")}
          </Placeholder>
        ) : error ? (
          <div className="flex max-h-full gap-2.5 overflow-y-auto rounded-xl border border-destructive/25 bg-destructive/5 px-3.5 py-3 scrollbar-hide">
            <HugeiconsIcon
              icon={AlertCircleIcon}
              size={15}
              strokeWidth={1.75}
              className="mt-px shrink-0 text-destructive"
            />
            <div className="min-w-0">
              <MicroLabel className="text-destructive/80">
                {t("emailTemplates.renderError")}
              </MicroLabel>
              <p className="mt-1 font-mono text-[11px] leading-relaxed break-words text-destructive">
                {error}
              </p>
            </div>
          </div>
        ) : html === null ? (
          <Placeholder title={t("emailTemplates.previewPending")}>
            {t("emailTemplates.previewPendingHint")}
          </Placeholder>
        ) : (
          <Phone
            html={html}
            scheme={theme}
            subject={subject ?? null}
            from={from ?? null}
          />
        )}
      </div>
    </div>
  );
}

function Phone({
  html,
  scheme,
  subject,
  from,
}: {
  readonly html: string;
  readonly scheme: "light" | "dark";
  readonly subject: string | null;
  readonly from: string | null;
}) {
  const t = useT();
  const stageRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [visible, setVisible] = useState(false);
  const sender = useMemo(() => parseSender(from), [from]);
  const palette = CLIENT[scheme];

  // The phone is sized to the space the dock has, not to its width alone.
  // Sizing by width made a tall phone the pane had to scroll — and a preview
  // whose bottom half you have to go looking for is not a preview.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const ratio = DEVICE.width / DEVICE.height;
      const width = Math.min(stage.clientWidth, stage.clientHeight * ratio, FRAME_MAX_WIDTH);
      setFrame({ width, height: width / ratio });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // And the client inside it renders at a real phone's width, scaled to
  // whatever the frame ended up being.
  useLayoutEffect(() => {
    const screen = screenRef.current;
    if (!screen) return;
    const measure = () => setScale(screen.clientWidth / DEVICE.width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(screen);
    return () => observer.disconnect();
  }, []);

  // The swap runs in two beats: fade the screen down, and only *then* hand the
  // iframe its new document. Parsing an email is main-thread work, and doing it
  // underneath a running transition is what made the change judder.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let observer: ResizeObserver | null = null;
    let frame = 0;
    let settle: number | undefined;

    setVisible(false);

    // The email is laid out at its full height and scrolled by the phone, so
    // the header above it scrolls away the way it does in Mail. That needs the
    // rendered height, remeasured as images and web fonts land — once per
    // frame at most, because a resize per image is a resize per layout.
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const root = iframe.contentDocument?.documentElement;
        if (!root) return;
        const next = Math.ceil(root.scrollHeight);
        // A tolerance, not vanity: the observer fires on the box we just
        // sized, and a 1px rounding difference would loop it forever.
        setContentHeight((prev) => (Math.abs(prev - next) > 1 ? next : prev));
      });
    };

    const onLoad = () => {
      measure();
      // A new email starts at its own top, not halfway down the last one.
      scrollRef.current?.scrollTo({ top: 0 });
      setVisible(true);
      // Late images and web fonts still resize the email — but only once the
      // fade is over, so nothing relayouts mid-transition.
      settle = window.setTimeout(() => {
        const root = iframe.contentDocument?.documentElement;
        if (!root) return;
        observer = new ResizeObserver(measure);
        observer.observe(root);
      }, FADE_IN_MS);
    };

    iframe.addEventListener("load", onLoad);
    const swap = window.setTimeout(() => {
      // `srcdoc`, not document.write. `allow-same-origin` is granted only so
      // the parent can read the rendered height and hand the iframe a box tall
      // enough for the whole email; `allow-scripts` stays off, so nothing in
      // the template ever runs and the shared origin buys it no reach into the
      // app. The appended rule kills the scrollbar the email would otherwise
      // draw down its own edge — the phone scrolls as one surface instead.
      iframe.srcdoc = `${html}<style>html{scrollbar-width:none}html::-webkit-scrollbar{display:none}</style>`;
    }, FADE_OUT_MS);

    return () => {
      iframe.removeEventListener("load", onLoad);
      observer?.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(swap);
      window.clearTimeout(settle);
    };
  }, [html]);

  return (
    <div ref={stageRef} className="flex h-full w-full items-center justify-center">
      <div
        className="relative"
        style={{
          width: frame.width || DEVICE.width,
          height: frame.height || DEVICE.height,
          // Before the first measure the frame is a full-size phone, which
          // would blow the pane open for a frame or two.
          visibility: frame.width > 0 ? "visible" : "hidden",
        }}
      >
      {/* Behind the frame image, clipped to the cut-out's rectangle. The
          bezel drawn on top rounds off the corners. */}
      <div
        ref={screenRef}
        className="absolute overflow-hidden"
        style={{
          left: `${SCREEN.left}%`,
          top: `${SCREEN.top}%`,
          width: `${SCREEN.width}%`,
          height: `${SCREEN.height}%`,
          borderRadius: SCREEN_RADIUS,
          backgroundColor: palette.bg,
        }}
      >
        {/* One scaled surface for the whole client, so every point size below
            is a real point size on a real phone. */}
        <div
          style={{
            width: DEVICE.width,
            height: DEVICE.height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            // Until the first measure lands, a full-size client would flash
            // at 402pt inside a ~250px screen.
            visibility: scale > 0 ? "visible" : "hidden",
            // The screen dims while the next email renders and comes back
            // when it has; the frame around it never flinches. `will-change`
            // is what keeps the fade on the compositor — without it the
            // browser repaints the iframe every frame of the transition.
            opacity: visible ? 1 : 0.35,
            transition: `opacity ${visible ? FADE_IN_MS : FADE_OUT_MS}ms var(--ease-expo-out)`,
            willChange: "opacity",
            display: "flex",
            flexDirection: "column",
            backgroundColor: palette.body,
            color: palette.text,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif',
            WebkitFontSmoothing: "antialiased",
            letterSpacing: "-0.01em",
          }}
        >
          {/* The bar the OS and the app own between them — status, the way
              back out to the inbox, and what you can do to the message — is
              the strip at the top that never moves. */}
          <div
            style={{
              position: "relative",
              zIndex: 2,
              flexShrink: 0,
              backgroundColor: palette.chrome,
            }}
          >
            <StatusBar palette={palette} />
            <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "0 10px" }}>
              <TapTarget>
                <HugeiconsIcon
                  icon={ArrowLeft01Icon}
                  size={26}
                  strokeWidth={1.8}
                  color={palette.tint}
                />
              </TapTarget>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "3px 9px 3px 7px",
                  borderRadius: 7,
                  backgroundColor: palette.control,
                  fontSize: TYPE.chip,
                  fontWeight: 500,
                  color: palette.muted,
                }}
              >
                <span
                  style={{
                    display: "block",
                    height: 5,
                    width: 5,
                    borderRadius: 999,
                    backgroundColor: palette.tint,
                  }}
                />
                {t("emailTemplates.mailInbox")}
              </span>
              <span style={{ flex: 1 }} />
              <TapTarget>
                <HugeiconsIcon
                  icon={ArchiveArrowDownIcon}
                  size={21}
                  strokeWidth={1.6}
                  color={palette.tint}
                />
              </TapTarget>
              <TapTarget>
                <HugeiconsIcon icon={Delete02Icon} size={21} strokeWidth={1.6} color={palette.tint} />
              </TapTarget>
              <TapTarget>
                <HugeiconsIcon icon={Mail02Icon} size={21} strokeWidth={1.6} color={palette.tint} />
              </TapTarget>
              <TapTarget>
                <HugeiconsIcon
                  icon={MoreHorizontalIcon}
                  size={21}
                  strokeWidth={1.6}
                  color={palette.tint}
                />
              </TapTarget>
            </div>
          </div>

          {/* Everything the message itself owns — subject, sender and the
              email — scrolls as one surface under the fixed bar, the way it
              does in Mail. Its own scrollbar stays hidden: a phone doesn't
              draw one. */}
          <div
            ref={scrollRef}
            className="scrollbar-hide"
            style={{
              display: "flex",
              flex: 1,
              minHeight: 0,
              flexDirection: "column",
              overflowX: "hidden",
              overflowY: "auto",
              // No rubber-banding: bouncing past the top flashed the well's
              // grey above a white header, which reads as a rendering bug.
              overscrollBehavior: "none",
              backgroundColor: palette.chrome,
            }}
          >
            {/* Subject and sender scroll away with the email, so a long one
                gets the whole screen. */}
            <div
              style={{
                position: "relative",
                zIndex: 1,
                flexShrink: 0,
                backgroundColor: palette.chrome,
                paddingBottom: 4,
                boxShadow: `0 1px 0 ${palette.line}`,
              }}
            >
              {/* Subject, exactly where a mail client puts it — which is why it
                  no longer needs a card of its own above the phone. */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 20px 0" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: TYPE.title,
                      lineHeight: 1.2,
                      fontWeight: 700,
                      letterSpacing: "-0.032em",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {subject || t("emailTemplates.mailNoSubject")}
                  </p>
                </div>
                <span style={{ paddingTop: 3 }}>
                  <HugeiconsIcon icon={StarIcon} size={21} strokeWidth={1.6} color={palette.faint} />
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "16px 20px 14px" }}>
                <div
                  style={{
                    display: "flex",
                    height: 40,
                    width: 40,
                    flexShrink: 0,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 999,
                    background: sender.gradient,
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22)",
                    color: "#ffffff",
                    fontSize: 17,
                    fontWeight: 600,
                    letterSpacing: 0,
                  }}
                >
                  {sender.initial}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: TYPE.sender,
                      fontWeight: 600,
                      letterSpacing: "-0.015em",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {sender.name}
                  </p>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      marginTop: 2,
                      fontSize: TYPE.body,
                      color: palette.muted,
                    }}
                  >
                    {t("emailTemplates.mailToMe")}
                    <HugeiconsIcon icon={ArrowDown01Icon} size={13} strokeWidth={2} />
                  </span>
                </div>
                <span style={{ fontSize: TYPE.body, color: palette.faint }}>
                  {t("emailTemplates.mailJustNow")}
                </span>
              </div>
            </div>

            {/* The email itself, as a sheet in the message well: inset, square,
                and running off the bottom edge under the action bar. A card
                closed on all four sides would end in a slab of empty white
                every time the email was shorter than the screen; a sheet just
                reads as more message below the fold. */}
            <div
              style={{
                display: "flex",
                // Grows to fill a short email, but never shrinks a long one:
                // past the screen the whole surface scrolls instead.
                flex: "1 0 auto",
                backgroundColor: palette.body,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flex: 1,
                  flexDirection: "column",
                  overflow: "hidden",
                  // What shows for the frame before the email paints, and
                  // behind an email shorter than the screen.
                  backgroundColor: scheme === "dark" ? "#050505" : "#ffffff",
                }}
              >
                <iframe
                  ref={iframeRef}
                  // No allow-scripts: an email is static markup, and this one
                  // may be code written a second ago. allow-same-origin only
                  // lets the parent read the rendered height — with scripting
                  // off, the template can do nothing with the shared origin.
                  sandbox="allow-same-origin"
                  title={t("emailTemplates.preview")}
                  // Laid out at its full rendered height so the phone, not the
                  // iframe, is what scrolls.
                  scrolling="no"
                  style={{
                    display: "block",
                    width: "100%",
                    flex: "1 0 auto",
                    height: contentHeight || "100%",
                    border: 0,
                    // An iframe's own `color-scheme` is what the embedded
                    // document's `prefers-color-scheme` resolves against, so
                    // this is what lets the phone preview the email's dark
                    // mode instead of always its light one.
                    colorScheme: scheme,
                  }}
                />
              </div>
            </div>
          </div>

          {/* The action bar sits over the sheet, the way it does when a long
              email is still scrolling underneath it. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexShrink: 0,
              padding: "12px 16px 6px",
              backgroundColor: palette.body,
              boxShadow: `0 -12px 20px -8px ${scheme === "dark" ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.10)"}`,
            }}
          >
            <ActionPill icon={ReplyIcon} label={t("emailTemplates.mailReply")} palette={palette} />
            <ActionPill
              icon={ReplyIcon}
              label={t("emailTemplates.mailForward")}
              palette={palette}
              flip
            />
            <span
              style={{
                display: "flex",
                height: 44,
                width: 44,
                flexShrink: 0,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                backgroundColor: palette.control,
                color: palette.muted,
              }}
            >
              <HugeiconsIcon icon={SmileIcon} size={19} strokeWidth={1.6} />
            </span>
          </div>

          {/* Home indicator. Small, and the single clearest tell that this is
              a phone and not a rounded rectangle. */}
          <div
            style={{
              display: "flex",
              height: 26,
              flexShrink: 0,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: palette.body,
            }}
          >
            <span
              style={{
                display: "block",
                height: 5,
                width: 140,
                borderRadius: 999,
                backgroundColor: palette.text,
                opacity: 0.32,
              }}
            />
          </div>
        </div>
      </div>

        {/* A fixed local frame, sized entirely by CSS; next/image adds nothing
            here beyond the bundled copy. */}
        <Image
          src="/frames/iphone17.png"
          alt=""
          aria-hidden
          draggable={false}
          width={1508}
          height={3278}
          className="pointer-events-none absolute inset-0 h-full w-full select-none"
          style={{ filter: "drop-shadow(0 22px 44px rgba(0,0,0,0.28))" }}
        />
      </div>
    </div>
  );
}

/** The status bar, minus the middle: the frame's Dynamic Island sits there. */
function StatusBar({ palette }: { readonly palette: Palette }) {
  return (
    <div
      style={{
        display: "flex",
        height: 54,
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 32px 0",
        fontSize: TYPE.status,
        fontWeight: 600,
        letterSpacing: "-0.02em",
      }}
    >
      {/* Apple's own screenshot time — a live clock would just be one more
          thing re-rendering behind a preview. */}
      <span>9:41</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6, color: palette.text }}>
        <HugeiconsIcon icon={FullSignalIcon} size={17} strokeWidth={2} />
        <WifiGlyph />
        <BatteryGlyph />
      </span>
    </div>
  );
}

/** The status bar's wifi and battery are drawn here rather than pulled from
 *  the icon set: the set's versions are stroked line icons, and next to a
 *  solid signal glyph they read as a different family. Both are solid, both
 *  inherit `currentColor`. */
function WifiGlyph() {
  return (
    <svg
      viewBox="0 0 100 100"
      width={17}
      height={17}
      fill="currentColor"
      aria-hidden
      focusable="false"
      style={{ display: "block" }}
    >
      <path d="M95.4,31.2C83.3,19.1,67.2,12.4,50,12.4c0,0,0,0,0,0c-17.2,0-33.3,6.7-45.4,18.8c-2.8,2.8-2.8,7.2,0,10c1.4,1.4,3.2,2.1,5,2.1s3.6-0.7,5-2.1C24,31.7,36.6,26.5,50,26.5c0,0,0,0,0,0c13.4,0,26,5.2,35.4,14.7c2.8,2.8,7.2,2.8,10,0C98.2,38.4,98.2,33.9,95.4,31.2z" />
      <path d="M23.4,50.1c-2.8,2.8-2.8,7.2,0,10c1.4,1.4,3.2,2.1,5,2.1c1.8,0,3.6-0.7,5-2.1c9.2-9.2,24.1-9.2,33.2-0.1c2.7,2.8,7.2,2.8,10,0c2.8-2.8,2.8-7.2,0-10C61.9,35.4,38.1,35.4,23.4,50.1z" />
      <circle cx="50.1" cy="76.6" r="11" />
    </svg>
  );
}

function BatteryGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={22}
      height={22}
      fill="currentColor"
      aria-hidden
      focusable="false"
      style={{ display: "block" }}
    >
      <path d="M8 18H16.5C16.9644 18 17.1966 18 17.3916 17.9743C18.7378 17.7971 19.7971 16.7378 19.9743 15.3916C20 15.1966 20 14.9644 20 14.5C21.1046 14.5 22 13.6046 22 12.5V11.5C22 10.3954 21.1046 9.5 20 9.5C20 9.03558 20 8.80337 19.9743 8.60842C19.7971 7.26222 18.7378 6.2029 17.3916 6.02567C17.1966 6 16.9644 6 16.5 6H8C5.17157 6 3.75736 6 2.87868 6.87868C2 7.75736 2 9.17157 2 12C2 14.8284 2 16.2426 2.87868 17.1213C3.75736 18 5.17157 18 8 18Z" />
    </svg>
  );
}

/** 44pt is the iOS tap target, and spacing the toolbar by tap target rather
 *  than by gap is what keeps the icons from bunching up. */
function TapTarget({ children }: { readonly children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "flex",
        height: 44,
        width: 44,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </span>
  );
}

function ActionPill({
  icon,
  label,
  palette,
  flip,
}: {
  readonly icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  readonly label: string;
  readonly palette: Palette;
  /** Mirrors the glyph horizontally — forward is the reply arrow the other
   *  way round, which is exactly how Mail draws it. */
  readonly flip?: boolean;
}) {
  return (
    <span
      style={{
        display: "flex",
        flex: 1,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        borderRadius: 999,
        backgroundColor: palette.control,
        fontSize: TYPE.action,
        fontWeight: 500,
        letterSpacing: "-0.015em",
        color: palette.text,
      }}
    >
      <HugeiconsIcon
        icon={icon}
        size={18}
        strokeWidth={1.7}
        style={flip ? { transform: "scaleX(-1)" } : undefined}
      />
      {label}
    </span>
  );
}

/** Avatar gradients, picked to read against white text in both schemes. */
const AVATAR_GRADIENTS = [
  "linear-gradient(145deg, #f97316, #c2410c)",
  "linear-gradient(145deg, #14b8a6, #0f766e)",
  "linear-gradient(145deg, #6366f1, #4338ca)",
  "linear-gradient(145deg, #f43f5e, #b91c1c)",
  "linear-gradient(145deg, #a855f7, #6d28d9)",
  "linear-gradient(145deg, #0ea5e9, #0369a1)",
];

/** `from` arrives either bare or as `Name <addr>`, and sometimes not at all —
 *  the preview still has to name somebody. */
function parseSender(from: string | null): {
  readonly name: string;
  readonly initial: string;
  readonly gradient: string;
} {
  const raw = from?.trim() ?? "";
  const angled = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  const display = angled?.[1]?.trim();
  const address = (angled?.[2] ?? raw).trim();
  const local = address.split("@")[0] ?? "";
  const name = display || (local ? local.charAt(0).toUpperCase() + local.slice(1) : "Senka");
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return {
    name,
    initial: (name.charAt(0) || "S").toUpperCase(),
    gradient: AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length],
  };
}

function Placeholder({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/25 px-8 text-center">
      <HugeiconsIcon icon={Mail02Icon} size={20} strokeWidth={1.5} className="text-muted-foreground" />
      <p className="text-[13px] font-medium">{title}</p>
      <p className="max-w-[34ch] text-[12px] leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

function MicroLabel({
  children,
  className,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}
