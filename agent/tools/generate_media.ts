import { defineTool } from "eve/tools";
import { generateImage, generateSpeech, experimental_generateVideo as generateVideo } from "ai";
import { z } from "zod";
import { getContactBySession } from "../../lib/business-store";
import { generateElevenLabsSpeech, hasElevenLabsKey } from "../../lib/elevenlabs";
import { sendWhatsAppMediaBytes } from "../../lib/whatsapp-send";
import { sendInstagramMediaBytes } from "../../lib/instagram-send";
import { getInstallationId } from "../../lib/license/installation";
import { billingSourceForElevenLabs, billingSourceForProvider, checkCreditGate, type BillingSource } from "../../lib/credit-gate";
import { recordUsage, type UsageType } from "../../lib/ai-usage";
import { assertToolAllowed } from "../../lib/agent-scope";

// Images and video are routed through the Vercel AI Gateway (same
// AI_GATEWAY_API_KEY as the chat model in agent/agent.ts) — no separate
// provider key needed.
//
// Audio prefers ElevenLabs when an ELEVENLABS_API_KEY is configured in
// /settings, and falls back to the Gateway speech model when it is not, so
// the tool keeps working on a fresh install.
const IMAGE_MODEL = "openai/gpt-image-1";
const SPEECH_MODEL = "openai/tts-1";
const VIDEO_MODEL = "google/veo-3.1-fast-generate-001";

const EXTENSION_BY_TYPE = { image: "png", audio: "mp3", video: "mp4" } as const;

/** "vendor/model" → {vendor, model} — the Gateway id shape these three
 *  constants use, split so AIUsage rows key the same way lib/model-pricing.ts
 *  and the chat-model catalog already do (bare model id under its vendor). */
function splitGatewayId(id: string): { readonly provider: string; readonly model: string } {
  const slash = id.indexOf("/");
  return slash === -1 ? { provider: id, model: id } : { provider: id.slice(0, slash), model: id.slice(slash + 1) };
}

/**
 * Records one media-generation call. Never throws — a lost usage row is far
 * cheaper than a failed (or worse, a silently mis-sent) media message, and
 * unlike a chat step there is no eve stream event for these calls at all
 * (they bypass the model loop entirely), so this is the only place they get
 * recorded. `ctx.callId` is the idempotency key — stable for one tool call,
 * same pattern agent/tools/run_python.ts already uses for its own filenames.
 *
 * Known gap: gpt-image-1 and veo-3.1 have no seeded ModelPricing yet (see
 * lib/model-pricing.ts), so their `provider_cost`/`credits_used` record as
 * null/0 until real prices are added — the usage itself (tokens, when the
 * provider reports them) is still captured. ElevenLabs is priced for real,
 * since lib/model-pricing.ts already seeds it.
 */
async function trackMediaUsage(opts: {
  readonly sessionId: string;
  readonly callId: string;
  readonly channel: string | undefined;
  readonly usageType: UsageType;
  readonly provider: string;
  readonly model: string;
  readonly billingSource: BillingSource;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly characters?: number;
}): Promise<void> {
  try {
    const organizationId = await getInstallationId();
    await recordUsage({
      organizationId,
      conversationId: opts.sessionId,
      channel: opts.channel,
      provider: opts.provider,
      model: opts.model,
      usageType: opts.usageType,
      inputTokens: opts.inputTokens,
      outputTokens: opts.outputTokens,
      characters: opts.characters,
      billingSource: opts.billingSource,
      idempotencyKey: opts.callId,
    });
  } catch {
    // Usage recording must never break media generation or sending.
  }
}

export default defineTool({
  description:
    "Generate an image, a short spoken-audio clip, or a short video from a text prompt, and send " +
    "it to the current contact on whichever channel they're messaging from (WhatsApp " +
    "or Instagram). Nothing is uploaded anywhere public — the file is generated, uploaded straight " +
    "to that platform's own media API, and sent. Video generation can take a while; say so before " +
    "calling this for a video. Not available on the web chat widget.",
  inputSchema: z.object({
    type: z.enum(["image", "audio", "video"]),
    prompt: z.string().min(1).describe("What to generate. For image and video, be descriptive — this is the only guidance the model gets. For audio, this is the exact script that gets spoken, word for word."),
    caption: z.string().optional().describe("Shown with the media on WhatsApp. Ignored on Instagram — that platform does not support attachment captions."),
    voice: z.string().optional().describe("Voice for audio, if the user asked for a specific one — an ElevenLabs voice id or one of george, sarah, daniel, charlotte. Defaults to the voice configured in Settings."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    status: z.number(),
    body: z.string(),
  }),
  async execute({ type, prompt, caption, voice }, ctx) {
    await assertToolAllowed(ctx.session.id, "generate_media");
    const contact = await getContactBySession(ctx.session.id);
    const channel = contact?.channel;

    if (channel !== "whatsapp" && channel !== "instagram") {
      return {
        ok: false,
        status: 0,
        body:
          channel === "web"
            ? "The web chat has no proactive send channel yet — describe the media instead, or tell the user this needs WhatsApp or Instagram."
            : "This contact has no messaging channel yet — nothing to send to.",
      };
    }
    if (channel !== "whatsapp" && !contact?.externalId) {
      return { ok: false, status: 0, body: `No ${channel} recipient id on this contact yet.` };
    }
    if (channel === "whatsapp" && !contact?.phone) {
      return { ok: false, status: 0, body: "No phone number on this contact yet." };
    }

    // Media generation bypasses Eve's text-model step resolver, so it needs
    // its own pre-flight credit check before asking a provider to do paid work.
    const useElevenLabs = type === "audio" && await hasElevenLabsKey();
    const billingSource = useElevenLabs
      ? await billingSourceForElevenLabs()
      : await billingSourceForProvider("gateway");
    const gate = await checkCreditGate(billingSource);
    if (!gate.allowed) return { ok: false, status: 0, body: gate.reason };

    let data: Uint8Array;
    let mimeType: string;
    try {
      if (type === "image") {
        const result = await generateImage({ model: IMAGE_MODEL, prompt, abortSignal: ctx.abortSignal });
        data = result.image.uint8Array;
        mimeType = result.image.mediaType;
        const { provider, model } = splitGatewayId(IMAGE_MODEL);
        await trackMediaUsage({
          sessionId: ctx.session.id,
          callId: ctx.callId,
          channel,
          usageType: "image",
          provider,
          model,
          billingSource,
          inputTokens: result.usage?.inputTokens,
          outputTokens: result.usage?.outputTokens,
        });
      } else if (type === "audio") {
        if (useElevenLabs) {
          const speech = await generateElevenLabsSpeech({
            text: prompt,
            voice,
            abortSignal: ctx.abortSignal,
          });
          data = speech.data;
          mimeType = speech.mimeType;
          await trackMediaUsage({
            sessionId: ctx.session.id,
            callId: ctx.callId,
            channel,
            usageType: "tts",
            provider: "elevenlabs",
            model: speech.modelId,
            billingSource,
            characters: speech.characters,
          });
        } else {
          const result = await generateSpeech({
            model: SPEECH_MODEL,
            text: prompt,
            voice,
            abortSignal: ctx.abortSignal,
          });
          data = result.audio.uint8Array;
          mimeType = result.audio.mediaType;
          const { provider, model } = splitGatewayId(SPEECH_MODEL);
          await trackMediaUsage({
            sessionId: ctx.session.id,
            callId: ctx.callId,
            channel,
            usageType: "tts",
            provider,
            model,
            billingSource,
            characters: prompt.length,
          });
        }
      } else {
        const result = await generateVideo({ model: VIDEO_MODEL, prompt, abortSignal: ctx.abortSignal });
        data = result.video.uint8Array;
        mimeType = result.video.mediaType;
        const { provider, model } = splitGatewayId(VIDEO_MODEL);
        await trackMediaUsage({
          sessionId: ctx.session.id,
          callId: ctx.callId,
          channel,
          usageType: "video",
          provider,
          model,
          billingSource,
        });
      }
    } catch (error) {
      return { ok: false, status: 0, body: `Generation failed: ${error instanceof Error ? error.message : String(error)}` };
    }

    const filename = `generated.${EXTENSION_BY_TYPE[type]}`;

    if (channel === "whatsapp") {
      return sendWhatsAppMediaBytes({ to: contact!.phone!, type, data, mimeType, filename, caption });
    }
    return sendInstagramMediaBytes({ recipientId: contact!.externalId!, type, data, mimeType, filename });
  },
});
