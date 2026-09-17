"use client";

import { useMemo, useState } from "react";
import { Reorder, useDragControls, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Add01Icon,
  Delete01Icon,
  DragDropVerticalIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isChoiceType } from "@/lib/forms/draft";
import { useI18n } from "@/lib/i18n/provider";
import type { FormChoice, FormField, FormFieldMapping, FormFieldType } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Shared with the step rail: tight enough that a two-line row settles
 *  without wobbling, springy enough to read as weight rather than a cut. */
export const REORDER_SPRING = { type: "spring", stiffness: 520, damping: 34, mass: 0.7 } as const;

/**
 * One question, as something to edit.
 *
 * Every control writes straight through to the draft rather than holding a
 * copy: the preview beside it is the point of this screen, and a field that
 * only reaches the preview on blur makes the preview feel broken.
 */

const FIELD_TYPES: readonly FormFieldType[] = [
  "single_choice",
  "multi_choice",
  "text",
  "long_text",
  "email",
  "phone",
];

const MAPPINGS: readonly FormFieldMapping[] = ["name", "email", "phone"];

/** The value the mapping select uses for "this answer isn't contact details".
 *  Radix's Select has no empty-string item, so the absence needs a name. */
const NO_MAPPING = "__none";

export type QuestionEditorProps = {
  readonly field: FormField;
  readonly index: number;
  readonly count: number;
  /** Points are hidden until the form actually scores something — a survey
   *  nobody qualifies on shouldn't be asking about points on every option. */
  readonly showPoints: boolean;
  readonly onChange: (patch: Partial<FormField>) => void;
  readonly onMove: (direction: -1 | 1) => void;
  readonly onRemove: () => void;
  readonly onChoiceChange: (choiceId: string, patch: { label?: string; emoji?: string; points?: number }) => void;
  readonly onChoiceMove: (choiceId: string, direction: -1 | 1) => void;
  readonly onChoiceRemove: (choiceId: string) => void;
  readonly onChoiceAdd: () => void;
  /** A whole new option order, from a drag. */
  readonly onChoiceReorder: (choiceIds: readonly string[]) => void;
  /** Starts the drag on the question card itself. Supplied by the list that
   *  owns the ordering — the card can't drag itself out of its own group. */
  readonly onHandlePointerDown?: (event: React.PointerEvent) => void;
  readonly dragging?: boolean;
};

export function QuestionEditor({
  field,
  index,
  count,
  showPoints,
  onChange,
  onMove,
  onRemove,
  onChoiceChange,
  onChoiceMove,
  onChoiceRemove,
  onChoiceAdd,
  onChoiceReorder,
  onHandlePointerDown,
  dragging = false,
}: QuestionEditorProps) {
  const { t } = useI18n();
  const choices = field.choices ?? [];
  const isChoice = isChoiceType(field.type);

  return (
    <div
      className={cn(
        "@container group/card rounded-xl border p-3 transition-[border-color,background-color,box-shadow] duration-150",
        dragging ? "border-border bg-card shadow-[var(--shadow-float)]" : "border-border/70",
      )}
    >
      {/* Type and the row actions share the top line; the question itself gets
          a line of its own at every width. The three used to compete for one
          flex row, so in the middle column of the workspace — which is narrow
          by design, the dock has the rest — the label wrapped to a sliver and
          the delete button landed on its own row. */}
      <div className="flex items-center gap-2">
        {onHandlePointerDown ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label={t("forms.builder.dragQuestion")}
            title={t("forms.builder.dragQuestion")}
            onPointerDown={onHandlePointerDown}
            className="-ml-1 flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground select-none hover:text-muted-foreground active:cursor-grabbing"
          >
            <HugeiconsIcon icon={DragDropVerticalIcon} size={13} strokeWidth={2} />
          </span>
        ) : null}
        <Select
          value={field.type}
          onValueChange={(type) => onChange({ type: type as FormFieldType })}
        >
          <SelectTrigger aria-label={t("forms.builder.fieldType")} className="h-8 w-[9.5rem] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {t(`forms.builder.type.${type}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex shrink-0 items-center">
          <MoveButtons
            index={index}
            count={count}
            onMove={onMove}
            upLabel={t("forms.builder.moveQuestionUp")}
            downLabel={t("forms.builder.moveQuestionDown")}
          />
          <IconButton
            label={t("forms.builder.removeQuestion")}
            icon={Delete01Icon}
            destructive
            onClick={onRemove}
          />
        </div>
      </div>

      <Input
        aria-label={t("forms.builder.questionLabel")}
        value={field.label}
        placeholder={t("forms.builder.questionPlaceholder")}
        onChange={(event) => onChange({ label: event.target.value })}
        className="mt-2 h-8 text-xs"
      />

      <div className="mt-2 grid gap-2 @sm:grid-cols-2">
        <Input
          aria-label={t("forms.builder.help")}
          value={field.help ?? ""}
          placeholder={t("forms.builder.helpPlaceholder")}
          onChange={(event) => onChange({ help: event.target.value || undefined })}
          className="h-8 text-xs"
        />
        {!isChoice ? (
          <Input
            aria-label={t("forms.builder.placeholder")}
            value={field.placeholder ?? ""}
            placeholder={t("forms.builder.placeholderPlaceholder")}
            onChange={(event) => onChange({ placeholder: event.target.value || undefined })}
            className="h-8 text-xs"
          />
        ) : null}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={field.required}
            onCheckedChange={(required) => onChange({ required })}
            label={t("forms.builder.required")}
          />
          {t("forms.builder.required")}
        </label>

        {/* Only typed questions can fill a contact field: a mapped choice
            question would write a choice id into somebody's name. */}
        {!isChoice ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {t("forms.builder.maps")}
            <Select
              value={field.maps ?? NO_MAPPING}
              onValueChange={(value) =>
                onChange({ maps: value === NO_MAPPING ? undefined : (value as FormFieldMapping) })
              }
            >
              <SelectTrigger aria-label={t("forms.builder.maps")} className="h-7 w-[8.5rem] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_MAPPING}>{t("forms.builder.mapsNone")}</SelectItem>
                {MAPPINGS.map((mapping) => (
                  <SelectItem key={mapping} value={mapping}>
                    {t(`forms.builder.maps.${mapping}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}
      </div>

      {isChoice ? (
        <div className="mt-3 border-t border-border/60 pt-3">
          <ChoiceList
            choices={choices}
            showPoints={showPoints}
            onChoiceChange={onChoiceChange}
            onChoiceMove={onChoiceMove}
            onChoiceRemove={onChoiceRemove}
            onReorder={onChoiceReorder}
          />

          <Button variant="ghost" size="sm" className="mt-1.5 h-7 text-xs" onClick={onChoiceAdd}>
            <HugeiconsIcon icon={Add01Icon} size={13} strokeWidth={1.75} />
            {t("forms.builder.addOption")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The options, as a draggable list.
 *
 * Same mechanism as the step rail and for the same reason: an option that
 * changes place should slide there. Nothing constrains this order — points
 * belong to the option, not to its position — so a drop commits without a
 * check, unlike a step reorder.
 */
function ChoiceList({
  choices,
  showPoints,
  onChoiceChange,
  onChoiceMove,
  onChoiceRemove,
  onReorder,
}: {
  readonly choices: readonly FormChoice[];
  readonly showPoints: boolean;
  readonly onChoiceChange: (
    choiceId: string,
    patch: { label?: string; emoji?: string; points?: number },
  ) => void;
  readonly onChoiceMove: (choiceId: string, direction: -1 | 1) => void;
  readonly onChoiceRemove: (choiceId: string) => void;
  readonly onReorder: (choiceIds: readonly string[]) => void;
}) {
  const reduced = useReducedMotion();
  const [dragOrder, setDragOrder] = useState<readonly string[] | null>(null);

  const byId = useMemo(() => new Map(choices.map((choice) => [choice.id, choice])), [choices]);
  const committed = useMemo(() => choices.map((choice) => choice.id), [choices]);
  // A stale order — one naming an option that has since been removed — is
  // dropped rather than rendered as a row with nothing behind it.
  const order = dragOrder?.every((id) => byId.has(id)) ? dragOrder : committed;

  return (
    <Reorder.Group
      as="ul"
      axis="y"
      values={order as string[]}
      onReorder={setDragOrder}
      className="flex flex-col gap-1.5"
    >
      {order.map((choiceId) => {
        const choice = byId.get(choiceId);
        if (!choice) return null;
        return (
          <ChoiceRow
            key={choiceId}
            choice={choice}
            index={order.indexOf(choiceId)}
            count={order.length}
            showPoints={showPoints}
            reduced={Boolean(reduced)}
            onChange={(patch) => onChoiceChange(choiceId, patch)}
            onMove={(direction) => onChoiceMove(choiceId, direction)}
            onRemove={() => onChoiceRemove(choiceId)}
            onDragEnd={() => {
              const next = dragOrder;
              setDragOrder(null);
              if (!next || next.length !== choices.length) return;
              if (next.every((id, index) => id === committed[index])) return;
              onReorder(next);
            }}
          />
        );
      })}
    </Reorder.Group>
  );
}

function ChoiceRow({
  choice,
  index,
  count,
  showPoints,
  reduced,
  onChange,
  onMove,
  onRemove,
  onDragEnd,
}: {
  readonly choice: FormChoice;
  readonly index: number;
  readonly count: number;
  readonly showPoints: boolean;
  readonly reduced: boolean;
  readonly onChange: (patch: { label?: string; emoji?: string; points?: number }) => void;
  readonly onMove: (direction: -1 | 1) => void;
  readonly onRemove: () => void;
  readonly onDragEnd: () => void;
}) {
  const { t } = useI18n();
  const controls = useDragControls();
  const [dragging, setDragging] = useState(false);

  return (
    <Reorder.Item
      value={choice.id}
      dragListener={false}
      dragControls={controls}
      dragElastic={0.06}
      transition={reduced ? { duration: 0 } : REORDER_SPRING}
      onDragStart={() => setDragging(true)}
      onDragEnd={() => {
        setDragging(false);
        onDragEnd();
      }}
      style={{ position: "relative", zIndex: dragging ? 20 : undefined }}
      className={cn(
        "flex list-none flex-wrap items-center gap-1.5 rounded-lg",
        dragging && "bg-card shadow-[var(--shadow-float)]",
      )}
    >
      <span
        role="button"
        tabIndex={-1}
        aria-label={t("forms.builder.dragOption")}
        title={t("forms.builder.dragOption")}
        onPointerDown={(event) => {
          event.preventDefault();
          controls.start(event);
        }}
        className="-ml-0.5 flex size-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground select-none hover:text-muted-foreground active:cursor-grabbing"
      >
        <HugeiconsIcon icon={DragDropVerticalIcon} size={11} strokeWidth={2} />
      </span>

      <Input
        aria-label={t("forms.builder.optionEmoji")}
        value={choice.emoji ?? ""}
        placeholder="🙂"
        onChange={(event) => onChange({ emoji: event.target.value || undefined })}
        className="h-8 w-11 shrink-0 px-0 text-center text-xs"
      />
      <Input
        aria-label={t("forms.builder.optionLabel")}
        value={choice.label}
        placeholder={t("forms.builder.optionPlaceholder")}
        onChange={(event) => onChange({ label: event.target.value })}
        className="h-8 min-w-[7rem] flex-1 basis-32 text-xs"
      />

      {/* Points and the row's buttons travel as one right-aligned group.
          Splitting them let the arrows wrap onto a second line on their own,
          which doubled the height of every option in a narrow column. */}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {showPoints ? (
          <>
            <Input
              aria-label={t("forms.builder.optionPoints")}
              type="number"
              inputMode="numeric"
              value={String(choice.points)}
              onChange={(event) =>
                // An emptied box is zero, not NaN: a half-typed "-" would
                // otherwise poison the whole draft.
                onChange({
                  points: Number.isFinite(event.target.valueAsNumber)
                    ? Math.trunc(event.target.valueAsNumber)
                    : 0,
                })
              }
              className="h-8 w-14 px-2 text-xs"
            />
            <span className="text-[10px] text-muted-foreground">
              {t("forms.builder.pointsSuffix")}
            </span>
          </>
        ) : null}
        <MoveButtons
          index={index}
          count={count}
          onMove={onMove}
          upLabel={t("forms.builder.moveOptionUp")}
          downLabel={t("forms.builder.moveOptionDown")}
        />
        <IconButton
          label={t("forms.builder.removeOption")}
          icon={Delete01Icon}
          destructive
          // The last option can't go: a choice question with none is a
          // question nobody can answer.
          disabled={count <= 1}
          onClick={onRemove}
        />
      </div>
    </Reorder.Item>
  );
}

/** Up and down, disabled at the ends. Reordering by arrows rather than by drag
 *  on purpose: this is a keyboard-reachable control that behaves the same on a
 *  phone, and a form is a short list. */
export function MoveButtons({
  index,
  count,
  onMove,
  upLabel,
  downLabel,
}: {
  readonly index: number;
  readonly count: number;
  readonly onMove: (direction: -1 | 1) => void;
  readonly upLabel: string;
  readonly downLabel: string;
}) {
  return (
    <div className="flex shrink-0 items-center">
      <IconButton
        label={upLabel}
        icon={ArrowUp01Icon}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      />
      <IconButton
        label={downLabel}
        icon={ArrowDown01Icon}
        disabled={index >= count - 1}
        onClick={() => onMove(1)}
      />
    </div>
  );
}

export function IconButton({
  label,
  icon,
  onClick,
  disabled,
  destructive,
}: {
  readonly label: string;
  readonly icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150",
        "hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-30",
        destructive && "hover:bg-destructive/10 hover:text-destructive",
      )}
    >
      <HugeiconsIcon icon={icon} size={14} strokeWidth={1.75} />
    </button>
  );
}
