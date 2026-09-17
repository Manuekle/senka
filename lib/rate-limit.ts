import type { NextRequest } from "next/server";

/**
 * One fixed-window limiter, shared by every route that needs one.
 *
 * Scope, stated plainly: the counters live in this process's memory. On the
 * single-host deployment this repo ships — one Next.js service behind Caddy —
 * that is the whole story and the limit is real. Run two instances and each
 * gets its own budget, so the effective limit is `max * instances`; a deploy
 * resets every window. That is a weaker guarantee than a Redis or Postgres
 * counter, and it is written down here rather than implied.
 *
 * It is still worth having. The routes below are the ones where "unbounded"
 * costs money or hands out something: a password guess, an account, a reset
 * email, an LLM call. A limiter that a distributed attacker can multiply by
 * the instance count is a different thing from no limiter at all.
 *
 * If this app ever runs more than one instance, replace the map with a
 * `senka.rate_limits` table keyed the same way — the call sites do not change.
 */

type Window = { count: number; resetAt: number };

const buckets = new Map<string, Map<string, Window>>();

/**
 * The address the limit is keyed on.
 *
 * `X-Forwarded-For` is a list the client can seed: a request can arrive with
 * one already set, and Caddy *appends* the real peer rather than replacing the
 * header. So the first entry is whatever the caller claimed and the last is
 * the only one a proxy we operate wrote. Counting from the right by the number
 * of proxies in front of this process is what makes the key unforgeable.
 *
 * `TRUSTED_PROXY_HOPS` is that number — 1 for the Caddy in deploy/ (the
 * systemd unit sets it) and 1 on Vercel. The default here is 0: nothing
 * proxies this process, the header is ignored entirely, and a caller seeding
 * the header cannot choose the key an account's limits hang from. A deploy
 * that adds a proxy without raising the value keeps the safe (if coarser)
 * behaviour of limiting on the direct peer instead.
 */
export function clientIp(request: NextRequest): string {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? "0");
  if (Number.isFinite(hops) && hops > 0) {
    const forwarded = (request.headers.get("x-forwarded-for") ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (forwarded.length > 0) {
      // hops=1 -> the last entry, which the nearest proxy appended.
      return forwarded[Math.max(0, forwarded.length - hops)] ?? forwarded[0];
    }
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export type RateLimitResult = {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: number;
  /** `Retry-After` and the `RateLimit-*` trio, ready to spread onto a response. */
  readonly headers: Record<string, string>;
};

/**
 * Counts one hit against `bucket` for this caller and says whether it fits.
 *
 * @param bucket  Names the budget. Two routes sharing a name share a counter.
 * @param key     Who is being limited — a request (keyed by address) or an
 *                explicit string when the identity is something else.
 */
export function rateLimit(
  bucket: string,
  key: NextRequest | string,
  options: { readonly max: number; readonly windowMs: number },
): RateLimitResult {
  const identity = typeof key === "string" ? key : clientIp(key);
  const now = Date.now();

  let windows = buckets.get(bucket);
  if (!windows) {
    windows = new Map();
    buckets.set(bucket, windows);
  }

  // Bounded cleanup, so a stream of one-shot addresses cannot grow the map
  // without limit. Same guard the two public form routes carried inline.
  if (windows.size > 5000) {
    for (const [entry, window] of windows) {
      if (window.resetAt <= now) windows.delete(entry);
    }
  }

  const current = windows.get(identity);
  const window =
    current && current.resetAt > now ? current : { count: 0, resetAt: now + options.windowMs };
  window.count += 1;
  windows.set(identity, window);

  const allowed = window.count <= options.max;
  const remaining = Math.max(0, options.max - window.count);
  const retryAfter = Math.max(1, Math.ceil((window.resetAt - now) / 1000));

  return {
    allowed,
    remaining,
    resetAt: window.resetAt,
    headers: {
      "RateLimit-Limit": String(options.max),
      "RateLimit-Remaining": String(remaining),
      "RateLimit-Reset": String(retryAfter),
      ...(allowed ? {} : { "Retry-After": String(retryAfter) }),
    },
  };
}

/** Drops every counter. Tests only. */
export function resetRateLimits(): void {
  buckets.clear();
}
