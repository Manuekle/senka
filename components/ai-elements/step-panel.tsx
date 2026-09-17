"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { ArrowUp01Icon, ArrowDown01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { StepEditor } from "./step-editor";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n/provider";
import { STEP_DESCRIPTION_KEYS, STEP_HUES, STEP_ICONS, STEP_LABEL_KEYS } from "@/lib/workflow-step-meta";
import { CategoryBadge } from "@/components/ui/category-badge";
import type { WorkflowStep } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";

/**
 * Right-hand properties dock for the selected node — its config form plus the
 * structural actions (reorder, delete) that used to sit on the node itself,
 * keeping the canvas clean.
 */
export function StepPanel({
  step,
  onConfigChange,
  onMove,
  onRemove,
  onClose,
}: {
  readonly step: WorkflowStep;
  readonly onConfigChange: (key: string, value: string) => void;
  readonly onMove: (dir: "up" | "down") => void;
  readonly onRemove: () => void;
  readonly onClose: () => void;
}) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>("textarea,input,[role=combobox]")?.focus();
  }, [step.id]);
  return (
    <div ref={panelRef} role="region" aria-label={t(STEP_LABEL_KEYS[step.type])} className="flex h-full flex-col"
      onKeyDown={event => {
        if (event.key === "Escape" && !event.defaultPrevented && !(event.target as HTMLElement).closest("[role=listbox]")) {
          event.stopPropagation();
          onClose();
        }
      }}>
      {/* Header */}
      <div className="flex shrink-0 items-start gap-3 border-b border-border px-4 pt-5 pb-3">
        <CategoryBadge hue={STEP_HUES[step.type]} className="size-9 justify-center rounded-xl p-0" aria-hidden="true">
          <HugeiconsIcon icon={STEP_ICONS[step.type]} size={16} strokeWidth={1.75} />
        </CategoryBadge>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{t(STEP_LABEL_KEYS[step.type])}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{t(STEP_DESCRIPTION_KEYS[step.type])}</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("automations.closePanel")}
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.75} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">{t("automations.closePanel")}</TooltipContent>
        </Tooltip>
      </div>

      {/* Config form */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <StepEditor step={step} onConfigChange={(_id, key, value) => onConfigChange(key, value)} />
      </div>

      {/* Structural actions */}
      <div className="flex shrink-0 items-center gap-1 border-t border-border px-3 py-2.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onMove("up")}
          className="text-[13px] text-muted-foreground hover:text-foreground active:scale-95"
        >
          <HugeiconsIcon icon={ArrowUp01Icon} size={13} strokeWidth={1.75} />
          {t("automations.moveUp")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onMove("down")}
          className="text-[13px] text-muted-foreground hover:text-foreground active:scale-95"
        >
          <HugeiconsIcon icon={ArrowDown01Icon} size={13} strokeWidth={1.75} />
          {t("automations.moveDown")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="ml-auto text-[13px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-95"
        >
          {t("automations.deleteStep")}
        </Button>
      </div>
    </div>
  );
}
