"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { ArrowLeft01Icon, PanelLeftIcon } from "@hugeicons/core-free-icons";
import { FlowCanvas } from "@/components/ai-elements/flow-canvas";
import { StatusBadge } from "@/components/ui/status-badge";
import { useT } from "@/lib/i18n/provider";
import type { WorkflowStep } from "@/lib/types";
import { MockSidebar, MockTopBar } from "./screen-chrome";

/**
 * The flow editor — read-only canvas with the same sidebar as every other
 * screen. The flow has its own header bar (workspace toolbar) instead of the
 * standard page header, so it uses MockSidebar directly.
 */

function buildSteps(t: (key: string) => string): readonly WorkflowStep[] {
  return [
    {
      id: "lp-step-1",
      type: "ai_response",
      config: {
        prompt: t("landing.demo.flow.step1Prompt"),
      },
    },
    {
      id: "lp-step-2",
      type: "condition",
      config: { condition: t("landing.demo.flow.step2Condition") },
      thenSteps: [
        {
          id: "lp-step-2-then-1",
          type: "update_contact",
          config: { contactNote: t("landing.demo.flow.step2ThenNote"), contactStatus: "closed" },
        },
      ],
      elseSteps: [
        {
          id: "lp-step-2-else-1",
          type: "transfer_human",
          config: { message: t("landing.demo.flow.step2ElseMessage") },
        },
      ],
    },
    {
      id: "lp-step-3",
      type: "message",
      config: { message: t("landing.demo.flow.step3Message") },
    },
  ];
}

export function FlowScreen({ compact = false }: { readonly compact?: boolean }) {
  const t = useT();
  const steps = buildSteps(t);

  return (
    // Same window as `AppChrome`: this screen builds its own shell for the
    // full-bleed canvas, so it carries the same fixed height and clip.
    <div
      className={`relative flex overflow-hidden bg-background text-foreground ${compact ? "h-[28rem] sm:h-[32rem] lg:h-[37rem]" : "h-[38rem] lg:h-[42rem]"}`}
      // `inert` bloquea TODA interacción en el subtree: hover, click, focus,
      // context menu. Los children con pointer-events-auto son ignorados.
      // Los portales (ContextMenu) nunca se abren porque el evento trigger
      // nunca llega al handler.
      inert={true}
    >
      {!compact ? <MockSidebar active="/automations" /> : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {compact ? (
          /* Figura recortada del mismo editor: conserva un workspace header
             simplificado (título + badge) para que siga leyéndose como el
             editor real en vez de un canvas pelado. */
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card/40 px-4 py-2.5">
            <h1 className="truncate text-sm font-semibold tracking-tight">{t("landing.demo.flow.title")}</h1>
            <StatusBadge status="draft" />
          </div>
        ) : <>
        <MockTopBar />

        {/* Workspace header — same shape as the real flow editor
            (`app/(app)/automations/[id]/page.tsx`): back affordance, h1 +
            StatusBadge, saved indicator, Edit, Activate, dock toggle, and the
            draft note inside the header with border-t. */}
        <header className="shrink-0 border-b border-border bg-card/40 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
            <span
              aria-label={t("automations.backToList")}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.75} />
            </span>

            <div className="flex min-w-0 flex-1 items-center gap-2">
              <h1 className="truncate text-sm font-semibold tracking-tight">{t("landing.demo.flow.title")}</h1>
              <StatusBadge status="draft" />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {/* Static saved state: the real SaveIndicator renders null while
                  idle and this dot + word once saved — the demo shows a saved
                  draft, so it shows the saved output. */}
              <span className="mr-1 hidden items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground sm:flex">
                <span className="size-1.5 rounded-full bg-foreground/60" />
                {t("automations.saved")}
              </span>
              {/* Spans, not buttons: every control here is dead by design
                  (see HeaderAction in screen-chrome.tsx) and the subtree is
                  inert — but the classes are the real toolbar's own. */}
              <span className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium shadow-[var(--shadow-inset)] transition-[background-color,border-color,box-shadow] duration-150 ease-out hover:border-input hover:bg-accent active:scale-[0.98]">
                {t("automations.edit")}
              </span>
              {/* Real disabled logic is steps.length === 0; the demo always
                  ships three steps, so this renders the enabled state. */}
              <span className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-[var(--shadow-button)] transition-[background-color,box-shadow,opacity] duration-150 ease-out active:scale-[0.98]">
                {t("automations.activate")}
              </span>
              <span className="mx-0.5 h-5 w-px bg-border" />
              <span
                aria-label={t("assistant.tab")}
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
              >
                <HugeiconsIcon icon={PanelLeftIcon} size={16} strokeWidth={1.75} className="rotate-180" />
              </span>
            </div>
          </div>

          {/* Draft note lives inside the header with border-t in the app. */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border bg-muted/30 px-4 py-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">{t("automations.draftLabel")}</span>
            <span className="h-3 w-px bg-border" />
            <span className="text-[11px] text-muted-foreground">{t("automations.draftHint")}</span>
          </div>
        </header>
        </>}

        {/* Canvas fills remaining space. Static on the landing: no pan, zoom or
            selection — the visitor only reads the flow, they don't drive it. */}
        <div className="pointer-events-none relative min-h-0 flex-1">
          <FlowCanvas
            steps={steps}
            selectedPath={null}
            onSelect={() => {}}
            onAddStep={() => {}}
            onAddStepAt={() => {}}
            onRemoveStep={() => {}}
            onMoveNode={() => {}}
            onResetLayout={() => {}}
            onIsolateStep={() => {}}
            onConnectSteps={() => {}}
            onToggleDisabled={() => {}}
            onSetConnector={() => {}}
            onRunStep={() => {}}
            embedded
            heightClassName="h-full"
            containerClassName="h-full rounded-none border-0"
          />
        </div>
      </div>

    </div>
  );
}
