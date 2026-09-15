"use client";

// The app's status badge system: one soft, pastel pill per state, shared by
// every page that shows "is this thing on".
//
// It lives in components/ui rather than next to the channel badges because
// non-channel surfaces (the model/provider badge in the chat header, for one)
// need the exact same pill — a second hand-rolled version is how a design
// system drifts.

import { HugeiconsIcon, type IconSvgElement } from "@/components/icons/icon";
import {
  TriangleAlertIcon,
  Loading03Icon,
  SendIcon,
  Search01Icon,
  CheckIcon,
  CancelCircleIcon,
  Clock01Icon,
} from "@hugeicons/core-free-icons";
import { ActionSwapIcon, ActionSwapText } from "@/components/motion/action-swap";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
// ── Status badge system ──────────────────────────────────────────────

/** All possible status variants for the badge component. */
export type StatusVariant =
  | "pending"
  | "in-progress"
  | "submitted"
  | "in-review"
  | "success"
  | "failed"
  | "expired"
  // App-specific mappings
  | "connected"
  | "disconnected"
  | "active"
  | "paused"
  | "draft"
  | "error"
  | "warning";

type StatusConfig = {
  readonly label: string;
  readonly icon: IconSvgElement;
  /** CSS variable name (defined in globals.css) that holds both
      light and dark values for this status variant. */
  readonly bgVar: string;
  readonly fgVar: string;
};

const STATUS_CONFIG: Record<StatusVariant, StatusConfig> = {
  // ── Spec variants ──
  pending: {
    label: "Pending",
    icon: TriangleAlertIcon,
    bgVar: "--status-pending-bg",
    fgVar: "--status-pending-fg",
  },
  "in-progress": {
    label: "In progress",
    icon: Loading03Icon,
    bgVar: "--status-progress-bg",
    fgVar: "--status-progress-fg",
  },
  submitted: {
    label: "Submitted",
    icon: SendIcon,
    bgVar: "--status-submitted-bg",
    fgVar: "--status-submitted-fg",
  },
  "in-review": {
    label: "In review",
    icon: Search01Icon,
    bgVar: "--status-review-bg",
    fgVar: "--status-review-fg",
  },
  success: {
    label: "Success",
    icon: CheckIcon,
    bgVar: "--status-success-bg",
    fgVar: "--status-success-fg",
  },
  failed: {
    label: "Failed",
    icon: CancelCircleIcon,
    bgVar: "--status-failed-bg",
    fgVar: "--status-failed-fg",
  },
  expired: {
    label: "Expired",
    icon: Clock01Icon,
    bgVar: "--status-expired-bg",
    fgVar: "--status-expired-fg",
  },
  // ── App-specific mappings ──
  connected: {
    label: "Connected",
    icon: CheckIcon,
    bgVar: "--status-success-bg",
    fgVar: "--status-success-fg",
  },
  disconnected: {
    label: "Disconnected",
    icon: CancelCircleIcon,
    bgVar: "--status-expired-bg",
    fgVar: "--status-expired-fg",
  },
  active: {
    label: "Active",
    icon: CheckIcon,
    bgVar: "--status-success-bg",
    fgVar: "--status-success-fg",
  },
  paused: {
    label: "Paused",
    icon: Clock01Icon,
    bgVar: "--status-review-bg",
    fgVar: "--status-review-fg",
  },
  draft: {
    label: "Draft",
    icon: TriangleAlertIcon,
    bgVar: "--status-expired-bg",
    fgVar: "--status-expired-fg",
  },
  error: {
    label: "Error",
    icon: CancelCircleIcon,
    bgVar: "--status-failed-bg",
    fgVar: "--status-failed-fg",
  },
  // Not broken, but not fully working either — a free plan with a partial
  // catalog, an account near zero balance, a temporary rate limit.
  warning: {
    label: "Warning",
    icon: TriangleAlertIcon,
    bgVar: "--status-pending-bg",
    fgVar: "--status-pending-fg",
  },
};

/**
 * A soft, pastel status badge for a modern SaaS dashboard. Each badge
 * is a compact horizontal rounded rectangle with an outline icon
 * followed by a status label — no border, no shadow, no gradient.
 */
export function StatusBadge({
  status,
  label,
  title,
  className,
}: {
  readonly status: StatusVariant;
  /** Overrides the dictionary label — pass one only when a page needs
   *  wording that differs from the shared `badge.*` entries. */
  readonly label?: string;
  /** Hover text for detail that would make the pill too long to read. */
  readonly title?: string;
  readonly className?: string;
}) {
  const t = useT();
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  // `badge.<variant>` mirrors the StatusVariant union, so a new variant only
  // needs its two dictionary entries. `t` echoes the key back when one is
  // missing, so fall back to the built-in English label in that case.
  const translated = t(`badge.${status}`);
  const resolved = translated === `badge.${status}` ? config.label : translated;

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap font-medium leading-none",
        className,
      )}
      style={{
        transition: "background-color 150ms ease-out, color 150ms ease-out",
        backgroundColor: `var(${config.bgVar})`,
        color: `var(${config.fgVar})`,
        borderRadius: "8px",
        height: "20px",
        paddingInline: "6px",
        fontSize: "10px",
      }}
    >
      <ActionSwapIcon value={status} className="size-[11px]">
        <HugeiconsIcon icon={config.icon} size={11} strokeWidth={1.75} className="shrink-0" />
      </ActionSwapIcon>
      <ActionSwapText value={`${status}:${label ?? resolved}`}>{label ?? resolved}</ActionSwapText>
    </span>
  );
}
