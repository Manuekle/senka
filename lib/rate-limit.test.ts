import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { clientIp, rateLimit, resetRateLimits } from "./rate-limit";

/** Only the one method the module touches. */
function request(headers: Record<string, string>): NextRequest {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  } as unknown as NextRequest;
}

const hops = process.env.TRUSTED_PROXY_HOPS;

beforeEach(() => {
  resetRateLimits();
  delete process.env.TRUSTED_PROXY_HOPS;
});

afterEach(() => {
  if (hops === undefined) delete process.env.TRUSTED_PROXY_HOPS;
  else process.env.TRUSTED_PROXY_HOPS = hops;
});

describe("clientIp", () => {
  // The default changed with the fix for the forgeable-key finding: nothing
  // proxies this process unless the deploy says so, so X-Forwarded-For is
  // ignored and a client-seeded entry can no longer choose the key an
  // account's limits hang from.
  it("ignores a caller-seeded X-Forwarded-For unless a proxy is declared", () => {
    const forwarded = request({ "x-forwarded-for": "1.1.1.1, 203.0.113.7", "x-real-ip": "198.51.100.1" });
    expect(clientIp(forwarded)).toBe("198.51.100.1");
  });

  // With exactly one trusted hop the truthful entry is the last one.
  it("reads the entry the nearest proxy appended, not the one the caller claimed", () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    const forwarded = request({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" });
    expect(clientIp(forwarded)).toBe("203.0.113.7");
  });

  it("counts back by the number of proxies in front of the app", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    const forwarded = request({ "x-forwarded-for": "1.1.1.1, 198.51.100.9, 203.0.113.7" });
    expect(clientIp(forwarded)).toBe("198.51.100.9");
  });

  it("ignores the header entirely when nothing proxies this process", () => {
    process.env.TRUSTED_PROXY_HOPS = "0";
    const forwarded = request({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "203.0.113.7" });
    expect(clientIp(forwarded)).toBe("203.0.113.7");
  });

  it("falls back rather than throwing when there is no address to be had", () => {
    expect(clientIp(request({}))).toBe("unknown");
  });
});

describe("rateLimit", () => {
  it("allows exactly `max` hits, then refuses", () => {
    const key = "203.0.113.7";
    for (let i = 0; i < 3; i++) {
      expect(rateLimit("bucket", key, { max: 3, windowMs: 60_000 }).allowed).toBe(true);
    }
    expect(rateLimit("bucket", key, { max: 3, windowMs: 60_000 }).allowed).toBe(false);
  });

  it("counts each caller separately", () => {
    rateLimit("bucket", "a", { max: 1, windowMs: 60_000 });
    expect(rateLimit("bucket", "a", { max: 1, windowMs: 60_000 }).allowed).toBe(false);
    expect(rateLimit("bucket", "b", { max: 1, windowMs: 60_000 }).allowed).toBe(true);
  });

  it("keeps buckets independent, so login and register do not share a budget", () => {
    rateLimit("login", "a", { max: 1, windowMs: 60_000 });
    expect(rateLimit("login", "a", { max: 1, windowMs: 60_000 }).allowed).toBe(false);
    expect(rateLimit("register", "a", { max: 1, windowMs: 60_000 }).allowed).toBe(true);
  });

  it("reopens once the window has passed", async () => {
    expect(rateLimit("short", "a", { max: 1, windowMs: 5 }).allowed).toBe(true);
    expect(rateLimit("short", "a", { max: 1, windowMs: 5 }).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(rateLimit("short", "a", { max: 1, windowMs: 5 }).allowed).toBe(true);
  });

  it("carries Retry-After only on the refusal", () => {
    const ok = rateLimit("h", "a", { max: 1, windowMs: 60_000 });
    expect(ok.headers["Retry-After"]).toBeUndefined();
    expect(ok.headers["RateLimit-Remaining"]).toBe("0");

    const refused = rateLimit("h", "a", { max: 1, windowMs: 60_000 });
    expect(refused.headers["Retry-After"]).toBeDefined();
  });
});
