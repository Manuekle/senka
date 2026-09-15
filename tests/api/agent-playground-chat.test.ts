import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  getAgent: vi.fn(),
  meter: vi.fn(),
}));

vi.mock("ai", () => ({
  stepCountIs: (count: number) => ({ count }),
  streamText: mocks.streamText,
  tool: <T>(definition: T) => definition,
}));
vi.mock("@/lib/business-store", () => ({ getAgent: mocks.getAgent }));
vi.mock("@/lib/ai-provider", () => ({ resolveLanguageModel: (id: string) => `model:${id}` }));
vi.mock("@/lib/task-model", () => ({ modelIdForTask: async () => "gpt-5-mini" }));
vi.mock("@/lib/provider-catalog", () => ({ getProviderReport: async () => ({ status: "ok" }) }));
vi.mock("@/lib/knowledge-store", () => ({ listDocuments: async () => [] }));
vi.mock("@/lib/media-library", () => ({ findMedia: async () => [] }));
vi.mock("@/lib/media-store", () => ({ countAssets: async () => 0 }));
vi.mock("@/lib/rag", () => ({
  RagError: class RagError extends Error {},
  searchKnowledge: async () => [],
}));
vi.mock("@/lib/ai-route-guard", () => ({
  guardAiRoute: async () => null,
  recordRouteUsage: mocks.meter,
}));

const route = await import("@/app/api/agents/[id]/chat/route");

function request(messages: unknown) {
  return new NextRequest("http://localhost/api/agents/agent-1/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAgent.mockResolvedValue({
    id: "agent-1",
    name: "Ventas",
    description: "Asesora sobre productos",
    systemPrompt: "Respondé solo con información confirmada.",
    tools: ["knowledge"],
  });
  mocks.streamText.mockImplementation(() => ({
    toTextStreamResponse: () => new Response("respuesta", { status: 200 }),
  }));
});

describe("POST /api/agents/[id]/chat", () => {
  it("streams with the agent prompt and only its enabled read tools", async () => {
    const response = await route.POST(
      request([{ role: "user", content: "¿Cuánto cuesta?" }]),
      { params: Promise.resolve({ id: "agent-1" }) },
    );

    expect(response.status).toBe(200);
    const input = mocks.streamText.mock.calls[0]?.[0] as {
      model: string;
      system: string;
      tools: Record<string, unknown>;
      messages: unknown[];
    };
    expect(input.model).toBe("model:gpt-5-mini");
    expect(input.system).toContain("Respondé solo con información confirmada.");
    expect(input.tools).toHaveProperty("search_knowledge");
    expect(input.tools).not.toHaveProperty("find_media");
    expect(input.messages).toEqual([{ role: "user", content: "¿Cuánto cuesta?" }]);
  });

  it("records final streamed usage for the agent playground", async () => {
    await route.POST(
      request([{ role: "user", content: "Hola" }]),
      { params: Promise.resolve({ id: "agent-1" }) },
    );
    const input = mocks.streamText.mock.calls[0]?.[0] as {
      onFinish: (value: { totalUsage: unknown }) => Promise<void>;
    };
    const usage = { inputTokens: 12, outputTokens: 4 };
    await input.onFinish({ totalUsage: usage });

    expect(mocks.meter).toHaveBeenCalledWith({
      model: "gpt-5-mini",
      usage,
      conversationId: "agents-chat:agent-1",
    });
  });
});
