import { runAutomationSteps } from "@/lib/automation-runner";
import { toMessagingChannel } from "@/lib/contact-channel";
import {
  ingestLead,
  listAutomations,
  recordAutomationFire,
  upsertChat,
} from "@/lib/business-store";
import type { LeadInput } from "@/lib/types";
import { type NextRequest, NextResponse } from "next/server";
import { apiError, withApiErrors } from "@/lib/api-error";
import { rateLimit } from "@/lib/rate-limit";

/** Completed webhook deliveries, for the `Idempotency-Key` retry contract.
 *  In memory, per process: a restart loses the set, which means a retried
 *  delivery may run twice across a redeploy — the same at-most-once horizon
 *  the route had before the header existed, now at least bounded within one
 *  process lifetime. */
const seenDeliveries = new Map<string, number>();
const IDEMPOTENCY_TTL_MS = 10 * 60_000;

/** True when this key was already processed; remembers it otherwise. */
function alreadyProcessed(key: string): boolean {
  const now = Date.now();
  for (const [entry, at] of seenDeliveries) {
    if (now - at > IDEMPOTENCY_TTL_MS) seenDeliveries.delete(entry);
  }
  if (seenDeliveries.has(key)) return true;
  seenDeliveries.set(key, now);
  return false;
}

/** Constant-time-ish comparison, so a wrong token can't be probed byte by byte. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Inbound webhook for one automation: an external system POSTs a lead payload
 * and the automation's deterministic steps run immediately. See
 * lib/automation-runner.ts for what "deterministic" covers.
 */
export const POST = withApiErrors(async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  // The budget comes first: the id lookup below is an existence oracle (an
  // unknown id and a known id with a bad secret answer differently), and a
  // caller with neither the id nor the token should not get to enumerate
  // either. Same bucket as /api/leads — one leaked webhook URL is one
  // address's worth of traffic.
  if (!rateLimit("public-webhook", request, { max: 30, windowMs: 10 * 60_000 }).allowed) {
    return apiError("rate_limited");
  }

  // A sender that retries on timeout can fire the automation twice — and the
  // steps message people. An `Idempotency-Key` makes the retry a no-op. The
  // replay answer is deliberately bare: nothing from the first run is
  // replayed to a caller who may not be the one that sent it.
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
  if (idempotencyKey) {
    if (idempotencyKey.length > 200 || !/^[\x21-\x7e]+$/.test(idempotencyKey)) {
      return apiError("invalid_field", { field: "Idempotency-Key" });
    }
    if (alreadyProcessed(`${id}:${idempotencyKey}`)) {
      return NextResponse.json({ ok: true, replayed: true });
    }
  }

  // The secret check moves ahead of the lookup: with the token verified
  // first, every unauthorised caller gets the same answer whether or not the
  // id exists, so the response cannot be used to enumerate automation ids.
  // Both "no such automation" and "wrong token" share one message for the
  // same reason.
  const provided = request.headers.get("x-webhook-secret");
  const automations = await listAutomations();
  const automation = automations.find((a) => a.id === id);
  if (!automation || automation.trigger !== "webhook") {
    return apiError("unauthorized", {
      message:
        "Send this automation's webhook token as the x-webhook-secret header. If the automation has no token yet, re-save it in Automations to have one generated.",
    });
  }
  const token = automation.triggerValue?.trim();
  if (!token || !provided || !secretsMatch(provided, token)) {
    return apiError("unauthorized", {
      message:
        "Send this automation's webhook token as the x-webhook-secret header. If the automation has no token yet, re-save it in Automations to have one generated.",
    });
  }
  if (automation.status !== "active") {
    return apiError("conflict", { message: "This automation is not active." });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("invalid_json");
  }
  if (!body || typeof body !== "object") {
    return apiError("invalid_body");
  }

  const input = body as LeadInput;
  const contact = await ingestLead({
    ...input,
    source: input.source ?? `webhook:${automation.name}`,
    channel: input.channel ?? (automation.channel === "all" ? "web" : automation.channel),
  });

  const channel = toMessagingChannel(contact.channel);
  await upsertChat({
    title: contact.name,
    channel,
    lastMessage: input.message ?? "Webhook",
    lastMessageAt: contact.lastMessageAt,
    messageCount: input.message ? 1 : 0,
  });

  await recordAutomationFire(automation.id);
  const results = await runAutomationSteps(automation.steps ?? [], contact);

  return NextResponse.json({ ok: true, automation: automation.id, contact, results });
});

// Same reasoning as /api/leads: this URL is pasted into third-party dashboards
// and opened by hand, so a GET should explain itself rather than 405 blankly.
export const GET = withApiErrors(function GET() {
  return apiError("method_not_allowed", {
    message: "This automation webhook only accepts POST.",
  });
});
