import { describe, expect, it } from "vitest";
import { DAILY_GREETINGS, dailyGreeting } from "./chat-greeting";

const DAY_MS = 86_400_000;

describe("DAILY_GREETINGS", () => {
  it("has exactly 7 unique titles", () => {
    expect(DAILY_GREETINGS).toHaveLength(7);
    expect(new Set(DAILY_GREETINGS).size).toBe(7);
  });

  it("renders every title with the same character count", () => {
    const lengths = new Set(DAILY_GREETINGS.map((title) => [...title].length));
    expect(lengths.size).toBe(1);
  });
});

describe("dailyGreeting", () => {
  it("changes from one day to the next", () => {
    const start = Date.UTC(2026, 0, 1, 12);
    expect(dailyGreeting(new Date(start))).not.toBe(
      dailyGreeting(new Date(start + DAY_MS)),
    );
  });

  it("never repeats a title within a 7-day cycle (a full permutation)", () => {
    // Noon UTC keeps every sample inside a single calendar day.
    const start = Date.UTC(2026, 0, 1, 12);
    const week = Array.from({ length: 7 }, (_, day) =>
      dailyGreeting(new Date(start + day * DAY_MS)),
    );
    expect(new Set(week).size).toBe(7);
  });

  it("returns the same title all day long", () => {
    const morning = Date.UTC(2026, 5, 15, 1);
    const night = Date.UTC(2026, 5, 15, 23);
    expect(dailyGreeting(new Date(morning))).toBe(
      dailyGreeting(new Date(night)),
    );
  });
});