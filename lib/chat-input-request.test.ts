import type { EveDynamicToolPart, EveMessage } from "eve/react";
import { describe, expect, it } from "vitest";
import { mergeAnswers, type AnswerStore } from "./chat-input-answers";
import {
  answerLabel,
  approvalOutcome,
  conversationMovedOn,
  inputRequestPhase,
  isApprovalRequest,
} from "./chat-input-request";

const options = [
  { id: "gsc", label: "Conectar Search Console" },
  { id: "csv", label: "Subir CSV" },
];

function question(stepIndex = 1, state: EveDynamicToolPart["state"] = "approval-requested"): EveDynamicToolPart {
  return {
    type: "dynamic-tool",
    toolCallId: "call-1",
    toolName: "ask_question",
    stepIndex,
    state,
    input: { prompt: "¿Cómo seguimos?" },
    approval: { id: "req-1" },
    toolMetadata: {
      eve: {
        kind: "tool-call",
        name: "ask_question",
        inputRequest: { requestId: "req-1", prompt: "¿Cómo seguimos?", options },
      },
    },
  } as EveDynamicToolPart;
}

function assistant(parts: EveMessage["parts"]): EveMessage {
  return { id: "t1:assistant", role: "assistant", parts };
}

describe("inputRequestPhase", () => {
  it("is pending until someone answers or the agent moves on", () => {
    expect(inputRequestPhase({ state: "approval-requested", answer: undefined, movedOn: false })).toBe("pending");
  });

  it("is sending between the click and the agent resuming", () => {
    expect(inputRequestPhase({ state: "approval-responded", answer: { optionId: "gsc" }, movedOn: false })).toBe(
      "sending",
    );
  });

  // The bug: a question answered before a reload came back with live buttons
  // under text the agent had already written from that answer.
  it("closes a question the conversation already moved past, even with no answer on record", () => {
    expect(inputRequestPhase({ state: "approval-requested", answer: undefined, movedOn: true })).toBe("closed");
    expect(inputRequestPhase({ state: "approval-requested", answer: { optionId: "gsc" }, movedOn: true })).toBe(
      "answered",
    );
  });

  it("treats every terminal tool state as answered", () => {
    for (const state of ["output-available", "output-error", "output-denied"] as const) {
      expect(inputRequestPhase({ state, answer: undefined, movedOn: false }), state).toBe("answered");
    }
  });
});

describe("conversationMovedOn", () => {
  it("ignores a text part from the same step appended after the tool part", () => {
    const part = question(1);
    const message = assistant([{ type: "step-start" }, part, { type: "text", text: "Te pregunto:", stepIndex: 1 }]);
    expect(conversationMovedOn(message, true, part)).toBe(false);
  });

  it("sees a later step in the same message", () => {
    const part = question(1);
    const message = assistant([part, { type: "step-start" }, { type: "text", text: "Perfecto.", stepIndex: 2 }]);
    expect(conversationMovedOn(message, true, part)).toBe(true);
  });

  it("sees any later message", () => {
    const part = question(1);
    expect(conversationMovedOn(assistant([part]), false, part)).toBe(true);
  });
});

describe("answers", () => {
  it("labels an option by what the person saw, and free text as typed", () => {
    expect(answerLabel(options, { optionId: "csv" })).toBe("Subir CSV");
    expect(answerLabel(options, { text: "  otra cosa " })).toBe("otra cosa");
    expect(answerLabel(options, undefined)).toBeUndefined();
  });

  it("recognises eve's approval prompt and its outcome", () => {
    expect(isApprovalRequest([{ id: "approve", label: "Aprobar" }, { id: "deny", label: "Rechazar" }])).toBe(true);
    expect(isApprovalRequest(options)).toBe(false);
    expect(approvalOutcome(question(1, "approval-responded"), { optionId: "deny" })).toBe("denied");
    expect(
      approvalOutcome({ ...question(1), state: "output-denied", approval: { id: "req-1", approved: false } } as EveDynamicToolPart, undefined),
    ).toBe("denied");
  });

  it("keeps the newest sessions and drops the oldest past the cap", () => {
    let store: AnswerStore = { order: [], sessions: {} };
    store = mergeAnswers(store, "a", { r1: { optionId: "x" } }, 2);
    store = mergeAnswers(store, "b", { r2: { text: "y" } }, 2);
    store = mergeAnswers(store, "a", { r3: { optionId: "z" } }, 2);
    store = mergeAnswers(store, "c", { r4: { optionId: "w" } }, 2);
    expect(store.order).toEqual(["a", "c"]);
    expect(Object.keys(store.sessions).sort()).toEqual(["a", "c"]);
    expect(store.sessions).toMatchObject({ a: { r1: { optionId: "x" }, r3: { optionId: "z" } } });
  });
});
