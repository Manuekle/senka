import type { LanguageModelUsage } from "ai";
import type { NextRequest } from "next/server";
import { apiError } from "./api-error";
import { rateLimit } from "./rate-limit";
import { checkAiCredits, recordAiUsage } from "./ai-meter";

export { checkAiCredits } from "./ai-meter";

/**
 * The two checks every model call made from a Next route was missing.
 *
 * The Eve side of the app runs both: agent/hooks/usage.ts records each step
 * and lib/credit-gate.ts refuses one that has no credits left. The four routes
 * in app/api that call the model directly — the agent playground, the
 * automation assistant, the prompt optimizer, the email-template generator —
 * ran neither. Two consequences, both real:
 *
 *   An account at zero balance kept spending, because nothing asked. The
 *   ledger the billing page reads was undercounting by whatever the web UI
 *   burned.
 *
 *   Nothing bounded the call rate. A signed-in browser holding the send key
 *   is a loop against a metered provider, and until lib/auth/signup-policy.ts
 *   landed, "signed in" was anyone who found the URL.
 *
 * `guardAiRoute` is the gate — it refuses a call that should not start.
 * `recordRouteUsage` is the meter, and every one of the four calls it after
 * the model answers, so the ledger the billing page reads finally counts what
 * the web UI spends as well as what the channels do.
 */
export async function guardAiRoute(
  request: NextRequest,
  /** Names the rate-limit budget. Routes sharing a name share a counter. */
  bucket: string,
  options: { readonly max: number; readonly windowMs: number } = {
    max: 30,
    windowMs: 5 * 60_000,
  },
): Promise<Response | null> {
  const limit = rateLimit(`ai:${bucket}`, request, options);
  if (!limit.allowed) {
    return apiError("rate_limited", { status: 429 });
  }

  const gate = await checkAiCredits();
  if (!gate.allowed) {
    // 402 rather than the code's default: "you are out of credit" is not the
    // same answer as "slow down", and the billing page keys off the status.
    return apiError("unprocessable", { status: 402, message: gate.reason });
  }

  return null;
}

/**
 * Records one model call made from a Next route.
 *
 * Returns a promise and never rejects, and every caller awaits it. The first
 * version did not — it fired the write and returned, on the reasoning that the
 * answer was already on the wire and a usage row was not worth delaying it for.
 * That reasoning is wrong on a serverless host: the instance is frozen once the
 * response finishes, and unawaited work is simply dropped. Verified the hard
 * way — a real generation went through, the table stayed empty, and there was
 * not even an error in the logs, because the catch never ran either.
 *
 * So the wait is the point. For a stream the AI SDK awaits `onFinish`
 * (`Callback` returns `PromiseLike<void> | void`), so the row lands before the
 * stream closes; for the `generateObject` routes it is one transaction between
 * the model returning and the response being built. Failures are still
 * swallowed into a log line: losing a row must never turn a successful
 * generation into a 500.
 *
 * The idempotency key is a fresh uuid rather than something derived from the
 * request, and that is right here even though it means a duplicate can never
 * be detected. Eve's keys identify a call the *platform* may replay — a step
 * retried, a webhook redelivered — where two records would be one charge
 * counted twice. Nothing replays these: a browser that submits the same prompt
 * again has made a second call to the provider and been billed for it twice,
 * so recording it twice is the accurate answer.
 */
export async function recordRouteUsage(input: {
  readonly model: string;
  readonly usage: LanguageModelUsage | undefined;
  /** Which screen spent it, so the usage table can be read by feature. */
  readonly conversationId?: string;
  /** Scheduled work has no browser channel, but still belongs in the ledger. */
  readonly channel?: string;
}): Promise<void> {
  await recordAiUsage(input);
}
