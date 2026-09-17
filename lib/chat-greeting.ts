/**
 * Rotating daily greeting for the empty chat state, Claude-style: a short
 * question that changes every day. Rules it must keep:
 * - Exactly 7 titles, and every one has the same character count.
 * - One per calendar day. Each 7-day cycle shuffles the deck with a
 *   Fisher–Yates pass seeded by the cycle index, so within any cycle a
 *   title never repeats, the order feels random, and the result stays
 *   deterministic (server render and client hydration agree — day
 *   boundaries are computed in UTC).
 */

export const DAILY_GREETINGS = [
  "¿Qué vamos a lograr hoy?",
  "¿Qué queremos construir?",
  "¿En qué te puedo ayudar?",
  "¿Qué deseas automatizar?",
  "¿Qué resolvemos por hoy?",
  "¿Qué mejoraremos juntos?",
  "¿Qué ideas probamos hoy?",
] as const;

const DAY_MS = 86_400_000;

/** Tiny deterministic PRNG so each 7-day cycle shuffles in a fresh order. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function dailyGreeting(now: Date = new Date()): string {
  const count = DAILY_GREETINGS.length;
  const day = Math.floor(now.getTime() / DAY_MS);
  const slot = ((day % count) + count) % count;
  const cycle = Math.floor(day / count);
  const order = DAILY_GREETINGS.map((_, index) => index);
  const random = mulberry32(cycle);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return DAILY_GREETINGS[order[slot]!]!;
}