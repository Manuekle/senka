import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  analyze: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@/lib/ai-route-guard", () => ({ guardAiRoute: mocks.guard }));
vi.mock("@/lib/business-analysis", () => ({ analyzeBusiness: mocks.analyze }));
vi.mock("@/lib/business-profile-store", () => ({
  clearBusinessProfile: vi.fn(),
  getBusinessIdentity: vi.fn(),
  getBusinessProfile: vi.fn(),
  saveBusinessProfile: mocks.save,
  updateBusinessProfile: vi.fn(),
}));
vi.mock("@/lib/provider-catalog", () => ({ getProviderReport: async () => ({ status: "ok" }) }));

const route = await import("@/app/api/business-profile/route");

function request(body: unknown) {
  return new NextRequest("http://localhost/api/business-profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue(null);
});

describe("POST /api/business-profile", () => {
  it("stops before analysis when the AI credit gate refuses the request", async () => {
    mocks.guard.mockResolvedValue(new Response("out of credits", { status: 402 }));

    const response = await route.POST(request({ notes: "Una panadería" }));

    expect(response.status).toBe(402);
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("saves only a generated profile after the shared AI guard passes", async () => {
    const record = { profile: { name: "Panadería Norte" }, sources: {}, generatedAt: "2026-09-14T00:00:00.000Z" };
    mocks.analyze.mockResolvedValue({ ok: true, record });

    const response = await route.POST(request({ notes: "Una panadería" }));

    expect(response.status).toBe(200);
    expect(mocks.guard).toHaveBeenCalledWith(expect.any(NextRequest), "business-profile");
    expect(mocks.save).toHaveBeenCalledWith(record);
  });
});
