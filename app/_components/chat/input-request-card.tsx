"use client";

import type { EveDynamicToolPart } from "eve/react";
import {
  CheckmarkCircle02Icon,
  CancelCircleIcon,
  HelpCircleIcon,
  Loading03Icon,
  ShieldKeyIcon,
} from "@hugeicons/core-free-icons";
import { type FormEvent, useId, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  answerLabel,
  approvalOutcome,
  inputRequestPhase,
  isApprovalRequest,
  type InputAnswer,
  type InputRequestPhase,
} from "@/lib/chat-input-request";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import type { AgentInputResponse } from "../agent-message";

/**
 * A question or an approval the agent is waiting on, drawn as a card instead
 * of a terminal disclosure.
 *
 * The disclosure said "Esperando aprobación · ask_question · Ejecutando" for a
 * plain question, kept spinning after it was answered, and came back with live
 * buttons after a reload — see lib/chat-input-request.ts for why. This card
 * shows the phase the transcript actually proves, and once a question is
 * settled it shrinks to what was asked and what was chosen.
 */
export function InputRequestCard({
  answer,
  canRespond,
  movedOn,
  onInputResponses,
  part,
  toolLabel,
}: {
  readonly answer: InputAnswer | undefined;
  readonly canRespond: boolean;
  readonly movedOn: boolean;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
  readonly part: EveDynamicToolPart;
  readonly toolLabel: string;
}) {
  const t = useT();
  const promptId = useId();
  const [text, setText] = useState("");
  const request = part.toolMetadata?.eve?.inputRequest;
  if (!request) return null;

  const approval = isApprovalRequest(request.options);
  const phase = inputRequestPhase({ state: part.state, answer, movedOn });
  const live = phase === "pending";
  const acceptsText = !approval && (request.allowFreeform || !request.options?.length);
  const chosenId = answer?.optionId;

  const respond = (response: Omit<AgentInputResponse, "requestId">) => {
    if (!live || !canRespond) return;
    void onInputResponses([{ requestId: request.requestId, ...response }]);
  };

  const handleText = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    respond({ text: value });
  };

  const outcome = approval ? approvalOutcome(part, answer) : undefined;
  const chosen = approval ? undefined : answerLabel(request.options, answer);
  const settled = phase === "answered" || phase === "closed";

  return (
    <section
      aria-labelledby={promptId}
      className={cn(
        "my-1 w-full rounded-2xl border p-4 text-sm transition-colors duration-200",
        settled
          ? "border-border/70 bg-transparent"
          : "border-border bg-card/70 shadow-[var(--shadow-soft)]",
      )}
      data-phase={phase}
    >
      <header className="flex items-center gap-2 text-xs text-muted-foreground">
        <HugeiconsIcon icon={approval ? ShieldKeyIcon : HelpCircleIcon} size={14} strokeWidth={1.75} />
        <span className="min-w-0 truncate font-medium">
          {approval ? t("chat.inputApprovalTitle") : t("chat.inputQuestionTitle")}
        </span>
        <PhaseBadge outcome={outcome} phase={phase} />
      </header>

      <p
        className={cn(
          "mt-2 text-pretty leading-relaxed",
          settled ? "text-muted-foreground" : "text-[15px] text-foreground",
        )}
        id={promptId}
      >
        {request.prompt}
      </p>

      {approval ? <ApprovalDetails input={part.input} settled={settled} toolLabel={toolLabel} /> : null}

      {settled ? (
        chosen && !approval ? (
          <p className="mt-3 flex items-center gap-2">
            <HugeiconsIcon
              className="text-emerald-600 dark:text-emerald-400"
              icon={CheckmarkCircle02Icon}
              size={16}
              strokeWidth={1.75}
            />
            <span className="text-muted-foreground">{t("chat.inputYouChose")}</span>
            <span className="font-medium text-foreground">{chosen}</span>
          </p>
        ) : phase === "closed" ? (
          <p className="mt-2 text-xs text-muted-foreground">{t("chat.inputClosedNote")}</p>
        ) : null
      ) : (
        <>
          {request.options?.length ? (
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-labelledby={promptId}>
              {request.options.map((option) => {
                const isChosen = chosenId === option.id;
                const variant =
                  approval && option.id === "approve"
                    ? "default"
                    : option.style === "danger"
                      ? "destructive"
                      : option.style === "primary"
                        ? "default"
                        : "outline";
                return (
                  <Button
                    aria-pressed={isChosen}
                    className={cn(
                      "h-auto min-h-8 max-w-full whitespace-normal py-1.5 text-left",
                      phase === "sending" && isChosen && "disabled:opacity-100",
                    )}
                    disabled={!live || !canRespond}
                    key={option.id}
                    onClick={() => respond({ optionId: option.id })}
                    size="sm"
                    title={option.description}
                    type="button"
                    variant={variant}
                  >
                    {phase === "sending" && isChosen ? (
                      <HugeiconsIcon
                        className="motion-safe:animate-spin"
                        icon={Loading03Icon}
                        size={14}
                        strokeWidth={2}
                      />
                    ) : null}
                    {approval
                      ? option.id === "approve"
                        ? t("chat.inputApprove")
                        : t("chat.inputDeny")
                      : option.label}
                  </Button>
                );
              })}
            </div>
          ) : null}

          {acceptsText ? (
            <form className="mt-2 flex gap-2" onSubmit={handleText}>
              <Input
                aria-label={t("chat.responseLabel")}
                className="h-8 min-w-0 flex-1"
                disabled={!live || !canRespond}
                onChange={(event) => setText(event.target.value)}
                placeholder={t("chat.typeResponse")}
                value={phase === "sending" && answer?.text ? answer.text : text}
              />
              <Button disabled={!live || !canRespond || !text.trim()} size="sm" type="submit" variant="secondary">
                {t("chat.send")}
              </Button>
            </form>
          ) : null}

          {live && !approval ? (
            <p className="mt-2 text-[11px] text-muted-foreground">{t("chat.inputTypeHint")}</p>
          ) : null}
        </>
      )}
    </section>
  );
}

function PhaseBadge({
  outcome,
  phase,
}: {
  readonly outcome: "approved" | "denied" | undefined;
  readonly phase: InputRequestPhase;
}) {
  const t = useT();
  if (phase === "pending") {
    return (
      <span className="ml-auto inline-flex shrink-0 items-center whitespace-nowrap gap-1.5 font-medium text-amber-600 dark:text-amber-400">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full rounded-full bg-current opacity-40 motion-safe:animate-ping" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
        {t("chat.inputPending")}
      </span>
    );
  }
  if (phase === "sending") {
    return (
      <span className="ml-auto inline-flex shrink-0 items-center whitespace-nowrap gap-1 font-medium text-blue-600 dark:text-blue-400">
        <HugeiconsIcon className="motion-safe:animate-spin" icon={Loading03Icon} size={12} strokeWidth={2} />
        {t("chat.inputSending")}
      </span>
    );
  }
  if (phase === "answered") {
    const denied = outcome === "denied";
    return (
      <span
        className={cn(
          "ml-auto inline-flex shrink-0 items-center whitespace-nowrap gap-1 font-medium",
          denied ? "text-destructive" : "text-emerald-600 dark:text-emerald-400",
        )}
      >
        <HugeiconsIcon icon={denied ? CancelCircleIcon : CheckmarkCircle02Icon} size={12} strokeWidth={2} />
        {denied ? t("chat.inputDenied") : outcome === "approved" ? t("chat.inputApproved") : t("chat.inputAnswered")}
      </span>
    );
  }
  return <span className="ml-auto shrink-0 whitespace-nowrap font-medium">{t("chat.inputClosed")}</span>;
}

function ApprovalDetails({
  input,
  settled,
  toolLabel,
}: {
  readonly input: unknown;
  readonly settled: boolean;
  readonly toolLabel: string;
}) {
  const t = useT();
  const json = formatInput(input);
  return (
    <details className="group mt-2 text-xs" open={!settled && json.length < 240}>
      <summary className="cursor-pointer select-none text-muted-foreground outline-none hover:text-foreground focus-visible:underline">
        {t("chat.inputToolDetails")} · <span className="font-mono">{toolLabel}</span>
      </summary>
      {json ? (
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/80 p-3 font-mono text-[11px] text-foreground/80">
          {json}
        </pre>
      ) : null}
    </details>
  );
}

function formatInput(input: unknown): string {
  if (input === undefined || input === null) return "";
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}
