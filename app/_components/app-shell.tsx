"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Menu01Icon,
  Cancel01Icon,
  PanelLeftCloseIcon,
  PanelLeftIcon,
  Add01Icon,
} from "@hugeicons/core-free-icons";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActionSwapIcon } from "@/components/motion/action-swap";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { useSound } from "@/components/sound-provider";
import { SoundToggle } from "@/components/sound-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { SenkaMark } from "@/components/icons/senka-mark";
import { NotificationBadge } from "@/components/ai-elements/notification-badge";
import { SidebarNotifications } from "@/components/ai-elements/sidebar-notifications";
import { SidebarStatus } from "@/components/ai-elements/sidebar-status";
import { SupportDialog } from "@/components/ai-elements/support-dialog";
import { CommandPalette } from "@/components/ai-elements/command-palette";
import { BusinessSwitcher } from "./business-switcher";
import { ReviewPrompt } from "./review-prompt";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getChats } from "@/lib/dashboard-store";
import { NAV_GROUPS, NAV_ITEMS, type NavItem } from "@/lib/nav-items";
import { useT } from "@/lib/i18n/provider";
import { usePolling } from "@/lib/use-polling";
import { cn } from "@/lib/utils";

const COLLAPSED_KEY = "senka:sidebar-collapsed";

export function AppShell({ children }: { readonly children: ReactNode }) {
  const t = useT();
  // The shell lives in the `(app)` layout, so it mounts once and survives
  // navigation: the active route has to come from the router, not a prop.
  const activePath = usePathname();
  const { cue } = useSound();
  const [chatBadge, setChatBadge] = useState(0);
  const [inboxBadge, setInboxBadge] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // La preferencia vive en localStorage, que el servidor no tiene: se lee
  // después de montar para que el HTML del SSR coincida con el cliente.
  // En pantallas pequeñas (< 1024px) el sidebar arranca colapsado por defecto
  // si el usuario nunca ha guardado una preferencia explícita.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_KEY);
      if (stored !== null) {
        setCollapsed(stored === "1");
      } else {
        // Sin preferencia guardada: colapsar en pantallas menores a lg (1024px)
        const isMobileOrTablet = window.matchMedia("(max-width: 1023px)").matches;
        setCollapsed(isMobileOrTablet);
      }
    } catch {
      // Best-effort.
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Best-effort.
      }
      return next;
    });
  };

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [activePath]);

  // `arrival` marks landing on a new route, but only for client-side ones.
  //
  // The first pass is the page you already loaded, and a browser blocks audio
  // on a fresh visit anyway — cueing it would either play nothing or play a
  // sound nobody asked for on arriving at the app.
  //
  // It remembers the path rather than a "have I run before" flag: an effect
  // re-run that is not a navigation — StrictMode's double invoke in dev, a
  // changed `cue` identity — would satisfy a boolean and ring on a route
  // nobody moved to.
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    if (lastPath.current !== null && lastPath.current !== activePath) cue("arrival");
    lastPath.current = activePath;
  }, [activePath, cue]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen]);

  /** Ids already counted in the inbox badge, so a refresh can tell an arrival
   *  from a re-read. `null` until the first response lands: that one seeds the
   *  set and stays silent, because the queue you had when you opened the app
   *  is not news. */
  const knownWaitingIds = useRef<Set<string> | null>(null);

  const refreshBadges = useCallback(() => {
    try {
      const chats = getChats();
      const active = chats.filter(
        (c) => Date.now() - new Date(c.lastMessageAt).getTime() < 60 * 60 * 1000,
      ).length;
      setChatBadge(active);
    } catch {
      // Dashboard store may not be available
    }
    void fetch("/api/contacts")
      // An error body is still JSON: without the `ok` check its missing
      // `contacts` key would clear the badge and claim nothing is waiting.
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { contacts?: Array<{ id: string; status: string }> }) => {
        const waiting = (data.contacts ?? []).filter(
          (c) => c.status === "waiting_human" || c.status === "followup_due",
        );
        // Ids, not the count: one handoff resolved while another arrives
        // leaves the number identical, and a notification you only get when
        // the total happens to move is worse than none.
        //
        // The badge is the only thing in the shell that knows someone started
        // waiting, and the shell is the only thing mounted on every route —
        // so this is where the bell belongs, not on the inbox page you would
        // have to already be looking at.
        const seen = knownWaitingIds.current;
        if (seen && waiting.some((c) => !seen.has(c.id))) cue("chime");
        knownWaitingIds.current = new Set(waiting.map((c) => c.id));
        setInboxBadge(waiting.length);
      })
      .catch(() => {
        // Inbox badge is optional
      });
  }, [cue]);

  // Was a mount-only effect, which meant the badge could only ever be as fresh
  // as the last full page load — and a badge that never moves cannot announce
  // anything. Same 30s cadence the inbox, chats and dashboard pages already use.
  usePolling(refreshBadges, 30_000);

  /** Nested routes light up their section: /crm/leads marks /crm, and
   *  /agents/x/voice marks /agents. */
  const isActivePath = (href: string): boolean =>
    activePath === href || activePath.startsWith(`${href}/`) ||
    (href === "/crm" && (activePath === "/leads" || activePath.startsWith("/leads/")));

  /** Badges live here, not in the shared nav list, because they're runtime
   *  state — the palette has no use for them. */
  const badgeFor = (href: string): number =>
    href === "/history" ? chatBadge : href === "/inbox" ? inboxBadge : 0;

  /** One nav row. Expanded it carries its own label, so the tooltip only
   *  appears when the sidebar is icons-only. */
  const renderNavItem = (item: NavItem) => {
    const isActive = isActivePath(item.href);
    const badgeCount = badgeFor(item.href);
    // A crisp tick on nav hover, a knock on press — the two places the
    // cuelume guide says sound actually earns its keep.
    const cueAttrs = { "data-cuelume-hover": "tick", "data-cuelume-press": "" } as const;
    const linkClassName = cn(
      "app-sidebar-link relative flex items-center rounded-lg py-2 text-sm font-medium",
      isActive
        ? "bg-muted text-foreground shadow-[var(--shadow-inset)]"
        : "text-muted-foreground hover:bg-accent hover:text-foreground",
    );
    const linkContent = (
      <>
        <HugeiconsIcon icon={item.icon} size={16} strokeWidth={1.75} className="shrink-0" />
        <span className="app-sidebar-label" aria-hidden={collapsed}>{t(item.labelKey)}</span>
        {badgeCount ? <NotificationBadge count={badgeCount} /> : null}
      </>
    );

    return (
      <Tooltip key={item.href}>
        <TooltipTrigger asChild>
          {/* Icon-only here, so the accessible name has to come from
              aria-label — there's no visible text for it to read. */}
          <Link href={item.href} aria-current={isActive ? "page" : undefined} aria-label={t(item.labelKey)} className={linkClassName} {...cueAttrs}>
            {linkContent}
          </Link>
        </TooltipTrigger>
        {collapsed ? <TooltipContent side="right">{t(item.labelKey)}</TooltipContent> : null}
      </Tooltip>
    );
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      {/* First thing the keyboard reaches, visible only once focused. Without
          it, reaching page content meant tabbing through the whole sidebar —
          around twenty links — on every single navigation. WCAG 2.4.1. */}
      <a
        href="#main-content"
        className={cn(
          "sr-only focus:not-sr-only",
          "focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg",
          "focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium",
          "focus:text-primary-foreground focus:shadow-[var(--shadow-button)]",
        )}
      >
        {t("nav.skipToContent")}
      </a>

      {/* Sidebar */}
      <aside
        data-collapsed={collapsed}
        className={cn(
          "app-sidebar hidden shrink-0 flex-col overflow-hidden border-r border-border bg-card/50 backdrop-blur-sm md:flex",
          collapsed ? "w-[60px]" : "w-60",
        )}
      >
        <div className="app-sidebar-header relative flex h-14 shrink-0 items-center px-5">
            <div className="app-sidebar-brand flex items-center gap-2" aria-hidden={collapsed}>
              {/* Same lockup as the landing `Wordmark`: 20px mark in a fixed
                  box, 20px `font-medium` word. */}
              <span className="flex size-8 shrink-0 items-center justify-center">
                <SenkaMark metal className="block h-[20px] w-auto" />
              </span>
              <span className="text-[20px] font-medium leading-none tracking-tighter text-foreground">
                senka
              </span>
            </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
                aria-expanded={!collapsed}
                className={cn(
                  "app-sidebar-toggle absolute flex size-8 items-center justify-center rounded-lg text-muted-foreground",
                  "transition-colors duration-150 hover:bg-accent hover:text-foreground",

                )}
              >
                <ActionSwapIcon value={collapsed ? "collapsed" : "expanded"}>
                  <HugeiconsIcon icon={collapsed ? PanelLeftIcon : PanelLeftCloseIcon} size={16} strokeWidth={1.75} />
                </ActionSwapIcon>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? t("nav.expand") : t("nav.collapse")}</TooltipContent>
          </Tooltip>
        </div>

        {/* Which business everything below belongs to. First, and above the
            navigation, because it is the frame around it: the inbox, the
            contacts and the agents on every page under here are this
            business's and nobody else's. */}
        <div className={cn("shrink-0 pb-2", collapsed ? "flex justify-center px-2" : "px-3")}>
          <BusinessSwitcher collapsed={collapsed} />
        </div>

        {/* The two things you reach for before navigating anywhere: starting a
            conversation, and jumping straight to a page by name. */}
        <div className={cn("flex shrink-0 flex-col gap-1.5 pb-2", collapsed ? "items-center px-2" : "px-3")}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/chat"
                aria-label={t("nav.newChat")}
                data-cuelume-press
                className={cn(
                  "app-sidebar-link flex items-center rounded-lg bg-primary text-sm font-medium text-primary-foreground",
                  "shadow-[var(--shadow-button)] transition-transform duration-150 active:scale-[0.98]",
                  "h-9 w-full",
                )}
              >
                <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} className="shrink-0" />
                <span className="app-sidebar-label" aria-hidden={collapsed}>{t("nav.newChat")}</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{t("nav.newChat")}</TooltipContent>
          </Tooltip>
          <CommandPalette collapsed={collapsed} />
        </div>

        <nav className={cn("app-sidebar-nav flex flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto py-2 scrollbar-hide")}>
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.id} className={cn("flex flex-col gap-1", groupIndex > 0 && "mt-3")}>
              {/* Collapsed to icons there is no room for a heading, so the
                  groups are separated by a rule instead. */}
              {group.labelKey ? (
                <div className="app-sidebar-group relative" aria-hidden={collapsed}>
                  <p className="app-sidebar-label px-3 pb-1 text-[11px] font-medium text-muted-foreground">
                    {t(group.labelKey)}
                  </p>
                  <span aria-hidden="true" className="app-sidebar-divider absolute left-1/2 top-1/2 h-px w-5 -translate-x-1/2 bg-border" />
                </div>
              ) : null}
              {group.items.map((item) => renderNavItem(item))}
            </div>
          ))}
        </nav>

        <div className={cn("border-t border-border", collapsed ? "flex flex-col items-center gap-1 p-2" : "p-3")}>
          {/* Things that need doing, and where to go when something breaks —
              both above the preferences, which are set once and forgotten. */}
          <SidebarNotifications collapsed={collapsed} className={collapsed ? undefined : "w-full"} />
          <SupportDialog collapsed={collapsed} className={collapsed ? undefined : "w-full"} />

          {/* Preferences: icon-only in a single row when expanded. Three
              full-width rows for switches nobody touches twice made the foot
              of the sidebar heavier than the navigation above it. */}
          <div
            className={cn(
              "flex",
              collapsed ? "flex-col items-center gap-1" : "mt-1 items-center gap-0.5 border-t border-border pt-2",
            )}
          >
            <ThemeToggle className="size-8 justify-center p-0" showLabel={false} />
            <SoundToggle className="size-8 justify-center p-0" showLabel={false} />
            <LanguageToggle className="size-8 justify-center p-0" showLabel={false} />
            <SignOutButton className="size-8 justify-center p-0" showLabel={false} />
          </div>

          <SidebarStatus collapsed={collapsed} />
        </div>
      </aside>

      {/* ── Mobile top bar + drawer nav ─────────────────────────────── */}
      {/* Same mechanism as the landing's mobile menu: a frost layer covers
          both the bar and the open drawer as one continuous surface; the
          drawer is a clipping box whose height is CSS-animated; items stagger
          in behind the opening edge. No separate background panel — no seam. */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileNav
          chatBadge={chatBadge}
          inboxBadge={inboxBadge}
          isActivePath={isActivePath}
          badgeFor={badgeFor}
          mobileMenuOpen={mobileMenuOpen}
          setMobileMenuOpen={setMobileMenuOpen}
          t={t}
        />
        {/* The one landmark every signed-in page lacked. Screen-reader users
            had no "jump to main" target, and the skip link above needs
            something to land on. `tabIndex={-1}` makes it focusable by that
            link without adding it to the tab order; `outline-none` keeps the
            focus ring off a region the size of the page. */}
        <main
          id="main-content"
          tabIndex={-1}
          className="relative flex flex-1 flex-col overflow-hidden outline-none"
        >
          {children}
        </main>
      </div>
      {/* Mounted with the shell rather than a page, so the cadence is checked
          once per visit to the app wherever it starts. */}
      <ReviewPrompt />
    </div>
  );
}

// ── MobileNav ──────────────────────────────────────────────────────────────

/**
 * The product's mobile top bar + drawer nav.
 *
 * Follows the same pattern as the landing's `LandingHeader`:
 * - A frost layer (`.app-nav-blur`) covers both the bar and the open drawer
 *   as one continuous surface — no hard seam.
 * - The drawer (`.app-nav-drawer`) is a clipping box whose height is animated
 *   by CSS from 0 to `--app-nav-h`, measured by a ResizeObserver on the inner
 *   content element (identical to the `--lp-menu-h` mechanism).
 * - Items stagger in behind the opening edge using the `--i` CSS variable.
 * - `inert` when closed: no tab stop, no screen reader reach.
 */
function MobileNav({
  chatBadge,
  inboxBadge,
  isActivePath,
  badgeFor,
  mobileMenuOpen,
  setMobileMenuOpen,
  t,
}: {
  readonly chatBadge: number;
  readonly inboxBadge: number;
  readonly isActivePath: (href: string) => boolean;
  readonly badgeFor: (href: string) => number;
  readonly mobileMenuOpen: boolean;
  readonly setMobileMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  readonly t: ReturnType<typeof import("@/lib/i18n/provider").useT>;
}) {
  const navRef = useRef<HTMLDivElement>(null);
  const drawerInnerRef = useRef<HTMLDivElement>(null);

  // Publish the drawer's natural height to `--app-nav-h` so the CSS
  // transition knows where to animate to. Identical mechanism to the
  // landing's `--lp-menu-h` / ResizeObserver pair.
  const measureDrawer = useCallback(() => {
    const nav = navRef.current;
    const inner = drawerInnerRef.current;
    if (!nav || !inner) return;
    const h = inner.getBoundingClientRect().height;
    if (h > 0) nav.style.setProperty("--app-nav-h", `${h}px`);
  }, []);

  useEffect(() => {
    measureDrawer();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureDrawer);
    if (drawerInnerRef.current) observer.observe(drawerInnerRef.current);
    return () => observer.disconnect();
  }, [measureDrawer]);

  const openMenu = () => {
    measureDrawer();
    setMobileMenuOpen(true);
  };

  const closeMenu = useCallback(() => setMobileMenuOpen(false), [setMobileMenuOpen]);

  // Close when viewport becomes desktop-wide (md = 768px).
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => { if (mq.matches) closeMenu(); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [closeMenu]);

  // Flatten all nav items in order: main items first.
  const allItems = NAV_ITEMS;

  // Count how many items are above the footer section for stagger index.
  // +3 for: business switcher, command palette, new chat button
  const footerOffset = allItems.length + 3;

  return (
    <div
      ref={navRef}
      className="app-nav md:hidden"
      data-open={mobileMenuOpen || undefined}
    >
      {/* Frost / tint layer — covers bar + drawer as one surface */}
      <div aria-hidden="true" className="app-nav-blur" />

      {/* Top bar */}
      <div className="relative flex h-14 items-center justify-between px-4">
        {/* Wordmark — same lockup as desktop + landing */}
        <div className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center">
            <SenkaMark metal className="block h-[20px] w-auto" />
          </span>
          <span className="text-[20px] font-medium leading-none tracking-tighter text-foreground">
            senka
          </span>
        </div>

        {/* Hamburger / close button — cross-fade, same as landing */}
        <button
          type="button"
          aria-expanded={mobileMenuOpen}
          aria-controls="app-nav-drawer"
          aria-label={mobileMenuOpen ? t("nav.closeMenu") : t("nav.menu")}
          onClick={() => (mobileMenuOpen ? closeMenu() : openMenu())}
          className="relative -mr-1 inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
        >
          {(
            [
              [Menu01Icon, !mobileMenuOpen],
              [Cancel01Icon, mobileMenuOpen],
            ] as const
          ).map(([icon, shown], index) => (
            <span
              aria-hidden="true"
              // biome-ignore lint/suspicious/noArrayIndexKey: two fixed glyphs
              key={index}
              className="absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none"
              style={{
                opacity: shown ? 1 : 0,
                transform: shown ? "rotate(0deg)" : "rotate(-45deg)",
              }}
            >
              <HugeiconsIcon icon={icon} size={18} strokeWidth={1.75} />
            </span>
          ))}
          {/* Badge only when menu is closed so it doesn't overlap the × */}
          {!mobileMenuOpen && chatBadge + inboxBadge > 0 ? (
            <NotificationBadge count={chatBadge + inboxBadge} />
          ) : null}
        </button>
      </div>

      {/* Backdrop — closes menu on tap outside */}
      {mobileMenuOpen ? (
        <button
          type="button"
          onClick={closeMenu}
          className="fixed inset-0 z-[-1] cursor-default"
          aria-label={t("nav.closeMenu")}
          tabIndex={-1}
        />
      ) : null}

      {/* Drawer — height-animated clipping box */}
      <div
        className="app-nav-drawer"
        id="app-nav-drawer"
        // `inert` while closed: links are invisible to the tab order and
        // screen readers without being unmounted (needed for measurement).
        // biome-ignore lint/a11y/useAriaPropsForRole: inert is intentional
        inert={!mobileMenuOpen}
      >
        <div className="app-nav-drawer-inner" ref={drawerInnerRef}>
          {/* Nav items section */}
          <div className="flex flex-col gap-0.5 px-3 pt-1">

            {/* Business switcher — same height as nav items */}
            <div
              className="app-nav-item pb-0.5 pt-1"
              style={{ "--i": 0 } as CSSProperties}
            >
              <BusinessSwitcher className="py-2.5 rounded-xl" />
            </div>

            {/* Command palette / search — same height as nav items */}
            <div
              className="app-nav-item pb-0.5"
              style={{ "--i": 1 } as CSSProperties}
            >
              <CommandPalette className="py-2.5 px-3 rounded-xl text-sm" />
            </div>

            {/* New chat shortcut */}
            <Link
              href="/chat"
              onClick={closeMenu}
              data-cuelume-press
              className="app-nav-item mb-0.5 flex items-center gap-2.5 rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground shadow-[var(--shadow-button)] transition-transform duration-150 active:scale-[0.98]"
              style={{ "--i": 2 } as CSSProperties}
            >
              <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.75} className="shrink-0" />
              {t("nav.newChat")}
            </Link>

            {/* Nav items */}
            {allItems.map((item, index) => {
              const isActive = isActivePath(item.href);
              const badgeCount = badgeFor(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-cuelume-hover="tick"
                  data-cuelume-press
                  onClick={closeMenu}
                  className={cn(
                    "app-nav-item relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                    isActive
                      ? "bg-muted text-foreground shadow-[var(--shadow-inset)]"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                  style={{ "--i": index + 3 } as CSSProperties}
                >
                  <HugeiconsIcon icon={item.icon} size={16} strokeWidth={1.75} className="shrink-0" />
                  {t(item.labelKey)}
                  {badgeCount ? <NotificationBadge count={badgeCount} /> : null}
                </Link>
              );
            })}

          </div>

          {/* Footer section — always at the bottom of the drawer */}
          <div
            className="app-nav-item flex flex-col gap-0.5 border-t border-border px-3 pb-safe-bottom pt-2"
            style={{ "--i": footerOffset + 1, paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" } as CSSProperties}
          >
            <SidebarNotifications className="w-full" />
            <SupportDialog className="w-full" />

            {/* Preference toggles — row of icon buttons */}
            <div className="mt-0.5 flex items-center gap-0.5">
              <ThemeToggle className="size-8 justify-center p-0" showLabel={false} />
              <SoundToggle className="size-8 justify-center p-0" showLabel={false} />
              <LanguageToggle className="size-8 justify-center p-0" showLabel={false} />
              <SignOutButton className="size-8 justify-center p-0" showLabel={false} />
              <div className="flex-1" />
              <SidebarStatus />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
