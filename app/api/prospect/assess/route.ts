import { type NextRequest, NextResponse } from "next/server";
import { apiError, missingField, withApiErrors } from "@/lib/api-error";
import {
  getChannelConversation,
  listAllVoiceCalls,
  setConversationProspect,
  setVoiceCallProspect,
} from "@/lib/business-store";
import { assessProspect } from "@/lib/prospect";
import { guardAiRoute } from "@/lib/ai-route-guard";

// POST /api/prospect/assess
// Re-read one transcript now instead of waiting for the schedule
// (agent/schedules/prospect.ts) to come round — the "assess again" button
// behind a conversation or a call that was just edited or just ended.
//
// One route for both mediums: a chat and a call answer the same question with
// the same vocabulary, and two endpoints would be two places for that to
// drift.

export const POST = withApiErrors(async function POST(request: NextRequest) {
  const refused = await guardAiRoute(request, "prospect-assess", {
    max: 12,
    windowMs: 5 * 60_000,
  });
  if (refused) return refused;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }
  if (!body || typeof body !== "object") return apiError("invalid_body");

  const { kind, id } = body as { kind?: unknown; id?: unknown };
  if (typeof id !== "string" || !id.trim()) return missingField("id");
  if (kind !== "conversation" && kind !== "call") return missingField("kind");

  if (kind === "conversation") {
    const conversation = await getChannelConversation(id);
    if (!conversation) return apiError("not_found");
    const assessment = await assessProspect({ turns: conversation.turns, medium: "chat" });
    if (!assessment) return apiError("generation_failed");
    await setConversationProspect(conversation.id, assessment);
    return NextResponse.json({ ok: true, prospect: assessment });
  }

  const call = (await listAllVoiceCalls()).find((c) => c.id === id);
  if (!call) return apiError("not_found");
  const assessment = await assessProspect({
    medium: "call",
    turns: call.transcript.map((turn) => ({
      role: turn.role === "user" ? ("user" as const) : ("assistant" as const),
      content: turn.message,
    })),
  });
  if (!assessment) return apiError("generation_failed");
  await setVoiceCallProspect(call.id, assessment);
  return NextResponse.json({ ok: true, prospect: assessment });
});
