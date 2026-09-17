"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  FaceMimicIcon,
  Cancel01Icon,
  PaperclipIcon,
  Search01Icon,
  StopIcon,
  Tick02Icon,
  ToolCaseIcon,
} from "@hugeicons/core-free-icons";
import { type ReactNode, type Ref, useEffect, useRef } from "react";
import { ToolResult } from "@/components/agents/tool-result";
import { StreamingResponse } from "@/components/agents/streaming-response";
import { AppIcon } from "@/components/app-icon";
import { Message, MessageContent } from "@/components/ai-elements/message";

import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { ProviderLogo } from "@/components/provider-logo";
import { Beam } from "@/components/ui/beam";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { SuggestionChip } from "@/components/ui/suggestion-chip";
import { dailyGreeting } from "@/lib/chat-greeting";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import {
  type CursorApi,
  DemoCursor,
  type DemoStep,
  type Point,
  useDemoLoop,
  useStageLive,
  useStreamedWords,
  useTypewriter,
} from "./demo-cursor";
import { MockJson } from "./mock-json";
import { AppChrome } from "./screen-chrome";

/**
 * The chat, as `app/_components/agent-chat.tsx` renders it — and it is the one
 * screen where every part had to come from the app or it would read as a
 * generic assistant.
 *
 * Three things carry the look. A user message is a filled primary pill and an
 * assistant message has no surface at all; giving the assistant a grey bubble
 * is the single thing that stops a chat mockup looking like this product. Tool
 * calls are `ToolResult` — the terminal-icon disclosure with a coloured status
 * and a copy button — not the plain `Tool` header from `tool.tsx`, which is a
 * different component the chat has never used. And the model is chosen through
 * the app's own flow: a command palette over the screen, not a dropdown, which
 * is what `ModelPicker` actually opens.
 *
 * ── It plays ─────────────────────────────────────────────────────────
 *
 * This screen used to be one frame of a conversation that had already
 * happened. A still of an agent cannot show the thing being claimed: that it
 * takes a turn, calls a tool, finds nothing, and hands the conversation to a
 * person rather than inventing an answer. So a cursor drives it, on a loop —
 * pick the model, write the message, send it, watch the two tools run, read
 * the answer, start a new chat, again.
 *
 * The loop is the app's real order of operations, not a montage: the model
 * picker sits under the composer on an empty chat exactly as it does in the
 * product, the header with "New chat" only exists once there is a chat, and
 * the composer turns into a stop button while a turn is in flight.
 *
 * Nothing here is interactive — `ScreenFrame` marks the whole screen `inert`,
 * so the composer, the copy buttons and the feedback controls are out of the
 * tab order and the accessibility tree as well as unclickable. The pointer on
 * screen is the demo's, so it can never be confused with the visitor's own.
 */

// ── The script ──────────────────────────────────────────────────────

/**
 * One lap, about twenty-two seconds.
 *
 * The `reach*` phases are the travel and the phase after each one is the
 * click, which is why they come in pairs: a cursor that lands and clicks in
 * the same beat reads as a cut between two screenshots. The long holds are
 * where a person would be reading — the answer, and the moment after it.
 */
const SCRIPT = [
  { phase: "rest", ms: 1500 },
  { phase: "reachPicker", ms: 950 },
  { phase: "openPicker", ms: 1100 },
  { phase: "reachModel", ms: 1000 },
  { phase: "pickModel", ms: 620 },
  { phase: "reachInput", ms: 800 },
  { phase: "typing", ms: 2200 },
  { phase: "reachSend", ms: 700 },
  { phase: "send", ms: 480 },
  { phase: "search", ms: 1800 },
  { phase: "handoff", ms: 1900 },
  { phase: "answer", ms: 4200 },
  { phase: "read", ms: 3000 },
  { phase: "reachNew", ms: 1000 },
  { phase: "newChat", ms: 560 },
] as const satisfies readonly DemoStep<string>[];

type Phase = (typeof SCRIPT)[number]["phase"];

const ORDER: readonly Phase[] = SCRIPT.map((step) => step.phase);

/** The phases where the pointer presses something. */
const CLICKS: readonly Phase[] = ["openPicker", "pickModel", "send", "newChat"];

/**
 * How long the pointer has to reach the target of each phase — a little under
 * the phase itself, so it is standing still by the time anything is pressed.
 * The two after `send` are slower on purpose: nothing is waiting on them, and
 * a hand moving aside while the agent works should look unhurried.
 */
const TRAVEL: Partial<Record<Phase, number>> = {
  reachPicker: 760,
  reachModel: 780,
  reachInput: 620,
  reachSend: 520,
  reachNew: 780,
  search: 900,
};

/** The model the demo lands on. `DEFAULT_MODELS.anthropic`, verbatim. */
const PICKED_MODEL = "claude-sonnet-5";

/** What the picker resolves to before anyone chooses — `DEFAULT_MODELS.openai`. */
const AUTO_MODEL = "gpt-5-mini";

// ── Screen ──────────────────────────────────────────────────────────

export function ChatScreen() {
  const t = useT();

  const stage = useRef<HTMLDivElement>(null);
  const live = useStageLive(stage);
  const { phase, cycle } = useDemoLoop(SCRIPT, live);

  /**
   * What the screen shows when the loop is not running — off screen, on a
   * background tab, or for a visitor who asked for less motion. The answered
   * conversation rather than the empty chat: a still of the finished turn is
   * the frame that says the most, and it is the one this screen used to be.
   */
  const shown: Phase = live ? phase : "read";
  const step = ORDER.indexOf(shown);
  const from = (mark: Phase) => step >= ORDER.indexOf(mark);
  const on = (...marks: readonly Phase[]) => marks.includes(shown);

  // ── What the screen is showing ────────────────────────────────────
  const talking = from("send");
  const paletteOpen = on("openPicker", "reachModel");
  const model = from("pickModel") ? PICKED_MODEL : null;
  const busy = on("send", "search", "handoff", "answer");

  const userText = t("landing.demo.chat.userMsg");
  const answerText = t("landing.demo.chat.assistantMsg");

  const listing = on("search") ? "running" : from("handoff") ? "success" : null;
  const proposing = on("handoff") ? "running" : from("answer") ? "success" : null;

  // ── Where the pointer is ──────────────────────────────────────────
  const picker = useRef<HTMLSpanElement>(null);
  const modelRow = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLDivElement>(null);
  const send = useRef<HTMLButtonElement>(null);
  const newChat = useRef<HTMLSpanElement>(null);

  /** The pointer's handle. Everything it does is a GSAP tween on a DOM node,
   *  so driving it costs no render. */
  const cursor = useRef<CursorApi | null>(null);
  const draft = useRef<HTMLTextAreaElement>(null);

  useTypewriter(draft, userText, {
    active: on("typing"),
    done: on("reachSend"),
    ms: 1900,
    resetKey: cycle,
  });

  useEffect(() => {
    // A frame's grace: half these targets are written by the phase that just
    // started — the palette row, the header's "New chat" — and measuring them
    // in the same tick that asked for them measures nothing. Where a phase has
    // no target of its own the pointer holds its last position, which is what
    // keeps it still over the answer while the answer is arriving.
    const target = () => {
      if (on("reachPicker", "openPicker")) return picker.current;
      if (on("reachModel", "pickModel")) return modelRow.current;
      if (on("reachInput", "typing")) return composer.current;
      if (on("reachSend", "send")) return send.current;
      if (on("reachNew", "newChat")) return newChat.current;
      // While the turn is in flight the hand rests on the composer it just
      // used. There is only one, and it has not moved.
      if (on("search", "handoff", "answer", "read")) return composer.current;
      return null;
    };

    const frame = requestAnimationFrame(() => {
      cursor.current?.travelTo(target(), {
        bias: on("reachInput", "typing") ? INPUT_BIAS : undefined,
        // The travel finishes inside its own phase, always. A pointer still
        // sliding when the next phase presses is the bug that made the click
        // land on nothing: the ring fired mid-flight, over whatever happened
        // to be under it.
        ms: TRAVEL[shown] ?? 620,
      });
      // Press only once the travel that preceded it has landed — every click
      // phase follows a `reach*` phase for exactly this reason.
      if (CLICKS.includes(shown)) cursor.current?.press();
    });
    return () => cancelAnimationFrame(frame);
    // `shown` is the whole dependency: every target above is a function of it.
  }, [shown]);

  return (
    <AppChrome
      // `/chat`, not `/`. The app's chat moved off the root route, so the
      // sidebar in the hero was lighting nothing at all — a shell with no
      // active row is the one state the real nav never shows.
      active="/chat"
      overlay={paletteOpen ? <ModelPalette picked={modelRow} /> : null}
      pattern
    >
      {/* `data-demo` is the flow's own state, on the element: "playing" while
          the script is running, "still" when it is parked. Nothing styles it —
          it is there so this loop can be watched from outside without reaching
          into React, which is the only way to check a timed animation. */}
      <div
        className="relative flex min-h-0 flex-1 flex-col"
        data-demo={live ? "playing" : "still"}
        ref={stage}
      >
        {/* The header is always in the layout and only visible once there is a
            chat to name. The app has no header on an empty one — but a header
            that appears mid-lap pushes everything under it down 56px, and the
            thing that moves most is the composer the pointer is aiming at. It
            keeps its 56px from the first frame; only its contents fade in. */}
        <header
          aria-hidden={!talking}
          className={cn(
            "flex h-14 shrink-0 items-center justify-between gap-3 px-4 transition-opacity duration-300 sm:px-6",
            talking ? "opacity-100" : "opacity-0",
          )}
        >
          {/* `flex-1` here and `shrink-0` on the group opposite. Both sides
              could shrink and the right one is a status pill, a model name and
              a button — none of which give ground — so the browser took the
              whole squeeze out of the left and the agent's name rendered as
              "sen…" on a tablet. */}
          <span className="flex min-w-0 flex-1 items-center gap-2.5">
            {/* `StatusDot`. The halo belongs to a turn that is actually in
                flight — idle is a flat dot with nothing around it. */}
            <span className="relative flex size-1.5">
              {busy ? (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              ) : null}
              <span
                className={cn(
                  "relative inline-flex size-1.5 rounded-full",
                  busy ? "bg-emerald-500" : "bg-muted-foreground",
                )}
              />
            </span>
            <h2 className="truncate font-medium text-sm">senka</h2>
          </span>

          <span className="flex shrink-0 items-center gap-2">
            {/* Dropped rather than squeezed, and at `lg` rather than `sm`.
                The three controls opposite the name measure 442px — the pill
                alone is 144 of them — and the header inside this frame is
                480px wide at tablet size, so the agent's name was left with
                26px and rendered as "s.". The pill is the one of the three
                that says the least on its own and the one the empty chat
                repeats in the rail below, so it is the one that goes. */}
            <ProviderStatus className="hidden lg:inline-flex" />
            <ModelTrigger
              label={model ?? t("models.autoWith", { model: AUTO_MODEL })}
              vendor={model ? "anthropic" : null}
            />
            <span ref={newChat}>
              <Button size="sm" variant="ghost">
                <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
                <span className="hidden sm:inline">{t("chat.newChat")}</span>
              </Button>
            </span>
          </span>
        </header>

        {/* Three bands, and the middle one never moves.
        
            The composer used to belong to whichever state was rendering — the
            empty chat centred it in a stack with the greeting and the starter
            rail, the conversation put it under the messages — so it jumped
            across the screen twice a lap, which is the last thing a control
            being typed into and clicked should do. Now the column is fixed:
            the log grows upward from the composer, the composer holds its
            line, and the rail below it stays in the layout even while it is
            invisible, because the moment it stops taking up room the composer
            drops. */}
        {/* `max-w-3xl`, as the app renders it in `agent-chat.tsx`. */}
        {/* Tighter on a phone. The three bands are sized for a 920px window;
            at 390px the same padding and the same 24px gutters were spending
            most of a 608px frame on air. */}
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-4 sm:gap-6 sm:px-6 sm:py-6">
          <div
            className={cn(
              // Masked at the top rather than scrolled: a long turn runs out of
              // room in a 672px window, and a message clipped on a hard edge
              // reads as a bug where a message fading out reads as a
              // conversation with more above it — which is the truth.
              "lp-chat-log flex min-h-0 flex-1 flex-col gap-6 overflow-hidden",
              talking ? "justify-end" : "justify-center",
            )}
          >
            {talking ? (
              <>
                <Message from="user">
                  <MessageContent>
                    {/* The app puts `MessageResponse` here, because a real
                        turn can contain Markdown. This one is a single
                        sentence out of the dictionary, and `MessageResponse`
                        is Streamdown — Shiki, KaTeX and Mermaid — which is
                        most of a megabyte of parser for a line of prose, on
                        the one screen that is above the fold. Plain text
                        renders identically inside the pill. */}
                    {userText}
                  </MessageContent>
                </Message>

                {listing ? (
                  <Message from="assistant">
                    <MessageContent>
                      <ToolResult
                        collapseOnComplete
                        copyText={t("landing.demo.chat.toolList")}
                        // Open while it runs and collapsed once it is done,
                        // which is the transition `collapseOnComplete` is for.
                        defaultOpen
                        kind="terminal"
                        status={listing}
                        title={t(listing === "running" ? "chat.toolRunning" : "chat.toolCompleted")}
                        tool="list_automations"
                      >
                        <MockJson>
                          {t("landing.demo.chat.toolList")}
                        </MockJson>
                      </ToolResult>

                      {proposing ? (
                        <ToolResult
                          collapseOnComplete
                          copyText={t("landing.demo.chat.toolProposal")}
                          defaultOpen
                          kind="terminal"
                          status={proposing}
                          title={t(
                            proposing === "running" ? "chat.toolRunning" : "chat.toolCompleted",
                          )}
                          tool="propose_automation"
                        >
                          <MockJson>
                            {t("landing.demo.chat.toolProposal")}
                          </MockJson>
                        </ToolResult>
                      ) : null}

                      <Answer
                        active={on("answer")}
                        cycle={cycle}
                        done={from("read")}
                        text={answerText}
                      />
                    </MessageContent>
                  </Message>
                ) : null}
              </>
            ) : (
              <div className="flex flex-col items-center gap-6 text-center">
                {/* The empty chat opens with the agent's mark beside the daily
                    greeting — a short question that rotates once a day, in the
                    display face, exactly as `agent-chat.tsx` renders it. The
                    wordmark it replaced said the product's name; this one
                    speaks to the person reading. */}
                <div className="flex items-center justify-center gap-3">
                  <AppIcon className="shrink-0 text-foreground" size={32} />
                  <h1 className="font-cooper text-3xl font-semibold text-foreground sm:text-4xl">
                    {dailyGreeting()}
                  </h1>
                </div>
                <p className="max-w-sm text-balance text-sm leading-relaxed text-muted-foreground">
                  {t("chat.tagline")}
                </p>
              </div>
            )}
          </div>

          <div className="w-full shrink-0" ref={composer}>
            <MockComposer
              busy={busy}
              draft={draft}
              hasDraft={on("typing", "reachSend")}
              send={send}
            />
          </div>

          {/* The empty chat's rail: the plan pill, the provider badge with the
              model picker beside it, the tabs and the starter prompts. It sits
              under the composer because that is where the app puts it, and it
              stays in the layout when there is a chat because that is what
              holds the composer still. */}
          <div
            aria-hidden={talking}
            className={cn(
              "flex w-full shrink-0 flex-col items-center gap-4 text-center transition-opacity duration-300 sm:gap-5",
              talking ? "opacity-0" : "opacity-100",
            )}
          >
            <div className="flex items-center gap-2">
              <ProviderStatus />
              <ModelTrigger
                label={model ?? t("models.autoWith", { model: AUTO_MODEL })}
                ref={picker}
                vendor={model ? "anthropic" : null}
              />
            </div>
            <SlidingTabs
              onValueChange={NOOP}
              tabs={[
                { id: "chat", label: t("chat.tabChat") },
                { id: "automate", label: t("chat.tabAutomate") },
                { id: "analyze", label: t("chat.tabAnalyze") },
              ]}
              value="chat"
            />
            {/* One starter below `sm`, two from `sm`, three from `lg` —
                as `agent-chat.tsx` renders all three of the active tab's
                prompts.
            
                This rail keeps its height when the chat is talking — that is
                what holds the composer still while the pointer types into it —
                so whatever it measures, the conversation pays for. Three chips
                fit on one line at 920px and take extra lines at 390px, and
                those extra lines were empty screen under the composer on a
                phone: nearly half the window, blank, on the one figure the
                page opens with. */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {[t("chat.promptChat1"), t("chat.promptChat2"), t("chat.promptChat3")].map(
                (p, index) => (
                  <span
                    className={cn(
                      index === 1 && "hidden sm:contents",
                      index === 2 && "hidden lg:contents",
                    )}
                    key={p}
                  >
                    <Beam active colorVariant="mono" strength={0.4}>
                      <SuggestionChip>{p}</SuggestionChip>
                    </Beam>
                  </span>
                ),
              )}
            </div>
          </div>
        </div>

        <DemoCursor api={cursor} stage={stage} />
      </div>
    </AppChrome>
  );
}

/**
 * The composer, as `app/_components/chat/chat-input.tsx` draws it.
 *
 * A static twin rather than the component itself, and the two reasons are both
 * hard blockers. `ChatInput` holds its text in React state, and the demo types
 * by writing `node.value` straight onto the textarea — a controlled field
 * would throw every letter away on the next render, and re-rendering this
 * screen once per letter would re-render the sidebar with it. And it fetches
 * `/api/chat/agents` on mount to populate the `@` menu, which is a request the
 * marketing page has no business making.
 *
 * So the markup is copied and the behaviour is not: same double frame — a muted
 * outer one (`rounded-[20px] border-border/70 bg-muted/50 p-1.5` — the
 * attachment chips live in its gap —) holding the actual composer panel
 * (`rounded-[14px] border-border/50 bg-card p-4 shadow-xs`), same bare
 * textarea over a bottom bar, same attach and tools buttons, and the same send
 * control — a solid `size-9 rounded-2xl` square that turns into the
 * destructive stop button while a turn is in flight, which is the swap the
 * loop is built around. It replaced `PromptInput`, the pill with the round
 * submit floating inside it, which the chat stopped using and only
 * `/agents/[id]/chat` still does.
 */
function MockComposer({
  busy,
  draft,
  hasDraft,
  send,
}: {
  readonly busy: boolean;
  readonly draft: Ref<HTMLTextAreaElement>;
  /** Whether there is anything to send. The real button dims to 20% on an
   *  empty field, and the loop spends a third of its lap there. */
  readonly hasDraft: boolean;
  readonly send: Ref<HTMLButtonElement>;
}) {
  const t = useT();

  return (
    <div className="relative w-full rounded-[20px] border border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
      <div className="rounded-[14px] border border-border/50 bg-card p-4 shadow-xs">
        {/* Uncontrolled on purpose — see the note above. */}
        <textarea
          className="max-h-56 w-full resize-none bg-transparent px-1 py-1 text-foreground text-sm leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none"
          placeholder={t("chat.sendPlaceholder")}
          readOnly
          ref={draft}
          rows={1}
        />

        <div className="relative flex items-center gap-2 px-0.5 pt-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl border border-border/60 text-muted-foreground">
            <HugeiconsIcon icon={PaperclipIcon} size={16} strokeWidth={2} />
          </span>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl border border-border/60 text-muted-foreground">
            <HugeiconsIcon icon={ToolCaseIcon} size={16} strokeWidth={2} />
          </span>

          <div className="flex-1" />

        {/* The ref is on the button itself. It was on a wrapping `<span>`
            once, and a span around an absolutely placed button measures 0×0 —
            so the pointer had nothing to aim at and the click on "send"
            landed over the middle of the composer. */}
        <button
          aria-label={busy ? t("chat.stop") : t("chat.send")}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-2xl transition-opacity",
            busy
              ? "bg-destructive text-destructive-foreground"
              : cn("bg-foreground text-background", !hasDraft && "opacity-20"),
          )}
          ref={send}
          type="button"
        >
          <HugeiconsIcon
            icon={busy ? StopIcon : ArrowUp01Icon}
            size={busy ? 14 : 15}
            strokeWidth={busy ? 2 : 2.5}
          />
        </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The answer arriving.
 *
 * A component of its own, and that is the point: the words land twenty-odd
 * times over three seconds, and every one of those is a render. Kept here it
 * renders a paragraph; kept in `ChatScreen` it would render the sidebar, the
 * nav, the composer and every card in the mockup along with it.
 */
function Answer({
  active,
  cycle,
  done,
  text,
}: {
  readonly active: boolean;
  readonly cycle: number;
  readonly done: boolean;
  readonly text: string;
}) {
  const shown = useStreamedWords(text, { active, done, ms: 3800, resetKey: cycle });
  if (!shown) return null;

  return (
    <StreamingResponse
      // `announce={false}`: the words land one at a time and a live region
      // would read the answer again on every one of them.
      announce={false}
      copyText={text}
      showActions
      status={active ? "streaming" : "complete"}
    >
      {shown}
    </StreamingResponse>
  );
}

const NOOP = () => {};

/** Where in the composer the pointer lands: the start of the line, not the
 *  middle of the box, because that is where a caret goes. */
const INPUT_BIAS: Point = { x: 0.08, y: 0.3 };

/**
 * `ProviderStatusBadge` over the demo catalogue: the provider's state and the
 * balance left on it, which is what that pill says. Not the model — the model
 * is the picker's job, and putting its name here was the mockup saying
 * something the app never says.
 */
function ProviderStatus({ className }: { readonly className?: string }) {
  const t = useT();

  return (
    <StatusBadge
      className={className}
      label={`${t("models.status.ok")} · ${t("models.balance", { amount: "18.40" })}`}
      status="connected"
    />
  );
}

/**
 * `ModelPicker`'s trigger, down to the vendor mark and the id it prints. With
 * nothing chosen it reads `Auto · gpt-5-mini`, the app's `models.autoWith` over
 * what the automatic choice resolves to.
 */
function ModelTrigger({
  label,
  ref,
  vendor,
}: {
  readonly label: string;
  readonly ref?: Ref<HTMLSpanElement>;
  readonly vendor: "anthropic" | null;
}) {
  const t = useT();
  return (
    <span
      className="inline-flex max-w-[15rem] items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 font-medium text-xs shadow-[var(--shadow-inset)] transition-colors hover:border-input hover:bg-accent"
      ref={ref}
      title={t("models.pick")}
    >
      {vendor ? (
        <ProviderLogo size={14} vendor={vendor} />
      ) : (
        <HugeiconsIcon icon={FaceMimicIcon} size={14} strokeWidth={1.75} />
      )}
      <span className="truncate">{label}</span>
      <HugeiconsIcon
        className="shrink-0 text-muted-foreground"
        icon={ArrowDown01Icon}
        size={14}
        strokeWidth={1.75}
      />
    </span>
  );
}

/**
 * The palette the picker opens.
 *
 * `ModelPicker` mounts a `CommandDialog` — a search field over grouped rows,
 * not a dropdown — so that is what the demo opens, wearing `DialogContent`'s
 * own card, scrim, close button and open animation.
 *
 * A replica rather than the component itself, for two reasons. The real dialog
 * portals to `document.body`, and a dialog that escapes the mockup to cover the
 * landing page is a bug, not a demo. And `Command` underneath it moved the page
 * on every open — see the note on the list below.
 *
 * The card, the padding and the row heights are still the product's. An early
 * pass hand-rolled the rows out of bare `<div>`s with invented spacing and it
 * showed; what is hand-rolled now carries cmdk's own attributes and classes,
 * so the only thing missing is the store.
 */
function ModelPalette({
  picked,
}: {
  /** The row the pointer goes to — the one the demo chooses. */
  readonly picked: Ref<HTMLDivElement>;
}) {
  const t = useT();

  return (
    <div className="absolute inset-0 z-40 flex items-start justify-center px-4 pt-[8%]">
      {/* One scrim, two calibrations.
      
          The app's `DialogOverlay` is `bg-black/40` over the whole viewport,
          and at that size a dark wash reads as the room lights going down.
          Here the same wash is trapped inside a 1160×608 rectangle sitting on
          a white page, and a rectangle two shades darker than everything
          around it is not a dim — it is a slab. The sidebar, the header and
          the composer all flatten to the same mud and the palette floats on
          top of it.
      
          So in light mode the blur does the work and the black barely appears:
          5% and 8px defocuses the window without moving its value, and the
          palette's own card and float shadow carry the separation. 15% was
          tried first and was still a slab. Dark mode keeps the app's own
          numbers — against a dark ground a black wash is exactly right. */}
      <div
        aria-hidden="true"
        className="t-scrim absolute inset-0 bg-black/5 backdrop-blur-[8px] dark:bg-black/45 dark:backdrop-blur-[2px]"
        data-state="open"
      />

      <div
        className="t-modal relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-float)]"
        data-state="open"
      >
        {/* The dialog's own close control, at the inset a palette uses: its
            first row is a search field, not a padded header. */}
        <span className="absolute top-2.5 right-3 z-10 grid size-7 shrink-0 place-items-center rounded-[9px] text-muted-foreground">
          <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.75} />
        </span>

        {/* The DOM cmdk builds, without cmdk.
        
            `Command` was here, and it moved the page. On mount cmdk scrolls
            its selected row into view — `t.scrollIntoView({block:"nearest"})`
            in its `ce()`, scheduled unconditionally — and `nearest` walks up
            every scrollable ancestor, the document included. The hero frame is
            672px tall in an 800px window, so it is nearly always part-way off
            screen, and opening the palette yanked the whole landing down to
            centre a row nobody had asked to see. Lenis then smoothed the jump
            into a slide, which is why it read as the page moving by itself.
      
            Nothing cmdk does was wanted here: filtering is off, the input is
            readOnly, the frame is `inert`, and the highlighted row is fixed by
            the script. What is left is a store that fights the page. So the
            attributes and classes are cmdk's exactly — `cmdk-item`, the
            `data-selected` styling, the descendant rules on the root — and the
            store is gone. It renders identically and it holds still. */}
        <div
          className="flex h-full w-full flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground **:data-[slot=command-input-wrapper]:h-12 **:data-[slot=command-input-wrapper]:pr-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
          cmdk-root=""
          data-slot="command"
        >
          <div className="flex h-9 items-center gap-2 border-b px-3" data-slot="command-input-wrapper">
            <HugeiconsIcon
              className="shrink-0 opacity-50"
              icon={Search01Icon}
              size={16}
              strokeWidth={1.75}
            />
            <input
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground"
              cmdk-input=""
              data-slot="command-input"
              placeholder={t("models.searchPlaceholder")}
              readOnly
              type="text"
            />
          </div>

          {/* `pb-2` so the last row has the same air under it that the search
              row has over it — the app's list ends against a viewport, this
              one ends against the card's own edge. */}
          <div
            className="max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto pb-2"
            cmdk-list=""
            data-slot="command-list"
            role="listbox"
          >
            <PaletteGroup heading={t("models.automatic")}>
              <PaletteItem>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <HugeiconsIcon icon={FaceMimicIcon} size={16} strokeWidth={1.75} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{t("models.auto")}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {t("models.autoHint")}
                    </span>
                  </span>
                  <HugeiconsIcon
                    className="shrink-0 text-emerald-600 dark:text-emerald-400"
                    icon={Tick02Icon}
                    size={16}
                    strokeWidth={1.75}
                  />
                </div>
              </PaletteItem>
            </PaletteGroup>

            <PaletteGroup heading={t("models.recommendedGroup")}>
              {/* The row the pointer lands on, and the only one lit. */}
              <PaletteItem ref={picked} selected>
                <ModelRow
                  context="200"
                  id={PICKED_MODEL}
                  input="$3.00"
                  output="$15.00"
                  recommended
                  vendor="anthropic"
                />
              </PaletteItem>
            </PaletteGroup>

            <PaletteGroup heading={t("models.allGroup", { count: "1" })}>
              <PaletteItem>
                <ModelRow
                  context="400"
                  id={AUTO_MODEL}
                  input="$0.25"
                  output="$2.00"
                  vendor="openai"
                />
              </PaletteItem>
            </PaletteGroup>
          </div>
        </div>
      </div>
    </div>
  );
}

/** `CommandGroup`'s markup: the heading, then the items in their own box. */
function PaletteGroup({
  children,
  heading,
}: {
  readonly children: ReactNode;
  readonly heading: string;
}) {
  return (
    <div className="overflow-hidden p-1 text-foreground" cmdk-group="" role="presentation">
      <div aria-hidden="true" cmdk-group-heading="" className="px-2 py-1.5 text-xs">
        {heading}
      </div>
      <div cmdk-group-items="" role="group">
        {children}
      </div>
    </div>
  );
}

/** `CommandItem`'s markup. `data-selected` is what carries the highlight — the
 *  same attribute cmdk sets, so the class that reads it is unchanged. */
function PaletteItem({
  children,
  ref,
  selected = false,
}: {
  readonly children: ReactNode;
  readonly ref?: Ref<HTMLDivElement>;
  readonly selected?: boolean;
}) {
  return (
    <div
      aria-selected={selected}
      className="relative flex cursor-default select-none items-center gap-2 rounded-md text-sm outline-hidden data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground"
      cmdk-item=""
      data-selected={selected}
      data-slot="command-item"
      ref={ref}
      role="option"
    >
      {children}
    </div>
  );
}

/** `ModelRow` from the picker: vendor mark, id, the recommended chip, and the
 *  price line under it. */
function ModelRow({
  context,
  id,
  input,
  output,
  recommended = false,
  vendor,
}: {
  readonly context: string;
  readonly id: string;
  readonly input: string;
  readonly output: string;
  readonly recommended?: boolean;
  readonly vendor: "anthropic" | "openai";
}) {
  const t = useT();

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <ProviderLogo className="text-foreground" size={16} vendor={vendor} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm">{id}</span>
          {recommended ? (
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground">
              {t("models.recommended")}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground tabular-nums">
          {t("models.pricePerMillion", { input, output })} ·{" "}
          {t("models.context", { tokens: context })}
        </span>
      </span>
    </div>
  );
}
