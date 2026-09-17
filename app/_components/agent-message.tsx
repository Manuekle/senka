"use client";

import type { EveDynamicToolPart, EveMessage, EveMessagePart } from "eve/react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { ExternalLinkIcon, File01Icon } from "@hugeicons/core-free-icons";
import { memo } from "react";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { MessageResponse } from "@/components/ai-elements/message-response";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { ToolResult, ToolResultOutput, type ToolResultStatus } from "@/components/agents/tool-result";
import { isArtifactPart, ToolArtifact } from "./chat/artifacts";
import { InputRequestCard } from "./chat/input-request-card";
import { Orb } from "@/components/ui/orb";
import { Button } from "@/components/ui/button";
import { conversationMovedOn } from "@/lib/chat-input-request";
import type { SessionAnswers } from "@/lib/chat-input-answers";
import { useT } from "@/lib/i18n/provider";

export type AgentInputResponse = {
  readonly optionId?: string;
  readonly requestId: string;
  readonly text?: string;
};

export const AgentMessage = memo(function AgentMessage({
  answers,
  canRespond,
  isLast,
  isStreaming,
  message,
  onInputResponses,
}: {
  /** Answers given on this device to the agent's questions, by request id. */
  readonly answers: SessionAnswers;
  readonly canRespond: boolean;
  /** Whether this is the newest message — a question in an older one is settled. */
  readonly isLast: boolean;
  readonly isStreaming: boolean;
  readonly message: EveMessage;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
}) {
  const t = useT();
  const lastTextIndex = message.parts.reduce(
    (last, part, index) => (part.type === "text" ? index : last),
    -1,
  );
  const hasText = lastTextIndex >= 0;

  return (
    <Message
      data-optimistic={message.metadata?.optimistic ? "true" : undefined}
      from={message.role}
    >
      <MessageContent>
        {message.parts.map((part, index) => (
          <AgentMessagePart
            answers={answers}
            canRespond={canRespond}
            isLast={isLast}
            key={partKey(part, index)}
            message={message}
            onInputResponses={onInputResponses}
            part={part}
            showCaret={isStreaming && message.role === "assistant" && index === lastTextIndex}
          />
        ))}
        {/* Active composing indicator — shown when the assistant is
            streaming but hasn't emitted text content yet. */}
        {isStreaming && message.role === "assistant" && !hasText ? (
          <div className="flex items-center gap-2.5 py-1 pl-1 text-muted-foreground">
            <Orb state="composing" />
            <span className="text-xs">{t("chat.composing")}</span>
          </div>
        ) : null}
      </MessageContent>
    </Message>
  );
});

function AgentMessagePart({
  answers,
  canRespond,
  isLast,
  message,
  onInputResponses,
  part,
  showCaret,
}: {
  readonly answers: SessionAnswers;
  readonly canRespond: boolean;
  readonly isLast: boolean;
  readonly message: EveMessage;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
  readonly part: EveMessagePart;
  readonly showCaret: boolean;
}) {
  const t = useT();
  switch (part.type) {
    case "step-start":
      return null;
    case "text":
      return (
        <MessageResponse caret="block" isAnimating={showCaret}>
          {part.text}
        </MessageResponse>
      );
    case "reasoning":
      return (
        <Reasoning defaultOpen isStreaming={part.state === "streaming"}>
          <ReasoningTrigger />
          <ReasoningContent>{part.text}</ReasoningContent>
        </Reasoning>
      );
    case "file": {
      const label = part.filename ?? t("chat.attachment");
      const isImage =
        part.mediaType?.startsWith("image/") ||
        part.url?.startsWith("data:image/") ||
        /\.(png|jpe?g|webp|gif|svg)$/i.test(label);

      if (isImage && part.url) {
        return (
          <div className="space-y-1.5 my-1">
            <div className="group relative overflow-hidden rounded-xl border border-border/80 bg-muted/40 max-w-sm shadow-sm transition hover:shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={part.url}
                alt={label}
                className="max-h-72 w-full object-contain rounded-xl bg-card"
                loading="lazy"
              />
              <a
                href={part.url}
                target="_blank"
                rel="noreferrer"
                className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium gap-1.5"
              >
                <span>Ver imagen completa</span>
                <HugeiconsIcon icon={ExternalLinkIcon} size={14} strokeWidth={2} />
              </a>
            </div>
            {part.filename && (
              <span className="block text-[11px] text-muted-foreground truncate max-w-sm">
                {part.filename}
              </span>
            )}
          </div>
        );
      }

      return (
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card/60 px-3.5 py-2.5 text-sm shadow-[var(--shadow-soft)] transition hover:border-input max-w-sm my-1">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <HugeiconsIcon icon={File01Icon} size={16} strokeWidth={1.75} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            {part.url ? (
              <a
                className="truncate font-medium text-foreground hover:underline inline-flex items-center gap-1"
                href={part.url}
                rel="noreferrer"
                target="_blank"
              >
                <span>{label}</span>
                <HugeiconsIcon icon={ExternalLinkIcon} size={12} strokeWidth={1.75} />
              </a>
            ) : (
              <span className="truncate font-medium">{label}</span>
            )}
            <span className="text-[10px] text-muted-foreground">{part.mediaType || "Archivo"}</span>
          </div>
        </div>
      );
    }
    case "authorization":
      return (
        <div className="space-y-2 rounded-lg border border-border bg-card/50 px-4 py-3 text-sm shadow-[var(--shadow-soft)]">
          <p className="font-medium">{part.displayName}</p>
          <p className="text-muted-foreground">{part.description}</p>
          {part.state === "required" ? (
            <>
              {part.authorization?.instructions ? <p>{part.authorization.instructions}</p> : null}
              {part.authorization?.userCode ? (
                <code className="block w-fit rounded bg-muted px-2 py-1">
                  {part.authorization.userCode}
                </code>
              ) : null}
              {part.authorization?.url ? (
                <Button asChild size="sm">
                  <a href={part.authorization.url} rel="noreferrer" target="_blank">
                    {t("chat.signIn")}
                    <HugeiconsIcon icon={ExternalLinkIcon} size={16} strokeWidth={1.75} />
                  </a>
                </Button>
              ) : null}
            </>
          ) : (
            <p>
              {part.outcome === "authorized"
                ? t("chat.authorizationComplete")
                : t("chat.authorizationStatus", { status: part.outcome })}
            </p>
          )}
        </div>
      );
    case "dynamic-tool": {
      // Two tools are not disclosures at all: `chart` and `report` exist to put
      // something on screen, so their payload replaces the terminal block
      // rather than hiding inside it. See ./chat/artifacts.
      if (isArtifactPart(part)) {
        return <ToolArtifact part={part} />;
      }

      const label = toolLabel(part);
      const inputRequest = part.toolMetadata?.eve?.inputRequest;

      // A question or an approval is a card, not a disclosure: it is waiting
      // on a person, and a spinner labelled "Ejecutando" tells them nothing.
      // An approval that went on to run still shows what it produced below.
      if (inputRequest) {
        const card = (
          <InputRequestCard
            answer={part.toolMetadata?.eve?.inputResponse ?? answers[inputRequest.requestId]}
            canRespond={canRespond}
            movedOn={conversationMovedOn(message, isLast, part)}
            onInputResponses={onInputResponses}
            part={part}
            toolLabel={label}
          />
        );
        const ran = part.state === "output-available" || part.state === "output-error";
        if (!ran || part.toolName === "ask_question") return card;
        const ranOutput = part.errorText ?? formatToolOutput(part.output);
        return (
          <div className="space-y-1">
            {card}
            <ToolResult
              tool={label}
              title={t(TOOL_STATE_KEYS[part.state] ?? "chat.toolRunning")}
              status={toolResultStatus(part.state)}
              kind="terminal"
              defaultOpen={false}
              copyText={ranOutput || undefined}
            >
              {ranOutput ? <ToolResultOutput language="json">{ranOutput}</ToolResultOutput> : null}
            </ToolResult>
          </div>
        );
      }

      // Everything else is an execution disclosure: name, status, and the
      // payload it produced, collapsed once it finishes so a long run doesn't
      // bury the answer.
      const output = part.errorText ?? formatToolOutput(part.output);
      return (
        <ToolResult
          tool={label}
          title={t(TOOL_STATE_KEYS[part.state] ?? "chat.toolRunning")}
          status={toolResultStatus(part.state)}
          kind="terminal"
          defaultOpen={false}
          collapseOnComplete
          copyText={output || undefined}
        >
          {output ? <ToolResultOutput language="json">{output}</ToolResultOutput> : null}
        </ToolResult>
      );
    }
    default: {
      const exhaustive: never = part;
      return exhaustive;
    }
  }
}

/** Map the Eve/AI-SDK part state onto the four states the disclosure renders. */
function toolResultStatus(state: EveDynamicToolPart["state"]): ToolResultStatus {
  switch (state) {
    case "output-error":
      return "error";
    case "output-available":
      return "success";
    case "output-denied":
      return "cancelled";
    default:
      return "running";
  }
}

const TOOL_STATE_KEYS: Partial<Record<EveDynamicToolPart["state"], string>> = {
  "approval-requested": "chat.toolAwaitingApproval",
  "approval-responded": "chat.toolApprovalSent",
  "input-streaming": "chat.toolPending",
  "input-available": "chat.toolRunning",
  "output-available": "chat.toolCompleted",
  "output-error": "chat.toolFailed",
  "output-denied": "chat.toolDenied",
};

/**
 * What the disclosure names the call. Eve prefixes framework actions
 * (`eve:load-skill`, `eve:subagent:analista`) and the bare prefix means nothing
 * to the person reading; the skill or specialist's own name does.
 */
function toolLabel(part: EveDynamicToolPart): string {
  const eve = part.toolMetadata?.eve;
  if (eve?.kind === "load-skill" || part.toolName === "eve:load-skill") {
    const name = isRecord(part.input) && typeof part.input.name === "string" ? part.input.name : undefined;
    return name ? `load_skill · ${name}` : "load_skill";
  }
  if (eve?.kind === "subagent-call" || part.toolName.startsWith("eve:subagent:")) {
    return eve?.name ?? part.toolName.slice("eve:subagent:".length);
  }
  return part.toolName;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Tool payloads arrive as objects far more often than strings. */
function formatToolOutput(output: unknown): string {
  if (output === undefined || output === null) return "";
  if (typeof output === "string") return output;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

function partKey(part: EveMessagePart, index: number): string {
  switch (part.type) {
    case "authorization":
      return `${part.type}:${part.turnId}:${part.name}`;
    case "dynamic-tool":
      return part.toolCallId;
    default:
      return `${part.type}:${index}`;
  }
}
