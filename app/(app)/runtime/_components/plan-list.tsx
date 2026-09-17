"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import {
  CheckmarkCircle02Icon,
  CancelCircleIcon,
  Loading03Icon,
  CircleIcon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import { Card } from "../../../_components/dashboard-card";
import { SkeletonBar } from "@/components/ai-elements/skeleton";
import { relativeTime } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { RunPlan, RunStepStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

// The agent's own checklists, as it ticks them off.
//
// This is the half of the runtime page that answers "is it working or is it
// stuck". A running step with a timestamp is a different thing from a spinner:
// you can see which step it is on, how long it has been there, and what the
// previous ones concluded.
//
// Written by agent/tools/plan.ts. A run with no plan simply has none — the
// tool is for multi-step work, and a one-reply answer that invented a
// checklist would be noise.

const STEP_TONE: Record<
  RunStepStatus,
  { readonly icon: typeof CheckmarkCircle02Icon; readonly text: string; readonly spin?: boolean }
> = {
  pending: { icon: CircleIcon, text: "text-muted-foreground" },
  running: {
    icon: Loading03Icon,
    text: "text-[color:var(--status-progress-fg)]",
    spin: true,
  },
  done: { icon: CheckmarkCircle02Icon, text: "text-[color:var(--status-success-fg)]" },
  failed: { icon: CancelCircleIcon, text: "text-[color:var(--status-failed-fg)]" },
  skipped: { icon: ArrowRight01Icon, text: "text-muted-foreground" },
};

function PlanCard({ plan, locale }: { readonly plan: RunPlan; readonly locale: Locale }) {
  const done = plan.steps.filter((step) => step.status === "done").length;
  const failed = plan.steps.some((step) => step.status === "failed");
  const total = plan.steps.length;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{plan.title}</p>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {plan.sessionId.slice(0, 20)} · {relativeTime(plan.updatedAt, locale)}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[11px] tabular-nums",
            failed
              ? "text-[color:var(--status-failed-fg)]"
              : plan.completedAt
                ? "text-[color:var(--status-success-fg)]"
                : "text-muted-foreground",
          )}
        >
          {done}/{total}
        </span>
      </div>

      <ol className="space-y-1.5">
        {plan.steps.map((step, index) => {
          const tone = STEP_TONE[step.status];
          return (
            <li key={step.id} className="flex items-start gap-2">
              <HugeiconsIcon
                icon={tone.icon}
                size={15}
                strokeWidth={2}
                className={cn("mt-0.5 shrink-0", tone.text, tone.spin && "animate-spin")}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-xs leading-relaxed",
                    step.status === "done" || step.status === "skipped"
                      ? "text-muted-foreground"
                      : "text-foreground",
                  )}
                >
                  <span className="font-mono text-[11px] text-muted-foreground">{index + 1}.</span>{" "}
                  {step.title}
                </p>
                {step.note ? (
                  <p className="mt-0.5 border-l-2 border-border pl-2 text-[11px] leading-relaxed text-muted-foreground">
                    {step.note}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export function PlanList({
  plans,
  isLoading,
  locale,
}: {
  readonly plans: readonly RunPlan[];
  readonly isLoading: boolean;
  readonly locale: Locale;
}) {
  const t = useT();

  if (isLoading && plans.length === 0) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="space-y-2 p-4">
            <SkeletonBar className="h-4 w-40" />
            <SkeletonBar className="h-3 w-full" />
            <SkeletonBar className="h-3 w-5/6" />
          </Card>
        ))}
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-foreground">{t("runtime.stepsEmpty")}</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
          {t("runtime.stepsEmptyHint")}
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {plans.map((plan) => (
        <PlanCard key={plan.id} plan={plan} locale={locale} />
      ))}
    </div>
  );
}
