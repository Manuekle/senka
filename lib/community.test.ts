import { describe, expect, it } from "vitest";
import {
  REVIEW_CADENCE,
  ideaView,
  nextReviewAt,
  parseIdeaInput,
  parseQuestionInput,
  parseReviewInput,
  reviewPromptDue,
  sortIdeas,
  summarizeReviews,
  type IdeaView,
  type StoredIdea,
} from "./community";
import { faqMatches } from "./help-faq";

const DAY = 24 * 60 * 60 * 1000;
const start = "2026-01-01T12:00:00.000Z";
const at = (days: number) => new Date(new Date(start).getTime() + days * DAY);

describe("review cadence", () => {
  it("waits a week after the account is first seen", () => {
    const cadence = { firstSeenAt: start };
    expect(reviewPromptDue(cadence, at(0))).toBe(false);
    expect(reviewPromptDue(cadence, at(REVIEW_CADENCE.firstPromptAfterDays - 0.01))).toBe(false);
    expect(reviewPromptDue(cadence, at(REVIEW_CADENCE.firstPromptAfterDays))).toBe(true);
  });

  it("asks again a quarter after the last review, not a week", () => {
    const cadence = { firstSeenAt: start, lastReviewedAt: at(10).toISOString() };
    expect(reviewPromptDue(cadence, at(30))).toBe(false);
    expect(reviewPromptDue(cadence, at(10 + REVIEW_CADENCE.intervalDays))).toBe(true);
    expect(nextReviewAt(cadence)).toBe(at(10 + REVIEW_CADENCE.intervalDays).toISOString());
  });

  it("holds a snooze for two weeks, then asks again", () => {
    const cadence = { firstSeenAt: start, snoozedAt: at(8).toISOString() };
    expect(reviewPromptDue(cadence, at(9))).toBe(false);
    expect(reviewPromptDue(cadence, at(8 + REVIEW_CADENCE.snoozeDays))).toBe(true);
  });
});

describe("submission parsing", () => {
  it("accepts an idea with only a title, defaulting the area", () => {
    expect(parseIdeaInput({ title: "  SMS reminders  " })).toEqual({
      ok: true,
      value: { title: "SMS reminders", body: "", category: "other" },
    });
  });

  it("names the field that failed and why", () => {
    expect(parseIdeaInput({})).toMatchObject({ ok: false, field: "title", reason: "missing" });
    expect(parseIdeaInput({ title: "ab" })).toMatchObject({ ok: false, field: "title", reason: "invalid" });
    expect(parseIdeaInput({ title: "A real idea", category: "space" })).toMatchObject({
      ok: false,
      field: "category",
    });
    expect(parseQuestionInput({ subject: "WhatsApp", body: "   " })).toMatchObject({
      ok: false,
      field: "body",
      reason: "missing",
    });
  });

  it("takes text that happens to spell a failure reason at face value", () => {
    expect(parseReviewInput({ rating: 4, text: "missing" })).toEqual({
      ok: true,
      value: { rating: 4, text: "missing" },
    });
  });

  it("requires both stars and words on a review", () => {
    expect(parseReviewInput({ text: "Works well" })).toMatchObject({ field: "rating", reason: "missing" });
    expect(parseReviewInput({ rating: 6, text: "Works well" })).toMatchObject({ field: "rating", reason: "invalid" });
    expect(parseReviewInput({ rating: 4.5, text: "Works well" })).toMatchObject({ field: "rating" });
    expect(parseReviewInput({ rating: 5 })).toMatchObject({ field: "text", reason: "missing" });
  });

  it("keeps paragraphs but collapses a pasted run of blank lines", () => {
    const parsed = parseQuestionInput({ subject: "Steps", body: "One\n\n\n\n\nTwo\n\nThree" });
    expect(parsed).toEqual({ ok: true, value: { subject: "Steps", body: "One\n\nTwo\n\nThree" } });
  });
});

describe("what the board shows", () => {
  const stored: StoredIdea = {
    id: "i1",
    title: "SMS",
    body: "",
    category: "channels",
    authorEmail: "Owner@Shop.com",
    voters: ["owner@shop.com", "clerk@shop.com"],
    createdAt: start,
  };

  it("counts likes and marks the viewer's own, without leaking who voted", () => {
    const view = ideaView(stored, "owner@shop.com");
    expect(view).toMatchObject({ votes: 2, voted: true, mine: true });
    expect(JSON.stringify(view)).not.toContain("@");
    expect(ideaView(stored, "someone@else.com")).toMatchObject({ voted: false, mine: false });
  });

  it("sorts by likes, breaking ties by the newest", () => {
    const idea = (id: string, votes: number, day: number): IdeaView => ({
      id,
      title: id,
      body: "",
      category: "other",
      votes,
      voted: false,
      mine: false,
      createdAt: at(day).toISOString(),
    });
    const ideas = [idea("old-popular", 5, 0), idea("new-quiet", 1, 5), idea("new-popular", 5, 3)];
    expect(sortIdeas(ideas, "top").map((entry) => entry.id)).toEqual(["new-popular", "old-popular", "new-quiet"]);
    expect(sortIdeas(ideas, "new").map((entry) => entry.id)).toEqual(["new-quiet", "new-popular", "old-popular"]);
  });

  it("summarizes reviews with no average until there is one", () => {
    expect(summarizeReviews([])).toEqual({ count: 0, average: null, distribution: [0, 0, 0, 0, 0] });
    expect(summarizeReviews([{ rating: 5 }, { rating: 4 }, { rating: 4 }])).toEqual({
      count: 3,
      average: 4.3,
      distribution: [0, 0, 0, 2, 1],
    });
  });
});

describe("FAQ search", () => {
  it("matches every word in any order, ignoring accents and case", () => {
    expect(faqMatches("contrasena CAMBIO", "¿Cómo cambio mi contraseña?", "Desde Cuenta.")).toBe(true);
    expect(faqMatches("contraseña whatsapp", "¿Cómo cambio mi contraseña?", "Desde Cuenta.")).toBe(false);
    expect(faqMatches("   ", "Anything", "")).toBe(true);
  });
});
