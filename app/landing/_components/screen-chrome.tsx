"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Add01Icon,
  ArrowDown01Icon,
  BellIcon,
  CustomerSupportIcon,
  Globe02Icon,
  Logout01Icon,
  Menu01Icon,
  Moon02Icon,
  PanelLeftCloseIcon,
  SearchIcon,
  VolumeOffIcon,
} from "@hugeicons/core-free-icons";
import { memo, type ReactNode } from "react";
import { NotificationBadge } from "@/components/ai-elements/notification-badge";
import { SenkaMark } from "@/components/icons/senka-mark";
import { NAV_GROUPS } from "@/lib/nav-items";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { Wordmark } from "./landing-header";

/**
 * The app's shell, rebuilt around the app's own parts.
 *
 * These are not screenshots and they are not lookalikes: the screens in
 * `screen-*.tsx` render the components the product renders — `Card`,
 * `KpiCard`, `SlidingTabs`, `FlowCanvas`, `ToolResult`, `Pagination` — arranged
 * the way the matching page arranges them, over a fixed demo dataset. Where the
 * app uses an outline `Button`, so do they, so a change to the button system
 * shows up here on the next build instead of drifting quietly.
 *
 * The sidebar goes further and reads `NAV_GROUPS` straight from
 * `lib/nav-items`, the same list the real sidebar and the command palette
 * share. Adding a page to the app adds it to these screens.
 *
 * Every string here runs through `useT()`, the same dictionary the rest of
 * the app reads — the landing used to pin this subtree to Spanish, but the
 * mockups now follow whatever locale the visitor has chosen, same as
 * everything else on the page.
 */

// ── Sidebar ─────────────────────────────────────────────────────────

/** Counts the real sidebar derives from live data. Fixed here so the demo
 *  agrees with the numbers the screens themselves show — six contacts
 *  parked on the inbox, eighteen conversations touched in the last hour. */
const NAV_BADGES: Record<string, number> = { "/history": 18, "/inbox": 6 };

/**
 * The app's sidebar, down to the parts that are easy to leave out and are
 * exactly what makes a fake look fake: the collapse control in the header, the
 * ⌘K row under the new-chat button, the group headings over the nav, the
 * badges on the two rows that carry them, and the whole footer stack —
 * notifications, support, the three preference toggles, and the health dot
 * with its halo.
 *
 * Below `md` it is dropped rather than squeezed, which is what the real shell
 * does at the same breakpoint.
 */
export const MockSidebar = memo(function MockSidebar({ active }: { readonly active: string }) {
  const t = useT();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-border border-r bg-card/50 backdrop-blur-sm md:flex">
      <div className="flex h-14 shrink-0 items-center gap-2.5 px-5">
        <Wordmark />
        <span className="-mr-1 ml-auto flex size-8 items-center justify-center rounded-lg text-muted-foreground">
          <HugeiconsIcon icon={PanelLeftCloseIcon} size={16} strokeWidth={1.75} />
        </span>
      </div>

      <div className="flex shrink-0 px-3 pb-2">
        <span className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 text-left">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold uppercase shadow-[var(--shadow-inset)]">
            {(t("business.unnamed") || "M").slice(0, 1)}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{t("business.unnamed")}</span>
          <HugeiconsIcon icon={ArrowDown01Icon} size={13} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
        </span>
      </div>

      <div className="flex shrink-0 flex-col gap-1.5 px-3 pb-2">
        <span className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground text-sm shadow-[var(--shadow-button)]">
          <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} className="shrink-0" />
          {t("nav.newChat")}
        </span>
        <span className="flex w-full items-center gap-2 rounded-lg border border-border bg-card/60 px-2.5 py-1.5 text-muted-foreground text-xs">
          <HugeiconsIcon icon={SearchIcon} size={14} strokeWidth={1.75} className="shrink-0" />
          <span className="flex-1 text-left">{t("nav.search")}</span>
          <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </span>
      </div>

      {/* `overflow-y-auto scrollbar-hide`, the real sidebar's own class. The
          list is twenty-two rows under six headings and the window is 608px
          tall, so it was always going to be cut — `overflow-hidden` cut it
          without saying so, which reads as a nav that stops at "CRM". A scroll
          region cut at the same place reads as a list with more below it,
          which is what the app shows at this height. */}
      <nav className="scrollbar-hide flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.id} className={cn("flex flex-col gap-1", groupIndex > 0 && "mt-3")}>
            {group.labelKey ? (
              <p className="px-3 pb-1 font-medium text-[11px] text-muted-foreground">
                {t(group.labelKey)}
              </p>
            ) : null}
            {group.items.map((item) => (
              <span
                key={item.href}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-sm",
                  item.href === active
                    ? "bg-muted text-foreground shadow-[var(--shadow-inset)]"
                    : "text-muted-foreground",
                )}
              >
                <HugeiconsIcon icon={item.icon} size={16} strokeWidth={1.75} className="shrink-0" />
                {t(item.labelKey)}
                {NAV_BADGES[item.href] ? <NotificationBadge count={NAV_BADGES[item.href]} /> : null}
              </span>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-border border-t p-3">
        <span className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 font-medium text-muted-foreground text-xs">
          <HugeiconsIcon icon={BellIcon} size={14} strokeWidth={1.75} className="shrink-0" />
          {t("notifications.title")}
        </span>
        <span className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 font-medium text-muted-foreground text-xs">
          <HugeiconsIcon icon={CustomerSupportIcon} size={14} strokeWidth={1.75} className="shrink-0" />
          {t("support.open")}
        </span>

        <div className="mt-1 flex items-center gap-0.5 border-border border-t pt-2">
          <span className="flex size-8 items-center justify-center rounded-lg text-muted-foreground">
            <HugeiconsIcon icon={Moon02Icon} size={16} strokeWidth={1.75} />
          </span>
          <span className="flex size-8 items-center justify-center rounded-lg text-muted-foreground">
            <HugeiconsIcon icon={VolumeOffIcon} size={16} strokeWidth={1.75} />
          </span>
          <span className="flex size-8 items-center justify-center rounded-lg text-muted-foreground">
            <HugeiconsIcon icon={Globe02Icon} size={16} strokeWidth={1.75} />
          </span>
          <span className="flex size-8 items-center justify-center rounded-lg text-muted-foreground">
            <HugeiconsIcon icon={Logout01Icon} size={14} strokeWidth={1.75} />
          </span>
        </div>

        {/* The dot is the tell that the instance is answering — `SidebarStatus`
            only paints it while health reads `ok`, so leaving it off made every
            screen look like a box that had stopped reporting.

            It used to pulse, and the pulse cost the page half its frame rate.
            This row sits at the foot of the sidebar, which is under the frame's
            veil — five stacked `backdrop-filter` layers. A backdrop blur
            re-computes whenever anything behind it changes, so a 6px halo
            animating forever re-blurred the whole veil every frame: 60fps at
            rest became 20, on a dot the blur had already smeared into nothing.
            An invisible animation is not worth a third of the budget. */}
        <div className="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-muted-foreground text-xs">
          <span className="relative flex size-1.5 shrink-0">
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
          </span>
          {/* `environmentLabel` in the real sidebar is `process.env`'s own
              word, capitalised — always English, never translated. This
              mirrors that rather than inventing a Spanish "Producción" the
              product itself never shows. */}
          {t("nav.selfhosted", { environment: "Production" })}
        </div>
      </div>
    </aside>
  );
});

// ── Mobile bar ──────────────────────────────────────────────────────

/**
 * What the shell shows where the sidebar is not: the 56px bar with the
 * wordmark and the menu button, from `app-shell.tsx`.
 *
 * The mockups dropped the sidebar below `md` and put nothing in its place, so
 * on a phone every screen opened with the page header and no product around
 * it — a screenshot of a document rather than of an app. The real shell has a
 * bar there, and the badge on its button is the two sidebar badges added
 * together, which is what the shell does when the nav it would show is closed.
 *
 * Matches the `MobileNav` bar in `app-shell.tsx` exactly: the `SenkaMark`
 * metal + `text-[20px] font-medium` wordmark on the left, the hamburger
 * button on the right with the same sizing and colour as the real bar.
 */
export const MockTopBar = memo(function MockTopBar() {
  const t = useT();
  const total = Object.values(NAV_BADGES).reduce((sum, count) => sum + count, 0);

  return (
    <div className="relative flex h-14 shrink-0 items-center justify-between px-4 md:hidden">
      {/* Frost layer — same as the real bar's `.app-nav-blur` */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 border-border border-b bg-card/85 backdrop-blur-md"
      />
      {/* Wordmark — identical lockup to MobileNav in app-shell */}
      <div className="relative flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center">
          <SenkaMark metal className="block h-[20px] w-auto" />
        </span>
        <span className="text-[20px] font-medium leading-none tracking-tighter text-foreground">
          senka
        </span>
      </div>
      {/* Hamburger button — same sizing, colour and badge as the real bar */}
      <span
        aria-label={t("nav.menu")}
        className="relative -mr-1 inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground"
      >
        <HugeiconsIcon icon={Menu01Icon} size={18} strokeWidth={1.75} />
        {total > 0 ? <NotificationBadge count={total} /> : null}
      </span>
    </div>
  );
});

// ── Page chrome ─────────────────────────────────────────────────────

/**
 * Sidebar plus the page body. `title` renders the standard page header every
 * screen except the two workspaces — the chat and the flow editor lay out
 * their own 56px bar and have no page container at all.
 *
 * `actions` is the right-hand side of that header. Every page in the app has
 * one; a header that is only a heading is the shape none of them have.
 */
export function AppChrome({
  actions,
  active,
  children,
  overlay,
  pattern = false,
  subtitle,
  title,
}: {
  readonly actions?: ReactNode;
  readonly active: string;
  readonly children: ReactNode;
  /**
   * Anything that covers the whole window in the app rather than the page
   * body: a dialog and its scrim. It goes here and not inside `children`
   * because a scrim that stops at the sidebar is the giveaway that a mockup's
   * dialog is a drawing of a dialog — the app dims the shell too.
   */
  readonly overlay?: ReactNode;
  /**
   * The hairline grid `PageContainer` paints behind a page body. Off by
   * default: on the landing it only earns its keep once, in the hero, where
   * there is nothing else on the screen for the eye to hold. Repeated under
   * every figure below it stops reading as texture and starts reading as
   * noise stacked behind data — five patterned rectangles down one page is
   * the thing that made the page look cheap rather than made.
   */
  readonly pattern?: boolean;
  readonly subtitle?: string;
  readonly title?: string;
}) {
  return (
    /* A window, not a document. Left to grow, the shell took the height of
       its own sidebar: 1263px of app inside a 1162px-wide frame, a portrait
       rectangle that reads as a long page rather than as a screen. So the
       height is fixed and the frame clips, sidebar included — a window shows
       what fits and the rest is below its fold, and the veil under every
       frame already washes the cut. */
    <div className="relative flex h-[38rem] overflow-hidden bg-background text-foreground lg:h-[42rem]">
      <MockSidebar active={active} />

      <div className="flex min-w-0 flex-1 flex-col">
        <MockTopBar />

        {/* The pattern gets its own layer, as it does in PageContainer:
            `bg-pattern-fade` is a mask, and a mask on the content wrapper fades
            the content with it. Below the bar, not behind it — in the app the
            pattern belongs to the page, and the shell's bar sits above it. */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {pattern ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-pattern bg-pattern-grid bg-pattern-fade opacity-30"
            />
          ) : null}
          {title ? (
            <div className="relative mx-auto w-full max-w-6xl px-5 py-8 sm:px-6 sm:py-10">
              {/* `flex-wrap` on the row and `min-w-0` on the heading: the
                  actions are a filter `Select`, a status pill and a button,
                  and at 390px they were being crushed into the title rather
                  than dropping under it. */}
              <header className="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <div className="min-w-0">
                  {/* A <p>, not an <h1>. This frame is a product mockup that
                      the landing renders three times, so it contributed three
                      page-level headings to the real document outline — a screen
                      reader navigating by heading found six <h1> on one page.
                      aria-hidden was not an option: these mockups are deliberately
                      interactive, and hiding focusable content from the
                      accessibility tree is worse than the heading noise. */}
                  <h2 className="font-semibold text-2xl">{title}</h2>
                  {subtitle ? (
                    <p className="mt-1 text-muted-foreground text-sm">{subtitle}</p>
                  ) : null}
                </div>
                {actions}
              </header>
              {children}
            </div>
          ) : (
            <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
          )}
        </div>
      </div>

      {overlay}
    </div>
  );
}

/**
 * The bordered `bg-card` button the app uses for every secondary page action —
 * export CSV, new contact, new chat. It is an anchor in the product and a
 * `<span>` here: these are the controls in the demo that would have to
 * navigate somewhere real, and a dead link is worse than a label.
 *
 * The two pages differ below `sm` and the difference is deliberate in both:
 * the dashboard drops its "New chat" button entirely, the inbox keeps its two
 * as bare icons. `labelBelowSm` picks which.
 */
export function HeaderAction({
  children,
  icon,
  labelBelowSm = false,
}: {
  readonly children: ReactNode;
  readonly icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  /** Keep the button on a phone and hide only its label, as the inbox does. */
  readonly labelBelowSm?: boolean;
}) {
  return (
    <span
      className={cn(
        "items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 font-medium text-sm shadow-[var(--shadow-inset)] transition duration-150 hover:border-input hover:bg-accent",
        labelBelowSm ? "inline-flex" : "hidden sm:inline-flex",
      )}
    >
      <HugeiconsIcon icon={icon} size={16} strokeWidth={1.75} />
      <span className={cn(labelBelowSm && "hidden sm:inline")}>{children}</span>
    </span>
  );
}
