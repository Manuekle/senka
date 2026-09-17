"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { ArrowUp01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { useFitsLines } from "@/lib/hooks/use-line-count";
import { TodoList, type TodoItem } from "@/components/agents/todo-list";
import { ApprovalCard } from "@/components/agents/approval-card";
import { StreamingResponse } from "@/components/agents/streaming-response";
import { ThinkingShimmer } from "@/components/agents/loading-states/thinking-shimmer";
import { Beam } from "@/components/ui/beam";
import { Orb } from "@/components/ui/orb";
import { useT } from "@/lib/i18n/provider";
import { networkErrorMessage, readApiError } from "@/lib/api-error-message";
import { useSound } from "@/components/sound-provider";
import { cn } from "@/lib/utils";
import { STEP_ICONS, STEP_LABEL_KEYS, stepPreview } from "@/lib/workflow-step-meta";
import { workflowAssistantResponseSchema, workflowPlanSchema, type WorkflowPlan, type WorkflowPlanStep } from "@/lib/workflow-schema";
import type { Automation, WorkflowStep } from "@/lib/types";
import { SuggestionChip } from "@/components/ui/suggestion-chip";
import { Button } from "@/components/ui/button";

type Turn =
  | { readonly role: "user"; readonly text: string }
  | { readonly role: "assistant"; readonly summary: string; readonly plan: WorkflowPlan | null; readonly applied: boolean }
  | { readonly role: "error"; readonly text: string };

/** One-tap starting points, same idea as the suggestion chips on Senka's own
 *  chat — an empty composer is the hardest thing to answer. */
const SUGGESTION_KEYS = [
  "assistant.suggestGreet",
  "assistant.suggestPrice",
  "assistant.suggestHandoff",
] as const;

/** Where one automation's conversation lives between visits. */
const chatKey = (automationId: string) => `senka:flow-chat:${automationId}`;
/**
 * How many turns to keep. Each assistant turn carries a whole plan tree, so an
 * unbounded log would be the largest thing in localStorage by far.
 */
const MAX_TURNS = 40;

function loadTurns(automationId: string): Turn[] {
  try {
    const raw = localStorage.getItem(chatKey(automationId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Anything shaped wrong is dropped rather than rendered: this is
    // user-writable storage, not a trusted channel.
    return parsed.filter((turn): turn is Turn => {
      if (!turn || typeof turn !== "object") return false;
      const role = (turn as { role?: unknown }).role;
      if (role === "user" || role === "error") return typeof (turn as { text?: unknown }).text === "string";
      const assistant = turn as { summary?: unknown; plan?: unknown; applied?: unknown };
      return role === "assistant" && typeof assistant.summary === "string" && typeof assistant.applied === "boolean"
        && (assistant.plan === null || workflowPlanSchema.safeParse(assistant.plan).success);
    });
  } catch {
    return [];
  }
}

/** Same count for steps already on the canvas — used for the "replaces" line. */
function countSteps(steps: readonly WorkflowStep[]): number {
  return steps.reduce(
    (total, step) => total + 1 + countSteps(step.thenSteps ?? []) + countSteps(step.elseSteps ?? []),
    0,
  );
}

/**
 * Chat dock that turns a plain-language request into a proposed flow. The
 * proposal is never written automatically — it renders as a preview with an
 * explicit Apply, so a person always approves the change.
 */
export function FlowAssistant({
  automation,
  steps,
  onApplyPlan,
}: {
  readonly automation: Automation;
  readonly steps: readonly WorkflowStep[];
  readonly onApplyPlan: (plan: WorkflowPlan) => void;
}) {
  const t = useT();
  const { cue } = useSound();
  // Starts empty and hydrates in an effect: reading localStorage during render
  // would make the server and first client pass disagree.
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Which automation's stored conversation `turns` currently holds. It has to
  // be state, not a ref: a ref would already read "hydrated" on the same commit
  // that requested the load, and the save effect would write the still-empty
  // initial state straight over the stored conversation.
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const automationId = automation.id;

  useEffect(() => {
    setTurns(loadTurns(automationId));
    setHydratedFor(automationId);
  }, [automationId]);

  useEffect(() => {
    if (hydratedFor !== automationId) return;
    try {
      localStorage.setItem(chatKey(automationId), JSON.stringify(turns.slice(-MAX_TURNS)));
    } catch {
      // Private mode / quota — the conversation just doesn't outlive the tab.
    }
  }, [turns, automationId, hydratedFor]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const send = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setInput("");
    setTurns((prev) => [...prev, { role: "user", text: prompt }]);
    setBusy(true);
    cue("loading");
    try {
      const response = await fetch("/api/automations/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          steps,
          turns: turns.filter(turn => turn.role !== "error").slice(-24).map(turn => ({
            role: turn.role,
            text: (turn.role === "assistant" ? turn.summary : turn.text).slice(0, 4000),
          })),
          name: automation.name,
          trigger: automation.trigger,
          triggerValue: automation.triggerValue,
          channel: automation.channel,
        }),
      });
      if (!response.ok) {
        cue("error");
        const failure = await readApiError(response, t);
        setTurns((prev) => [...prev, { role: "error", text: failure.message }]);
        return;
      }
      const parsed = workflowAssistantResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        cue("error");
        setTurns(prev => [...prev, { role: "error", text: t("apiError.generation_failed") }]);
        return;
      }
      const { reply, plan } = parsed.data;
      cue("ready");
      setTurns((prev) => [...prev, { role: "assistant", summary: reply, plan, applied: false }]);
    } catch (err) {
      cue("error");
      setTurns((prev) => [...prev, { role: "error", text: networkErrorMessage(t, err) }]);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void send(input);
  };

  const applyAt = (index: number) => {
    const turn = turns[index];
    if (!turn || turn.role !== "assistant" || !turn.plan) return;
    cue("success");
    onApplyPlan(turn.plan);
    setTurns((prev) => prev.map((item, i) => (i === index && item.role === "assistant" ? { ...item, applied: true } : item)));
  };

  const currentCount = countSteps(steps);
  const canSend = !busy && input.trim().length > 0;
  const isEmpty = turns.length === 0 && !busy;

  const composer = (
    <form onSubmit={handleSubmit}>
      <div
        className={cn(
          "rounded-[22px] border border-input bg-muted p-1.5 shadow-[var(--shadow-inset)]",
          "transition-[background-color,border-color,box-shadow] duration-200 ease-out",
          "focus-within:border-ring/50 focus-within:bg-card focus-within:shadow-[var(--shadow-inset),0_0_0_3px_oklch(0.5_0_0/0.1)]",
        )}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder={t("assistant.placeholder")}
          rows={2}
          className="w-full resize-none bg-transparent px-3 pt-2 pb-1 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-end">
          <Beam
            className="self-center"
            colorVariant="mono"
            // The idle surface is 6% opaque and the halo sits behind it, so the
            // beam waits until the button is actually live.
            active={canSend || busy}
            strength={busy ? 0.9 : 0.55}
          >
            <button
              type="submit"
              disabled={!canSend}
              aria-label={t("assistant.send")}
              className={cn(
                "flex size-8 items-center justify-center rounded-full",
                "transition-[background-color,color,transform,opacity] duration-200 ease-out",
                canSend
                  ? "bg-primary text-primary-foreground hover:scale-105 active:scale-95"
                  : "bg-foreground/[0.06] text-muted-foreground",
              )}
            >
              <HugeiconsIcon icon={ArrowUp01Icon} size={16} strokeWidth={1.75} />
            </button>
          </Beam>
        </div>
      </div>
    </form>
  );

  // Empty: the composer centres with a hero and one-tap starters, the same
  // shape as Senka's own chat. Once there's a conversation it drops to the
  // bottom and the transcript takes the room.
  if (isEmpty) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 px-4 pb-8">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* Same wordmark as the main chat — this is the same agent, just
              pointed at one flow, so it should introduce itself the same way. */}
          <h2 className="text-3xl font-semibold tracking-tight">
            <span className="text-foreground">senka</span>
          </h2>
          <p className="max-w-[34ch] text-balance text-[13px] leading-relaxed text-muted-foreground">
            {t("assistant.empty")}
          </p>
        </div>
        <div className="w-full max-w-md">{composer}</div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {SUGGESTION_KEYS.map((suggestionKey) => (
            // Opaque `bg-card` rather than `bg-card/50`: the beam's core is
            // painted behind the chip and a half-transparent pill lets it read
            // straight through.
            <Beam key={suggestionKey} colorVariant="mono" strength={0.4}>
              <SuggestionChip onClick={() => void send(t(suggestionKey))}>
                {t(suggestionKey)}
              </SuggestionChip>
            </Beam>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setTurns([])}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={1.75} aria-hidden="true" />
            {t("assistant.clear")}
          </Button>
        </div>

        {turns.map((turn, i) => {
          if (turn.role === "user") {
            return <UserTurn key={i} text={turn.text} />;
          }
          if (turn.role === "error") {
            return (
              <p
                key={i}
                className="list-fade-in rounded-2xl bg-destructive/10 px-3.5 py-2.5 text-[13px] leading-relaxed text-destructive"
              >
                {turn.text}
              </p>
            );
          }
          return (
            <div key={i} className="list-fade-in space-y-3">
              <StreamingResponse status="complete" copyText={turn.summary} showActions>
                <p className="text-[13px] leading-relaxed">{turn.summary}</p>
              </StreamingResponse>

              {/* The proposal reads as a task plan, because that is what it is:
                  the steps the flow will run, in order. Applying it marks the
                  whole list done. */}
              {turn.plan ? (
                <>
                  <TodoList
                    title={t("assistant.proposal")}
                    items={planToTodos(turn.plan, turn.applied, t)}
                    collapseOnComplete={false}
                    defaultOpen
                  />

                  <ApprovalCard
                    title={turn.applied ? t("assistant.applied") : t("assistant.apply")}
                    description={
                      turn.applied
                        ? undefined
                        : currentCount === 0
                          ? t("assistant.createsFlow")
                          : t("assistant.replaces", { count: currentCount })
                    }
                    status={turn.applied ? "approved" : "pending"}
                    approveLabel={t("assistant.apply")}
                    onApprove={() => applyAt(i)}
                  />
                </>
              ) : null}
            </div>
          );
        })}

        {busy ? (
          <div className="list-fade-in flex items-center gap-2">
            <Orb state="composing" />
            <ThinkingShimmer>{t("assistant.thinking")}</ThinkingShimmer>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 px-3 pb-3">{composer}</div>
    </div>
  );
}

/** The prompt someone sent, as a bubble that stays a pill only on one line. */
function UserTurn({ text }: { readonly text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const isPill = useFitsLines(ref, 1);
  return (
    <div className="list-fade-in flex justify-end">
      <p
        ref={ref}
        className={cn(
          "max-w-[85%] bg-primary py-2 text-[13px] leading-relaxed text-primary-foreground",
          isPill ? "rounded-full px-4" : "rounded-2xl px-3.5",
        )}
      >
        {text}
      </p>
    </div>
  );
}

/**
 * Flatten a proposed plan into task rows. Branches are indented under their
 * condition with the Sí/No label, so a fork still reads as a fork in a list.
 */
function planToTodos(
  plan: WorkflowPlan,
  applied: boolean,
  t: (key: string, vars?: Record<string, string | number>) => string,
): TodoItem[] {
  const items: TodoItem[] = [];
  const walk = (steps: readonly WorkflowPlanStep[], depth: number, branch?: string) => {
    steps.forEach((step, i) => {
      const preview = stepPreview({ type: step.type, config: step });
      items.push({
        id: `${depth}-${branch ?? "main"}-${i}`,
        status: applied ? "completed" : "pending",
        title: (
          <span className="inline-flex items-center gap-1.5" style={{ paddingLeft: depth * 12 }}>
            <HugeiconsIcon
              icon={STEP_ICONS[step.type]}
              size={12}
              strokeWidth={1.75}
              className="shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            {branch && i === 0 ? <span className="text-muted-foreground">{branch}</span> : null}
            {t(STEP_LABEL_KEYS[step.type])}
          </span>
        ),
        detail: preview ? <span className="max-w-[12ch] truncate">{preview}</span> : undefined,
      });
      if (step.thenSteps?.length) walk(step.thenSteps, depth + 1, t("automations.branchYes"));
      if (step.elseSteps?.length) walk(step.elseSteps, depth + 1, t("automations.branchNo"));
    });
  };
  walk(plan.steps, 0);
  return items;
}
