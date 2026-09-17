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
import { useAppLocale, useT } from "@/lib/i18n/provider";
import { networkErrorMessage, readApiError } from "@/lib/api-error-message";
import { useSound } from "@/components/sound-provider";
import { cn } from "@/lib/utils";
import type { AgentBrief } from "@/lib/types";
import type { AgentDraft } from "./agent-section-panel";
import { SuggestionChip } from "@/components/ui/suggestion-chip";
import { Button } from "@/components/ui/button";

// The interview.
//
// Same contract as the flow assistant next door: it proposes, a person
// applies. What is different is that this one is *building* rather than
// rewriting — each turn fills in part of the draft and asks the next thing it
// needs, so the questions it comes back with are as much of the answer as the
// patch is. They render as tappable chips, because "¿en qué idioma atendés?"
// with two buttons under it is a question somebody actually answers, and the
// same question in a text box is one they abandon.
//
// The proposal is a diff, not a config dump: only the fields this turn decided
// are listed, so applying it is a decision you can make in one read.

export type AssistantPatch = {
  readonly name?: string;
  readonly description?: string;
  readonly brief?: Partial<AgentBrief>;
  readonly capabilities?: readonly string[];
};

type Question = { readonly question: string; readonly options?: readonly string[] };

type Turn =
  | { readonly role: "user"; readonly text: string }
  | {
      readonly role: "assistant";
      readonly text: string;
      readonly patch: AssistantPatch;
      readonly questions: readonly Question[];
      readonly applied: boolean;
    }
  | { readonly role: "error"; readonly text: string };

/** Where one agent's interview lives between visits. */
const chatKey = (agentId: string) => `senka:agent-builder-chat:${agentId}`;
/**
 * What the owner typed into the create dialog, parked for the workspace to
 * pick up. It is the first thing they said about this agent, and asking them
 * to say it twice — once to create the thing, once to the interviewer — is the
 * kind of small stupidity that makes a builder feel like paperwork.
 */
export const seedKey = (agentId: string) => `senka:agent-builder-seed:${agentId}`;
const MAX_TURNS = 40;

function loadTurns(agentId: string): Turn[] {
  try {
    const raw = localStorage.getItem(chatKey(agentId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // User-writable storage: anything shaped wrong is dropped, not rendered.
    return parsed.filter((turn): turn is Turn => {
      if (!turn || typeof turn !== "object") return false;
      const role = (turn as { role?: unknown }).role;
      if (role === "user" || role === "error") return typeof (turn as { text?: unknown }).text === "string";
      return role === "assistant" && typeof (turn as { text?: unknown }).text === "string";
    });
  } catch {
    return [];
  }
}

const SUGGESTION_KEYS = [
  "builder.suggestReceptionist",
  "builder.suggestSales",
  "builder.suggestSupport",
] as const;

export function AgentAssistant({
  agentId,
  draft,
  onApply,
}: {
  readonly agentId: string;
  readonly draft: AgentDraft;
  readonly onApply: (patch: AssistantPatch) => void;
}) {
  const t = useT();
  const { locale } = useAppLocale();
  const { cue } = useSound();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // State rather than a ref, for the same reason the flow assistant uses
  // state: a ref would already read "hydrated" on the commit that asked for
  // the load, and the save effect would write the empty initial state over
  // the stored conversation.
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  // The draft as the assistant last saw it. Kept in a ref so `send` never has
  // to be rebuilt when a keystroke changes the draft.
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    setTurns(loadTurns(agentId));
    setHydratedFor(agentId);
  }, [agentId]);

  useEffect(() => {
    if (hydratedFor !== agentId) return;
    try {
      localStorage.setItem(chatKey(agentId), JSON.stringify(turns.slice(-MAX_TURNS)));
    } catch {
      // Private mode / quota — the interview just doesn't outlive the tab.
    }
  }, [turns, agentId, hydratedFor]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);


  const send = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setInput("");
    const history = [...turns];
    setTurns((prev) => [...prev, { role: "user", text: prompt }]);
    setBusy(true);
    cue("loading");
    try {
      const current = draftRef.current;
      const response = await fetch("/api/agents/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          locale,
          turns: history.map((turn) => ({
            role: turn.role === "user" ? "user" : "assistant",
            text: turn.role === "assistant" ? turn.text : turn.text,
          })),
          draft: {
            name: current.name,
            description: current.description,
            brief: current.brief,
            capabilities: current.tools,
          },
        }),
      });
      if (!response.ok) {
        cue("error");
        const failure = await readApiError(response, t);
        setTurns((prev) => [...prev, { role: "error", text: failure.message }]);
        return;
      }
      const data = (await response.json()) as {
        answer: {
          reply: string;
          patch: AssistantPatch;
          questions?: readonly Question[];
        };
      };
      cue("ready");
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.answer.reply,
          patch: data.answer.patch ?? {},
          questions: data.answer.questions ?? [],
          applied: false,
        },
      ]);
    } catch (err) {
      cue("error");
      setTurns((prev) => [...prev, { role: "error", text: networkErrorMessage(t, err) }]);
    } finally {
      setBusy(false);
    }
  };

  // `send` is rebuilt every render (it closes over the transcript), so the
  // seed effect below reaches it through a ref rather than listing it as a
  // dependency — which would re-run the effect on every keystroke.
  const sendRef = useRef<(text: string) => void>(() => {});
  useEffect(() => {
    sendRef.current = (text: string) => void send(text);
  });

  // The one line from the create dialog, sent as the opening message. Read
  // once and removed, so a reload does not ask it again.
  useEffect(() => {
    if (hydratedFor !== agentId) return;
    let seed: string | null = null;
    try {
      seed = sessionStorage.getItem(seedKey(agentId));
      if (seed) sessionStorage.removeItem(seedKey(agentId));
    } catch {
      // Private mode — the interview just starts empty.
    }
    if (seed?.trim()) sendRef.current(seed.trim());
    // Only on the transition into "hydrated for this agent": depending on the
    // transcript would re-fire the seed on every message.
  }, [hydratedFor, agentId]);

  const applyAt = (index: number) => {
    const turn = turns[index];
    if (!turn || turn.role !== "assistant") return;
    cue("success");
    onApply(turn.patch);
    setTurns((prev) =>
      prev.map((item, i) => (i === index && item.role === "assistant" ? { ...item, applied: true } : item)),
    );
  };

  const canSend = !busy && input.trim().length > 0;
  const isEmpty = turns.length === 0 && !busy;

  const composer = (
    <form
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void send(input);
      }}
    >
      <div
        className={cn(
          "rounded-[22px] border border-input bg-muted p-1.5 shadow-[var(--shadow-inset)]",
          "transition-[background-color,border-color,box-shadow] duration-200 ease-out",
          "focus-within:border-ring/50 focus-within:bg-card focus-within:shadow-[var(--shadow-inset),0_0_0_3px_oklch(0.5_0_0/0.1)]",
        )}
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(input);
            }
          }}
          placeholder={t("builder.assistantPlaceholder")}
          rows={2}
          className="w-full resize-none bg-transparent px-3 pt-2 pb-1 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-end">
          <Beam className="self-center" colorVariant="mono" active={canSend || busy} strength={busy ? 0.9 : 0.55}>
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

  if (isEmpty) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 px-4 pb-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">{t("builder.assistantTitle")}</h2>
          <p className="max-w-[34ch] text-balance text-[13px] leading-relaxed text-muted-foreground">
            {t("builder.assistantEmpty")}
          </p>
        </div>
        <div className="w-full max-w-md">{composer}</div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {SUGGESTION_KEYS.map((key) => (
            <Beam key={key} colorVariant="mono" strength={0.4}>
              <SuggestionChip onClick={() => void send(t(key))}>
                {t(key)}
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

        {turns.map((turn, index) => {
          if (turn.role === "user") return <UserTurn key={index} text={turn.text} />;
          if (turn.role === "error") {
            return (
              <p
                key={index}
                className="list-fade-in rounded-2xl bg-destructive/10 px-3.5 py-2.5 text-[13px] leading-relaxed text-destructive"
              >
                {turn.text}
              </p>
            );
          }
          const changes = patchToTodos(turn.patch, turn.applied, t);
          const isLast = index === turns.length - 1;
          return (
            <div key={index} className="list-fade-in space-y-3">
              <StreamingResponse status="complete" copyText={turn.text} showActions>
                <p className="text-[13px] leading-relaxed">{turn.text}</p>
              </StreamingResponse>

              {changes.length > 0 ? (
                <>
                  <TodoList
                    title={t("builder.proposal")}
                    items={changes}
                    collapseOnComplete={false}
                    defaultOpen
                  />
                  <ApprovalCard
                    title={turn.applied ? t("builder.applied") : t("builder.apply")}
                    description={turn.applied ? undefined : t("builder.applyHint")}
                    status={turn.applied ? "approved" : "pending"}
                    approveLabel={t("builder.apply")}
                    onApprove={() => applyAt(index)}
                  />
                </>
              ) : null}

              {/* Only the latest turn's questions stay tappable: answering one
                  from four turns ago would send the interview backwards. */}
              {isLast && turn.questions.length > 0 && !busy ? (
                <div className="space-y-2.5">
                  {turn.questions.map((question, questionIndex) => (
                    <div key={questionIndex} className="space-y-1.5">
                      <p className="text-[13px] leading-relaxed">{question.question}</p>
                      {question.options && question.options.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {question.options.map((option) => (
                            <SuggestionChip
                              key={option}
                              size="xs"
                              onClick={() => void send(option)}
                            >
                              {option}
                            </SuggestionChip>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}

        {busy ? (
          <div className="list-fade-in flex items-center gap-2">
            <Orb state="composing" />
            <ThinkingShimmer>{t("builder.assistantThinking")}</ThinkingShimmer>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 px-3 pb-3">{composer}</div>
    </div>
  );
}

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

/** The patch as a list of "field: new value" rows — the only readable form of
 *  a diff this narrow. Empty patches render nothing at all, which is what a
 *  turn that only asked a question should show. */
function patchToTodos(
  patch: AssistantPatch,
  applied: boolean,
  t: (key: string, vars?: Record<string, string | number>) => string,
): TodoItem[] {
  const items: TodoItem[] = [];
  const push = (field: string, value: string) => {
    if (!value.trim()) return;
    items.push({
      id: field,
      status: applied ? "completed" : "pending",
      title: <span className="text-xs">{t(`builder.field.${field}`)}</span>,
      detail: <span className="max-w-[18ch] truncate">{value}</span>,
    });
  };

  if (patch.name) push("name", patch.name);
  if (patch.description) push("description", patch.description);
  const brief = patch.brief ?? {};
  if (brief.role) push("role", brief.role);
  if (brief.goal) push("goal", brief.goal);
  if (brief.audience) push("audience", brief.audience);
  if (brief.tone) push("tone", brief.tone);
  if (brief.language) push("language", brief.language);
  if (brief.greeting) push("greeting", brief.greeting);
  if (brief.rules?.length) push("rules", brief.rules.join(" · "));
  if (brief.avoid?.length) push("avoid", brief.avoid.join(" · "));
  if (brief.handoff) push("handoff", brief.handoff);
  if (patch.capabilities?.length) push("capabilities", patch.capabilities.join(", "));
  return items;
}
