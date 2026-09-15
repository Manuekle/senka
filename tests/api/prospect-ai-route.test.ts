import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  conversation: vi.fn(),
  setConversation: vi.fn(),
  calls: vi.fn(),
  setCall: vi.fn(),
  assess: vi.fn(),
}));

vi.mock("@/lib/ai-route-guard", () => ({ guardAiRoute: mocks.guard }));
vi.mock("@/lib/business-store", () => ({
  getChannelConversation: mocks.conversation,
  listAllVoiceCalls: mocks.calls,
  setConversationProspect: mocks.setConversation,
  setVoiceCallProspect: mocks.setCall,
}));
vi.mock("@/lib/prospect", () => ({ assessProspect: mocks.assess }));

const route = await import("@/app/api/prospect/assess/route");

function request(body: unknown) {
  return new NextRequest("http://localhost/api/prospect/assess", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue(null);
});

describe("POST /api/prospect/assess", () => {
  it("does not classify when the shared AI guard refuses the request", async () => {
    mocks.guard.mockResolvedValue(new Response("out of credits", { status: 402 }));

    const response = await route.POST(request({ kind: "conversation", id: "chat-1" }));

    expect(response.status).toBe(402);
    expect(mocks.conversation).not.toHaveBeenCalled();
  });

  it("classifies and persists a conversation after the guard passes", async () => {
    const prospect = { stage: "interested", reason: "Pidió presupuesto", turnCount: 2, assessedAt: "2026-09-14T00:00:00.000Z", source: "ai" };
    mocks.conversation.mockResolvedValue({ id: "chat-1", turns: [{ role: "user", content: "Quiero presupuesto" }] });
    mocks.assess.mockResolvedValue(prospect);

    const response = await route.POST(request({ kind: "conversation", id: "chat-1" }));

    expect(response.status).toBe(200);
    expect(mocks.guard).toHaveBeenCalledWith(expect.any(NextRequest), "prospect-assess", expect.objectContaining({ max: 12 }));
    expect(mocks.setConversation).toHaveBeenCalledWith("chat-1", prospect);
  });
});
