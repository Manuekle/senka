"use client";

import { useMemo, useState } from "react";
import { Reorder, useDragControls, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Copy01Icon,
  Delete02Icon,
  DragDropVerticalIcon,
  FilterHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/components/toast-provider";
import { conditionsHold } from "@/lib/forms/draft";
import { useI18n } from "@/lib/i18n/provider";
import type { FormStep } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The left rail: every step of the form, in order.
 *
 * Same job the template rail does on the email screen — the list you pick
 * from, not the thing you type into. Picking a step is the first gesture on
 * this page, so it gets the permanent column rather than a scroll position
 * somewhere in a long form.
 *
 * Reordering is a drag *and* a pair of arrows, and both animate: the list is
 * a `Reorder.Group`, so a step that changes index — however it was moved —
 * springs to its new slot instead of teleporting. The arrows are not a
 * fallback nobody uses; they are the only way to reorder from a keyboard.
 */

/** Grab and land. Tighter than the CRM board's under-damped bounce on
 *  purpose: these rows are two lines tall, and a spring that reads as weight
 *  on a big card reads as a wobble on a small one. */
const SPRING = { type: "spring", stiffness: 520, damping: 34, mass: 0.7 } as const;

export function StepRail({
  steps,
  selectedId,
  issuePaths,
  onSelect,
  onAdd,
  onMove,
  onReorder,
  onDuplicate,
  onRemove,
}: {
  readonly steps: readonly FormStep[];
  readonly selectedId: string | null;
  /** Indices of steps carrying at least one validation problem, so the rail
   *  can show where the save button is stuck rather than only that it is. */
  readonly issuePaths: ReadonlySet<number>;
  readonly onSelect: (stepId: string) => void;
  readonly onAdd: () => void;
  readonly onMove: (stepId: string, direction: -1 | 1) => void;
  /** A whole new order, from a drag. Already checked for conditions. */
  readonly onReorder: (steps: readonly FormStep[]) => void;
  readonly onDuplicate: (stepId: string) => void;
  readonly onRemove: (stepId: string) => void;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const reduced = useReducedMotion();

  /**
   * The order being dragged, before it is committed.
   *
   * `Reorder` fires on every crossing, and a half-finished drag can pass
   * through orders that put a step in front of the question gating it. Holding
   * the order locally means the draft only ever sees a settled, legal one —
   * and an illegal drop springs back rather than saving something that would
   * then block the save button.
   */
  const [dragOrder, setDragOrder] = useState<readonly string[] | null>(null);

  const byId = useMemo(() => new Map(steps.map((step) => [step.id, step])), [steps]);
  const committed = useMemo(() => steps.map((step) => step.id), [steps]);
  // A drag order naming a step that has since gone is stale — drop it rather
  // than render a row for an id with nothing behind it.
  const order = dragOrder?.every((id) => byId.has(id)) ? dragOrder : committed;

  const commit = () => {
    if (!dragOrder) return;
    const next = dragOrder.map((id) => byId.get(id)).filter((step): step is FormStep => Boolean(step));
    setDragOrder(null);
    if (next.length !== steps.length) return;
    if (next.every((step, index) => step.id === steps[index].id)) return;
    if (!conditionsHold(next)) {
      // The list springs back to `steps` the moment `dragOrder` clears, so the
      // refusal is visible. The toast says why, because a step sliding home on
      // its own looks like a bug.
      toast({
        title: t("forms.builder.reorderBlocked"),
        description: t("forms.builder.reorderBlockedHint"),
        status: "info",
      });
      return;
    }
    onReorder(next);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2.5">
        <MicroLabel>{t("forms.builder.stepsTitle")}</MicroLabel>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onAdd}
              aria-label={t("forms.builder.addStep")}
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.75} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("forms.builder.addStep")}</TooltipContent>
        </Tooltip>
      </div>

      {/* `layoutScroll` is what keeps the layout animation honest inside a
          scrolling column: without it motion measures against a viewport that
          has moved under it, and a step dropped near the bottom lands at an
          offset. */}
      <Reorder.Group
        as="ol"
        axis="y"
        layoutScroll
        values={order as string[]}
        onReorder={setDragOrder}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2 scrollbar-hide"
      >
        {order.map((stepId) => {
          const step = byId.get(stepId);
          if (!step) return null;
          const index = order.indexOf(stepId);
          return (
            <StepRow
              key={stepId}
              step={step}
              index={index}
              count={order.length}
              active={stepId === selectedId}
              broken={issuePaths.has(committed.indexOf(stepId))}
              reduced={Boolean(reduced)}
              onSelect={() => onSelect(stepId)}
              onDragEnd={commit}
              onMove={(direction) => onMove(stepId, direction)}
              onDuplicate={() => onDuplicate(stepId)}
              onRemove={() => onRemove(stepId)}
            />
          );
        })}
      </Reorder.Group>

      <div className="shrink-0 border-t border-border p-2">
        <button
          type="button"
          onClick={onAdd}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[13px] font-medium shadow-[var(--shadow-inset)] transition-[background-color,border-color] duration-150 hover:border-input hover:bg-accent active:scale-[0.99]"
        >
          <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.75} />
          {t("forms.builder.addStep")}
        </button>
      </div>
    </div>
  );
}

function StepRow({
  step,
  index,
  count,
  active,
  broken,
  reduced,
  onSelect,
  onDragEnd,
  onMove,
  onDuplicate,
  onRemove,
}: {
  readonly step: FormStep;
  readonly index: number;
  readonly count: number;
  readonly active: boolean;
  readonly broken: boolean;
  readonly reduced: boolean;
  readonly onSelect: () => void;
  readonly onDragEnd: () => void;
  readonly onMove: (direction: -1 | 1) => void;
  readonly onDuplicate: () => void;
  readonly onRemove: () => void;
}) {
  const { t } = useI18n();
  // The row is not itself a drag listener: it holds a button you click to
  // select the step, and a row that is both would swallow every other click.
  // The grab handle starts the drag through these controls instead.
  const controls = useDragControls();
  const [dragging, setDragging] = useState(false);

  return (
    <Reorder.Item
      value={step.id}
      dragListener={false}
      dragControls={controls}
      dragElastic={0.06}
      transition={reduced ? { duration: 0 } : SPRING}
      onDragStart={() => setDragging(true)}
      onDragEnd={() => {
        setDragging(false);
        onDragEnd();
      }}
      whileDrag={reduced ? undefined : { scale: 1.02 }}
      // `position: relative` and a lifted z-index while dragging, so the row
      // being carried passes over its neighbours rather than under them.
      style={{ position: "relative", zIndex: dragging ? 30 : undefined }}
      className="list-none"
    >
      <div
        className={cn(
          "group relative rounded-lg border px-2.5 py-2 transition-[background-color,border-color,box-shadow] duration-150",
          active
            ? "border-border bg-card shadow-[var(--shadow-inset)]"
            : "border-transparent hover:bg-accent/60",
          dragging && "border-border bg-card shadow-[var(--shadow-float)]",
        )}
      >
        <div className="flex items-center gap-2">
          {/* Handle. The index chip doubles as the grab point: it is already
              the thing that says where this step sits, and turning it into a
              grip on hover puts the affordance exactly where the answer to
              "can I move this?" is. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="button"
                tabIndex={-1}
                aria-label={t("forms.builder.dragStep")}
                onPointerDown={(event) => {
                  event.preventDefault();
                  controls.start(event);
                }}
                className={cn(
                  "flex size-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-full text-[10px] font-medium tabular-nums select-none",
                  "active:cursor-grabbing",
                  active ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                )}
              >
                <span className="group-hover:hidden">{index + 1}</span>
                <HugeiconsIcon
                  icon={DragDropVerticalIcon}
                  size={11}
                  strokeWidth={2}
                  className="hidden group-hover:block"
                />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">{t("forms.builder.dragStep")}</TooltipContent>
          </Tooltip>

          <button
            type="button"
            onClick={onSelect}
            aria-current={active}
            className="min-w-0 flex-1 text-left focus-visible:outline-none"
          >
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                {step.title || step.fields[0]?.label || t("forms.builder.untitledStep")}
              </span>
              {broken ? (
                <span
                  aria-label={t("forms.builder.stepHasIssues")}
                  title={t("forms.builder.stepHasIssues")}
                  className="size-1.5 shrink-0 rounded-full bg-destructive"
                />
              ) : null}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {t("forms.builder.questionCount", { count: step.fields.length })}
              {step.showIf ? (
                <span className="inline-flex items-center gap-0.5">
                  <HugeiconsIcon icon={FilterHorizontalIcon} size={10} strokeWidth={2} />
                  {t("forms.detail.conditionalShort")}
                </span>
              ) : null}
            </span>
          </button>
        </div>

        {/* Row actions appear on hover and on keyboard focus. They are always
            in the DOM: hiding them behind `hidden` would take them out of the
            tab order, and the arrows are the only way to reorder a step
            without a pointer. */}
        <div
          className={cn(
            "absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-md bg-card/90 backdrop-blur-sm",
            "opacity-0 transition-opacity duration-150",
            "group-hover:opacity-100 group-focus-within:opacity-100",
            dragging && "opacity-0",
          )}
        >
          <RowAction
            icon={ArrowUp01Icon}
            label={t("forms.builder.moveStepUp")}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          />
          <RowAction
            icon={ArrowDown01Icon}
            label={t("forms.builder.moveStepDown")}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          />
          <RowAction
            icon={Copy01Icon}
            label={t("forms.builder.duplicateStep")}
            onClick={onDuplicate}
          />
          <RowAction
            icon={Delete02Icon}
            label={t("forms.builder.removeStep")}
            destructive
            disabled={count <= 1}
            onClick={onRemove}
          />
        </div>
      </div>
    </Reorder.Item>
  );
}

function RowAction({
  icon,
  label,
  onClick,
  disabled,
  destructive,
}: {
  readonly icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            "flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150",
            "hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            "disabled:pointer-events-none disabled:opacity-25",
            destructive && "hover:bg-destructive/10 hover:text-destructive",
          )}
        >
          <HugeiconsIcon icon={icon} size={12} strokeWidth={1.75} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function MicroLabel({ children }: { readonly children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
      {children}
    </span>
  );
}
