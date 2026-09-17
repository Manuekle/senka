"use client";

import { HugeiconsIcon, type IconSvgElement } from "@/components/icons/icon";
import {
  Add01Icon,
  ArrowLeft01Icon,
  ArrowReloadHorizontalIcon,
  ArrowRight01Icon,
  Copy01Icon,
  Download03Icon,
  Share03Icon,
  Shield01Icon,
  SidebarLeft01Icon,
} from "@hugeicons/core-free-icons";

/**
 * The browser toolbar every screen on this page now sits under.
 *
 * The frame around these mockups already read as a window, but as an
 * unlabelled one — a rounded rectangle with an app inside it, which is the
 * shape a design mockup has, not the shape a running product has. A toolbar
 * with an address in it says the thing in the picture is a page someone
 * loaded.
 *
 * The address is the argument. Every one of them is `localhost:3000`, because
 * that is where this software runs: the section three screens down claims the
 * whole app lives on your own machine, and this is that claim stated five
 * times in the one place a reader checks it without being asked to.
 *
 * Decoration throughout — `aria-hidden`, and inert anyway inside the frame's
 * `pointer-events-none`. A screen reader gets the frame's own label and skips
 * a toolbar that does nothing.
 */

/** One toolbar glyph. They are all the same weight and the same grey. */
function Glyph({ icon, size = 15 }: { readonly icon: IconSvgElement; readonly size?: number }) {
  return (
    <HugeiconsIcon
      className="shrink-0 text-muted-foreground"
      icon={icon}
      size={size}
      strokeWidth={1.75}
    />
  );
}

/* macOS' own window-control colours. They are the one place on this page with
   a hue, and they earn it: three grey dots in that corner do not read as a
   window, they read as a menu. */
const LIGHTS = ["#ff5f57", "#febc2e", "#28c840"] as const;

export function BrowserChrome({ url, variant = "full" }: {
  readonly variant?: "full";
  readonly url: string;
} | {
  readonly variant: "minimal";
  readonly url?: never;
}) {
  return (
    <div
      aria-hidden="true"
      className="flex h-11 shrink-0 items-center gap-2 border-border border-b bg-card px-4 sm:gap-3"
    >
      <span className="flex shrink-0 items-center gap-2">
        {LIGHTS.map((colour) => (
          <span
            className="size-[11px] rounded-full"
            key={colour}
            style={{ backgroundColor: colour }}
          />
        ))}
      </span>

      {variant === "full" ? <>
      {/* The window controls are the only part small screens keep. Below `sm`
          the frame is ~330px wide and a full toolbar would leave the address
          — the one part that says anything — about forty pixels. */}
      <span className="ml-2 hidden items-center gap-3 sm:flex">
        <Glyph icon={SidebarLeft01Icon} size={16} />
        <span className="flex items-center gap-2.5">
          <Glyph icon={ArrowLeft01Icon} />
          <HugeiconsIcon
            className="shrink-0 text-muted-foreground"
            icon={ArrowRight01Icon}
            size={15}
            strokeWidth={1.75}
          />
        </span>
      </span>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-2.5">
        <span className="hidden sm:block">
          <Glyph icon={Shield01Icon} size={14} />
        </span>
        <div className="flex h-7 min-w-0 max-w-[420px] flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 shadow-[var(--shadow-inset)]">
          <span className="min-w-0 flex-1 truncate text-center text-[12px] text-muted-foreground">
            {url}
          </span>
          <Glyph icon={ArrowReloadHorizontalIcon} size={13} />
        </div>
      </div>

      <span className="ml-2 hidden items-center gap-3.5 md:flex">
        <Glyph icon={Download03Icon} />
        <Glyph icon={Share03Icon} />
        <Glyph icon={Add01Icon} />
        <Glyph icon={Copy01Icon} />
      </span>
      </> : null}
    </div>
  );
}
