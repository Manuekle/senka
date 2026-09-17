"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { useThemeToggle } from "@/components/motion/theme-toggle";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ThemeToggle({
  className,
  showLabel = true,
}: {
  readonly className?: string;
  readonly showLabel?: boolean;
}) {
  // The reveal itself (a circle-blur view transition) comes from the beui
  // control in components/motion/theme-toggle.tsx; the icons, the label and
  // the sidebar's own styling stay here.
  const { isDark, mounted, toggle } = useThemeToggle({ variant: "circle-blur" });
  const t = useT();
  const buttonRef = useRef<HTMLButtonElement>(null);
  // The swap is a CSS transition, and the first render is always the neutral
  // "light" placeholder — so on every mount in dark mode the icons animated
  // moon→sun by themselves. Transitions stay off until the resolved state has
  // been painted; from then on a real toggle animates.
  const [swappable, setSwappable] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    const frame = requestAnimationFrame(() => setSwappable(true));
    return () => cancelAnimationFrame(frame);
  }, [mounted]);

  const labelKey = isDark ? "theme.toggleToLight" : "theme.toggleToDark";

  /** The circle opens from the control that was clicked, not from a corner. */
  const handleClick = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) {
      toggle();
      return;
    }
    const x = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
    const y = ((rect.top + rect.height / 2) / window.innerHeight) * 100;
    toggle(`${x.toFixed(1)}% ${y.toFixed(1)}%`);
  };

  // No `title`: the native tooltip would open on the same hover as this one.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={buttonRef}
          onClick={handleClick}
          // Light/dark is a two-state switch, so it gets the switch cue rather
          // than the generic press the provider would otherwise fall back to.
          data-cuelume-toggle
          className={cn(
            "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition duration-150 hover:bg-accent hover:text-foreground text-muted-foreground",
            !showLabel && "px-1.5 py-1",
            className,
          )}
          aria-label={t(labelKey)}
          type="button"
        >
          <span className="t-icon-swap shrink-0" data-state={isDark ? "b" : "a"}>
            <span className="t-icon" data-icon="a" style={swappable ? undefined : { transition: "none" }}>
              <HugeiconsIcon icon={Moon02Icon} size={14} strokeWidth={1.75} />
            </span>
            <span className="t-icon" data-icon="b" style={swappable ? undefined : { transition: "none" }}>
              <HugeiconsIcon icon={Sun03Icon} size={14} strokeWidth={1.75} />
            </span>
          </span>
          {showLabel ? <span>{t(isDark ? "theme.light" : "theme.dark")}</span> : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{t(labelKey)}</TooltipContent>
    </Tooltip>
  );
}
