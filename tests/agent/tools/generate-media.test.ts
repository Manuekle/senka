import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "eve/tools";

const mocks = vi.hoisted(() => ({
  image: vi.fn(),
  speech: vi.fn(),
  video: vi.fn(),
  contact: vi.fn(),
  elevenConfigured: vi.fn(),
  sendWhatsApp: vi.fn(),
  sendInstagram: vi.fn(),
  gate: vi.fn(),
  record: vi.fn(),
}));

vi.mock("ai", () => ({
  generateImage: mocks.image,
  generateSpeech: mocks.speech,
  experimental_generateVideo: mocks.video,
}));
vi.mock("../../../lib/business-store", () => ({ getContactBySession: mocks.contact }));
vi.mock("../../../lib/elevenlabs", () => ({
  generateElevenLabsSpeech: vi.fn(),
  hasElevenLabsKey: mocks.elevenConfigured,
}));
vi.mock("../../../lib/whatsapp-send", () => ({ sendWhatsAppMediaBytes: mocks.sendWhatsApp }));
vi.mock("../../../lib/instagram-send", () => ({ sendInstagramMediaBytes: mocks.sendInstagram }));
vi.mock("../../../lib/license/installation", () => ({ getInstallationId: async () => "install-test" }));
vi.mock("../../../lib/credit-gate", () => ({
  billingSourceForElevenLabs: async () => "BYOK",
  billingSourceForProvider: async () => "INCLUDED_CREDITS",
  checkCreditGate: mocks.gate,
}));
vi.mock("../../../lib/ai-usage", () => ({ recordUsage: mocks.record }));
vi.mock("../../../lib/agent-scope", () => ({ assertToolAllowed: async () => undefined }));

const generateMedia = (await import("../../../agent/tools/generate_media")).default;
const ctx = {
  session: { id: "session-1" },
  callId: "call-1",
  abortSignal: new AbortController().signal,
} as unknown as ToolContext;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.contact.mockResolvedValue({ channel: "whatsapp", phone: "+5491100000000" });
  mocks.elevenConfigured.mockResolvedValue(false);
  mocks.gate.mockResolvedValue({ allowed: true });
  mocks.sendWhatsApp.mockResolvedValue({ ok: true, status: 200, body: "sent" });
});

describe("generate_media", () => {
  it("refuses before paid generation when the credit gate is closed", async () => {
    mocks.gate.mockResolvedValue({ allowed: false, reason: "credits_exhausted" });

    const result = await generateMedia.execute({ type: "image", prompt: "Un gato" }, ctx);

    expect(result).toEqual({ ok: false, status: 0, body: "credits_exhausted" });
    expect(mocks.image).not.toHaveBeenCalled();
    expect(mocks.sendWhatsApp).not.toHaveBeenCalled();
  });

  it("sends generated image and records its usage after a passing gate", async () => {
    mocks.image.mockResolvedValue({
      image: { uint8Array: new Uint8Array([137, 80, 78, 71]), mediaType: "image/png" },
      usage: { inputTokens: 9, outputTokens: 1 },
    });

    const result = await generateMedia.execute({ type: "image", prompt: "Un gato" }, ctx);

    expect(result).toEqual({ ok: true, status: 200, body: "sent" });
    expect(mocks.sendWhatsApp).toHaveBeenCalledWith(expect.objectContaining({
      to: "+5491100000000",
      type: "image",
      mimeType: "image/png",
      filename: "generated.png",
    }));
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({
      usageType: "image",
      provider: "openai",
      model: "gpt-image-1",
      idempotencyKey: "call-1",
    }));
  });
});
