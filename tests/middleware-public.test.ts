import { describe, expect, it } from "vitest";
import { isPublic } from "../middleware";

/**
 * The middleware's public list decides which paths skip the session gate, so
 * the shape of the matching is itself a security property: a prefix match
 * (`pathname.startsWith(path)`) would make `/api/authorize` public because
 * `/api/auth` is. These tests pin the segment-anchored behaviour — the same
 * `/auth`-prefix bug the audit found in the first draft of this list.
 */
describe("isPublic — segment anchoring", () => {
  it("keeps an entry and its own subtree public", () => {
    expect(isPublic("/api/auth")).toBe(true);
    expect(isPublic("/api/auth/login")).toBe(true);
    expect(isPublic("/api/health")).toBe(true);
    expect(isPublic("/api/leads")).toBe(true);
    expect(isPublic("/api/f")).toBe(true);
    expect(isPublic("/api/f/form-123")).toBe(true);
    expect(isPublic("/f")).toBe(true);
    expect(isPublic("/f/form-123")).toBe(true);
    expect(isPublic("/terms")).toBe(true);
    expect(isPublic("/pricing")).toBe(true);
    expect(isPublic("/")).toBe(true);
    expect(isPublic("/api/billing/webhook")).toBe(true);
    expect(isPublic("/api/webhooks/elevenlabs")).toBe(true);
    expect(isPublic("/api/webhooks/elevenlabs/tools/agent-1/save_contact")).toBe(true);
  });

  it("never lets a prefix leak into a sibling path", () => {
    expect(isPublic("/api/authorize")).toBe(false);
    expect(isPublic("/api/authlogin")).toBe(false);
    expect(isPublic("/api/healthcheck")).toBe(false);
    expect(isPublic("/api/leaderboard")).toBe(false);
    expect(isPublic("/api/forms")).toBe(false);
    expect(isPublic("/forms")).toBe(false);
    expect(isPublic("/terms-of-service")).toBe(false);
    expect(isPublic("/api/demo-requestx")).toBe(false);
    expect(isPublic("/api/billing/webhook-replay")).toBe(false);
    expect(isPublic("/api/billing")).toBe(false);
    expect(isPublic("/api/webhooks/elevenlabs-tools")).toBe(false);
  });
});