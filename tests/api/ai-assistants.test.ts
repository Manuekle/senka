import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), usage: vi.fn(), createSkill: vi.fn() }));
vi.mock("ai", () => ({ generateObject: mocks.generate }));
vi.mock("@/lib/ai-route-guard", () => ({
  guardAiRoute: async () => null,
  recordRouteUsage: mocks.usage,
}));
vi.mock("@/lib/ai-meter", () => ({
  checkAiCredits: async () => ({ allowed: true }),
  recordAiUsage: mocks.usage,
}));
vi.mock("@/lib/task-model", () => ({ modelIdForTask: async () => "gpt-5-mini", languageModelForTask: async () => "test-model" }));
vi.mock("@/lib/ai-provider", () => ({ resolveLanguageModel: () => "test-model" }));
vi.mock("@/lib/provider-catalog", () => ({ getProviderReport: async () => ({ status: "ok" }) }));
vi.mock("@/lib/business-profile-store", () => ({ getBusinessIdentity: async () => ({}), getBusinessProfile: async () => null }));
vi.mock("@/lib/knowledge-store", () => ({ listDocuments: async () => [], documentText: async () => ({ document: { name: "Procedure" }, text: "When a customer asks for a refund, verify their order and send the request to a human. Never promise a refund without the team's approval." }) }));
vi.mock("@/lib/skill-store", () => ({ skillForDocument: async () => null, createSkill: mocks.createSkill }));

const flows = await import("@/app/api/automations/assistant/route");
const agents = await import("@/app/api/agents/assistant/route");
const skills = await import("@/app/api/skills/from-document/route");
const { assessProspect } = await import("@/lib/prospect");
const { analyzeBusiness } = await import("@/lib/business-analysis");

function request(body: unknown) {
  return new NextRequest("http://localhost/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

function assertStrictSchema(schema: unknown): void {
  if (!schema || typeof schema !== "object") return;
  const node = schema as Record<string, unknown>;
  if (node.type === "object") {
    expect(node.additionalProperties).toBe(false);
    expect([...(node.required as string[] ?? [])].sort()).toEqual(Object.keys(node.properties as object).sort());
  }
  Object.values(node).forEach(value => Array.isArray(value) ? value.forEach(assertStrictSchema) : assertStrictSchema(value));
}

beforeEach(() => vi.clearAllMocks());

describe("AI assistant output contracts", () => {
  it("accepts a conversational greeting without a replacement flow", async () => {
    mocks.generate.mockImplementation(async ({ schema }) => {
      assertStrictSchema(z.toJSONSchema(schema));
      return { object: schema.parse({ reply: "¡Hola! ¿Qué quieres automatizar?", plan: null }), usage: { inputTokens: 10, outputTokens: 5 } };
    });
    const response = await flows.POST(request({ prompt: "hola", steps: [] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reply: "¡Hola! ¿Qué quieres automatizar?", plan: null });
    expect(mocks.usage).toHaveBeenCalledOnce();
  });

  it("passes prior conversational turns along with the current flow", async () => {
    mocks.generate.mockResolvedValue({ object: { reply: "Listo", plan: { summary: "Vaciar el flujo", steps: [] } } });
    const response = await flows.POST(request({ prompt: "sí", steps: [], turns: [{ role: "assistant", text: "¿Quieres vaciar el flujo?" }] }));
    expect(response.status).toBe(200);
    expect(mocks.generate.mock.calls[0][0].prompt).toContain("¿Quieres vaciar el flujo?");
    expect((await response.json()).plan).toEqual({ summary: "Vaciar el flujo", steps: [] });
  });

  it("uses an OpenAI-compatible agent schema and omits null patch fields", async () => {
    mocks.generate.mockImplementation(async ({ schema }) => {
      assertStrictSchema(z.toJSONSchema(schema));
      return { object: schema.parse({ reply: "Hola", patch: { name: null, description: null, capabilities: [], brief: { role: "Soporte", goal: null, audience: null, tone: null, language: null, greeting: "", rules: [], avoid: null, handoff: null } }, questions: [], done: false }) };
    });
    const response = await agents.POST(request({ prompt: "hola", draft: {} }));
    expect(response.status).toBe(200);
    expect((await response.json()).answer.patch).toEqual({ capabilities: [], brief: { role: "Soporte", greeting: "", rules: [] } });
  });

  it("reports timeouts separately from invalid model output", async () => {
    mocks.generate.mockRejectedValue(new DOMException("The operation timed out", "TimeoutError"));
    const response = await flows.POST(request({ prompt: "hola" }));
    expect(response.status).toBe(504);
    expect((await response.json()).code).toBe("timeout");
  });

  it("accepts a prospect assessment with no next action under OpenAI strict output", async () => {
    mocks.generate.mockImplementation(async ({ schema }) => {
      assertStrictSchema(z.toJSONSchema(schema));
      return { object: schema.parse({ stage: "won", reason: "Payment confirmed", nextStep: null }) };
    });
    expect(await assessProspect({ turns: [{ role: "user", content: "Ya pagué" }], medium: "chat" })).toMatchObject({ stage: "won", nextStep: undefined });
  });

  it("validates the business profile output contract without writing the profile", async () => {
    mocks.generate.mockImplementation(async ({ schema }) => {
      assertStrictSchema(z.toJSONSchema(schema));
      return { object: schema.parse({ name: "Bakery", industry: "Food", description: "A bakery", services: ["Bread"], location: null, hours: null, tone: "Friendly", highlights: [], faqs: [] }) };
    });
    expect(await analyzeBusiness({ notes: "Our bakery sells bread." })).toMatchObject({ ok: true, record: { profile: { name: "Bakery" } } });
  });

  it("keeps generated document skills disabled until review", async () => {
    mocks.generate.mockImplementation(async ({ schema, abortSignal }) => {
      assertStrictSchema(z.toJSONSchema(schema));
      expect(abortSignal).toBeInstanceOf(AbortSignal);
      return { object: schema.parse({ name: "Refunds", description: "Handling refunds", markdown: "# Refunds\nContact a human." }) };
    });
    mocks.createSkill.mockImplementation(async input => ({ ...input, id: "review" }));
    const response = await skills.POST(request({ documentId: "procedure" }));
    expect(response.status).toBe(200);
    expect(mocks.createSkill).toHaveBeenCalledWith(expect.objectContaining({ enabled: false, source: "knowledge", documentId: "procedure" }));
  });
});
