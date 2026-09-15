import { generateObject } from "ai";
import { z } from "zod";
import { getProviderReport } from "./provider-catalog";
import { modelIdForTask } from "./task-model";
import { resolveLanguageModel } from "./ai-provider";
import { checkAiCredits, recordAiUsage } from "./ai-meter";
import type { ProspectAssessment, ProspectStage } from "./types";

// Reading a transcript and saying where the person landed commercially.
//
// One classifier for both mediums: a WhatsApp thread and a phone call answer
// the same question ("did this go anywhere?") and deserve the same vocabulary,
// so the sales view of the business is one list and not two that disagree.

export const PROSPECT_STAGES = [
  "won",
  "lost",
  "negotiating",
  "interested",
  "no_response",
  "unqualified",
  "support",
] as const;

/** What each stage means, sent to the model verbatim. Editing these is how
 *  the classification changes — there are no rules anywhere else. */
const STAGE_GUIDE: Record<ProspectStage, string> = {
  won: "The person bought, booked, paid, signed, or confirmed the appointment. Only when it actually closed.",
  lost: "The person said no, went with someone else, or the deal was explicitly dropped.",
  negotiating: "A price, quote, or terms are on the table and the decision is still pending.",
  interested: "Real buying questions, engaged, but nothing quoted or scheduled yet.",
  no_response: "The person stopped answering before anything was decided.",
  unqualified: "Wrong fit — outside the service, the area, the budget, or not a buyer at all.",
  support: "Not a sale: an existing customer with a question, a complaint, or an issue.",
};

/** Turns read per assessment. The end of a conversation is what decides it,
 *  and a whole year of a WhatsApp thread is mostly not about the sale. */
const MAX_TURNS = 40;

/** Characters kept per turn — enough for a full message, short of a pasted
 *  document blowing up the prompt. */
const MAX_TURN_CHARS = 2000;

const assessmentSchema = z.object({
  stage: z.enum(PROSPECT_STAGES).describe("Where the conversation left the person commercially"),
  reason: z
    .string()
    .describe(
      "One short line, in the same language the conversation is in, naming what decided it. Quote the deciding moment rather than describing the chat.",
    ),
  nextStep: z
    .string()
    .nullable()
    .describe("What the business should do next, in the conversation's language. null when nothing is worth doing."),
});

export type AssessmentTurn = { readonly role: "user" | "assistant"; readonly content: string };

/** True when the transcript grew since the assessment was made. */
export function isProspectStale(
  assessment: ProspectAssessment | undefined,
  turnCount: number,
): boolean {
  if (!assessment) return true;
  // A person's own call overrides the model's until the conversation moves on.
  return assessment.turnCount < turnCount;
}

/**
 * Read a transcript and say where it left the person.
 *
 * Returns `null` rather than throwing when there is nothing to read, no model
 * credential, or the model failed: an unassessed conversation is a normal
 * state everywhere this is called from, and a wrong label is worse than none.
 */
export async function assessProspect(input: {
  readonly turns: readonly AssessmentTurn[];
  readonly medium: "chat" | "call";
  readonly agentName?: string;
}): Promise<ProspectAssessment | null> {
  const turns = input.turns.filter((turn) => turn.content.trim().length > 0);
  if (turns.length === 0) return null;

  const health = await getProviderReport();
  if (health.status === "missing" || health.status === "invalid") return null;
  if (!(await checkAiCredits()).allowed) return null;

  const who = input.medium === "call" ? "phone call" : "chat conversation";
  const agentLabel = input.agentName?.trim() || "the business";

  const system = [
    `You read one ${who} between a customer and an AI agent working for ${agentLabel}, and you report where it left the customer commercially.`,
    "",
    "## Stages",
    "",
    ...PROSPECT_STAGES.map((stage) => `- ${stage}: ${STAGE_GUIDE[stage]}`),
    "",
    "## Rules",
    "",
    "- Judge only what the transcript shows. Never assume a sale that was not confirmed in it.",
    "- A promise to think about it or to call back is not won — that is negotiating or interested.",
    "- A conversation the customer abandoned mid-way is no_response, whatever was discussed before.",
    "- Write reason and nextStep in the same language the conversation is in.",
    "- Keep reason under 140 characters, and make it specific: what was said, not how it felt.",
  ].join("\n");

  const transcript = turns
    .slice(-MAX_TURNS)
    .map((turn) => `${turn.role === "user" ? "Customer" : "Agent"}: ${turn.content.slice(0, MAX_TURN_CHARS)}`)
    .join("\n");

  try {
    const modelId = await modelIdForTask("quick");
    const result = await generateObject({
      model: resolveLanguageModel(modelId),
      schema: assessmentSchema,
      system,
      prompt: `Transcript:\n\n${transcript}`,
      abortSignal: AbortSignal.timeout(45_000),
    });
    await recordAiUsage({
      model: modelId,
      usage: result.usage,
      conversationId: `prospect:${input.medium}`,
      channel: "schedule",
    });
    return {
      stage: result.object.stage,
      reason: result.object.reason.trim(),
      nextStep: result.object.nextStep?.trim() || undefined,
      assessedAt: new Date().toISOString(),
      // Counted over the whole transcript, not the slice that was read — this
      // is what tells a later run that nothing has changed since.
      turnCount: turns.length,
      source: "ai",
    };
  } catch {
    return null;
  }
}
