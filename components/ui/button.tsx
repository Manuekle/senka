import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

// ── Button system ──────────────────────────────────────────────────
// The design language: a clean, slightly physical surface.
//
// Primary (light): a dark surface for contrast against #F7F7F8
//   via a hairline border + inner highlight (top) + faint inner shadow
//   (bottom) + a soft outer shadow. The depth is felt, not seen.
//
// Primary (dark): a white surface for contrast against #161616
//   with the same inner highlight / inner shadow recipe.
//
// All variants share the same radius, height, typography, and transition
// language so they feel like one component — not four disconnected ones.

const buttonVariants = cva(
  // Base — shared by every variant and size.
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[13px] text-sm font-medium whitespace-nowrap"
  // `opacity` is listed on purpose: without it the disabled dim
  // (`disabled:opacity-45`) snaps instantly and reads as a flicker.
  + " transition-[background-color,box-shadow,transform,border-color,color,opacity] duration-150 ease-[var(--btn-easing)]"
  + " outline-none"
  // Focus — an outline, not a `ring`. `ring` composes into `box-shadow`, which
  // every variant here already spends on its surface depth, so the indicator
  // was competing with the depth recipe for the same property. `outline` is
  // its own property and is the one focus style forced-colors mode preserves.
  // `outline-solid` is not redundant: `outline-none` above sets
  // `--tw-outline-style: none`, which `outline-1` would otherwise inherit and
  // render nothing.
  //
  // A hairline, not a 2px band: 1px at the ring token's weight reads as a
  // soft edge rather than a second border. WCAG 2.2 AA sets no minimum
  // thickness — 2px is 2.4.13 Focus Appearance, which is AAA. The colour is
  // `--btn-focus-ring`; globals.css documents where it sits against 1.4.11.
  + " focus-visible:outline-solid focus-visible:outline-1 focus-visible:outline-offset-1"
  + " focus-visible:outline-[color:var(--btn-focus-ring)]"
  // Disabled — lower contrast, no interaction. Native `disabled` already
  // drops the cursor to the browser default; pointer-events:none keeps it
  // from ever showing `pointer` again on hover.
  + " disabled:pointer-events-none disabled:cursor-default disabled:opacity-45"
  // aria-invalid
  + " aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40"
  // Icon sizing
  + " [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Primary — the most prominent button.
        // Dark surface in light, white surface in dark.
        default:
          "text-[var(--btn-primary-fg)] bg-[var(--btn-primary-bg)] border border-[var(--btn-primary-border)]"
          // The sheen is a `background-image` over the fill, not a replacement
          // for it: `--btn-primary-bg` stays the button's actual colour and
          // the gradient only washes light across it. `image:` is the type
          // hint that keeps Tailwind from compiling this to background-color
          // — without it the arbitrary value is read as a colour and dropped.
          + " bg-[image:var(--btn-primary-sheen)]"
          + " shadow-[var(--btn-primary-shadow)]"
          + " hover:shadow-[var(--btn-primary-shadow-hover)] hover:bg-[var(--btn-primary-bg-hover)]"
          + " active:shadow-[var(--btn-primary-shadow-pressed)] active:translate-y-px"
          + " active:bg-[image:var(--btn-primary-sheen-pressed)]",
        // Destructive — same surface language, red as a controlled accent.
        destructive:
          "text-[var(--btn-destructive-fg)] bg-[var(--btn-destructive-bg)] border border-[var(--btn-destructive-border)]"
          + " shadow-[var(--btn-destructive-shadow)]"
          + " hover:shadow-[var(--btn-destructive-shadow-hover)] hover:bg-[var(--btn-destructive-bg-hover)]"
          + " active:shadow-[var(--btn-destructive-shadow-pressed)] active:translate-y-px"
          // Its own tint, but one that clears 3:1. Reusing the border token
          // here put the app's most consequential button behind its least
          // visible focus indicator, at 1.33:1.
          + " focus-visible:outline-[color:var(--btn-destructive-focus-ring)]",
        // Secondary — muted neutral, same depth language, lower contrast.
        secondary:
          "text-[var(--btn-secondary-fg)] bg-[var(--btn-secondary-bg)] border border-[var(--btn-secondary-border)]"
          + " shadow-[var(--btn-secondary-shadow)]"
          + " hover:bg-[var(--btn-secondary-bg-hover)]"
          + " active:shadow-[var(--btn-secondary-shadow-pressed)] active:translate-y-px",
        // Outline — hairline border, no shadow.
        outline:
          "text-[var(--btn-outline-fg)] bg-[var(--btn-outline-bg)] border border-[var(--btn-outline-border)]"
          + " shadow-[var(--btn-outline-shadow)]"
          + " hover:bg-[var(--btn-outline-bg-hover)] hover:border-[var(--btn-outline-border-hover)]"
          + " active:shadow-none active:translate-y-px",
        // Ghost — no surface by default, subtle bg on hover.
        ghost:
          "bg-transparent border border-transparent"
          + " hover:bg-[var(--btn-ghost-hover-bg)]"
          + " active:scale-[0.98]",
        // Link — text only.
        link:
          "text-primary underline-offset-4 hover:underline active:scale-[0.98]",
      },
      size: {
        default: "h-9 px-4 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-[9px] px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-[11px] px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-[14px] px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-[9px] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-[11px]",
        "icon-lg": "size-10 rounded-[14px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

/**
 * The press cue, chosen by how much weight the variant carries.
 *
 * Only the variants that mean "do the thing" make a sound. `ghost` and `link`
 * are the close X, the toolbar icon, the inline "see more" — wiring those up
 * turns every stray click into a noise and is how a sounding interface earns
 * itself muted at the OS level.
 */
const PRESS_CUE: Partial<Record<ButtonVariant, string>> = {
  default: "pulse",
  destructive: "pulse",
  secondary: "scan",
  outline: "scan",
};

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";
  const pressCue = variant ? PRESS_CUE[variant] : undefined;

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      // Ahead of `props`, so a caller that wants a different cue — or none —
      // can still say so at the call site.
      {...(pressCue ? { "data-cuelume-press": pressCue } : {})}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
