import { defineHook } from "eve/hooks";
import { channelFromKind } from "../../lib/business-store";
import { resolveProvider, resolveModelId } from "../../lib/ai-provider";
import { claimChatModelSync } from "../../lib/chat-model-store";
import { getInstallationId } from "../../lib/license/installation";
import { billingSourceForProvider } from "../../lib/credit-gate";
import { recordUsage } from "../../lib/ai-usage";
import { activeBusinessId } from "../../lib/business-scope";

// Turns Eve's own step.completed usage into an AIUsage row and, when the
// call drew on included credits, a ledger charge — see lib/ai-usage.ts and
// lib/credit-account.ts for the actual recording/charging logic. This file
// only gathers what step.completed and the session context can tell us.
//
// Known gap: step.completed carries no domain-level "which configured Agent
// answered this" or "which dashboard user" identifier — HookContext only
// exposes eve's own agent/nodeId (the runtime agent, not Senka's Agent
// entity from lib/types.ts) and the session id. agentId and userId are left
// null here rather than guessed; a future pass can fill them in once Senka's
// Agent-to-conversation binding is threaded through to this context.

export default defineHook({
  events: {
    async "step.completed"(event, ctx) {
      try {
        const usage = event.data.usage;
        if (!usage) return; // a step with no usage payload has nothing to record

        const provider = resolveProvider();
        const model = claimChatModelSync(ctx.session.id) ?? resolveModelId(provider);
        const [organizationId, billingSource] = await Promise.all([
          getInstallationId(),
          billingSourceForProvider(provider),
        ]);

        const generationId = event.data.providerMetadata?.gateway.generationId;
        const idempotencyKey = generationId ?? `${ctx.session.id}:${event.data.turnId}:${event.data.stepIndex}`;

        await recordUsage({
          organizationId,
          workspaceId: await activeBusinessId(),
          conversationId: ctx.session.id,
          channel: channelFromKind(ctx.channel.kind),
          provider,
          model,
          usageType: "llm",
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cachedInputTokens: usage.cacheReadTokens,
          knownProviderCostUsd: usage.costUsd,
          billingSource,
          idempotencyKey,
        });
      } catch {
        // Usage recording must never fail a turn — the conversation already
        // happened and the model already answered; losing one usage row is
        // far cheaper than breaking the reply over it.
      }
    },
  },
});
