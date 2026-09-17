import type { EveDynamicToolPart, EveMessage } from "eve/react";

// Where a question or an approval the agent put to the owner actually stands.
//
// Eve's default reducer cannot answer this on its own, for two reasons that
// together produced a card stuck on "Esperando aprobación · Ejecutando" under
// a conversation that had long moved on:
//
// 1. Answering an `ask_question` never produces an `action.result`. The
//    runtime feeds the answer to the model as a tool result and resumes; the
//    stream carries no event saying the question closed. So a part that
//    reached `approval-responded` stays there forever, and the chat drew a
//    spinner under it forever.
// 2. The answer itself is a *client* projection (`client.input.responded`). It
//    is not a stream event, so it is not in `onEvent`, not in the snapshot
//    `onFinish` hands back, and not in what gets saved. Reload the page or
//    reopen the conversation from Historial and the part is back to
//    `approval-requested` with live buttons.
//
// So the phase is derived from what the transcript *does* prove: an answer we
// recorded ourselves (see lib/chat-input-answers.ts), and whether the agent
// produced anything after the question — which it can only do once the
// question was resolved one way or another.

export type InputRequestPhase =
  /** Waiting on the person. The only phase with live controls. */
  | "pending"
  /** Answered here; the agent has not resumed yet. */
  | "sending"
  /** Answered, and the conversation continued from it. */
  | "answered"
  /** The conversation moved on and no answer was recorded on this device
   *  (answered by typing, from another tab, or before answers were saved). */
  | "closed";

export type InputAnswer = { readonly optionId?: string; readonly text?: string };

type RequestOptions = NonNullable<
  NonNullable<NonNullable<EveDynamicToolPart["toolMetadata"]>["eve"]>["inputRequest"]
>["options"];

/** Eve's approval prompt is exactly two options, `approve` then `deny`. The
 *  runtime uses the same test (harness/input-requests.js). */
export function isApprovalRequest(options: RequestOptions | undefined): boolean {
  return options?.length === 2 && options[0]?.id === "approve" && options[1]?.id === "deny";
}

/**
 * Whether anything after this tool part shows the agent resumed.
 *
 * Measured by step, not by array position: a text part completed for the same
 * step can be appended after the tool part without the turn having moved at
 * all. A later step in the same message, or any later message, cannot exist
 * while the question is still open.
 */
export function conversationMovedOn(
  message: EveMessage,
  isLastMessage: boolean,
  part: EveDynamicToolPart,
): boolean {
  if (!isLastMessage) return true;
  const step = part.stepIndex ?? -1;
  return message.parts.some((candidate) => {
    if (candidate === part || candidate.type === "step-start") return false;
    if (!("stepIndex" in candidate) || candidate.stepIndex === undefined) return false;
    return candidate.stepIndex > step;
  });
}

export function inputRequestPhase(input: {
  readonly state: EveDynamicToolPart["state"];
  readonly answer: InputAnswer | undefined;
  readonly movedOn: boolean;
}): InputRequestPhase {
  // An approval that ran, failed or was denied has a real terminal state.
  if (input.state === "output-available" || input.state === "output-error" || input.state === "output-denied") {
    return "answered";
  }
  if (input.answer) return input.movedOn ? "answered" : "sending";
  return input.movedOn ? "closed" : "pending";
}

/** What the person chose, as they saw it. */
export function answerLabel(options: RequestOptions | undefined, answer: InputAnswer | undefined): string | undefined {
  if (!answer) return undefined;
  if (answer.text?.trim()) return answer.text.trim();
  if (answer.optionId) return options?.find((option) => option.id === answer.optionId)?.label ?? answer.optionId;
  return undefined;
}

/** For an approval: what was decided, from the strongest evidence available. */
export function approvalOutcome(
  part: EveDynamicToolPart,
  answer: InputAnswer | undefined,
): "approved" | "denied" | undefined {
  if (part.state === "output-denied") return "denied";
  // Only an approved call reaches a result; a denied one ends in output-denied.
  if (part.state === "output-available" || part.state === "output-error") return "approved";
  if (answer?.optionId === "approve") return "approved";
  if (answer?.optionId === "deny") return "denied";
  return undefined;
}
