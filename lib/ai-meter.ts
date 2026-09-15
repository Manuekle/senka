import { randomUUID } from "node:crypto";
import type { LanguageModelUsage } from "ai";
import { resolveProvider } from "./ai-provider";
import { recordUsage } from "./ai-usage";
import { billingSourceForProvider, checkCreditGate } from "./credit-gate";
import { warmCredentialCache } from "./credentials";
import { getInstallationId } from "./license/installation";

/** Shared pre-flight gate for browser routes and autonomous schedules. */
export async function checkAiCredits() {
  await warmCredentialCache();
  return checkCreditGate(await billingSourceForProvider(resolveProvider()));
}

/**
 * Records one direct AI SDK call. It lives outside the Next route layer so
 * Eve schedules can use it without pulling `next/server` into agent builds.
 */
export async function recordAiUsage(input: {
  readonly model: string;
  readonly usage: LanguageModelUsage | undefined;
  readonly conversationId?: string;
  readonly channel?: string;
}): Promise<void> {
  if (!input.usage) return;

  try {
    const provider = resolveProvider();
    await recordUsage({
      organizationId: await getInstallationId(),
      conversationId: input.conversationId ?? null,
      channel: input.channel ?? "web",
      provider,
      model: input.model,
      usageType: "llm",
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      cachedInputTokens: input.usage.inputTokenDetails?.cacheReadTokens,
      billingSource: await billingSourceForProvider(provider),
      idempotencyKey: randomUUID(),
    });
  } catch (error) {
    // A metering failure must never hide a successful answer.
    console.error("[ai-meter] usage not recorded", error);
  }
}
