// Help & Community: the rules, with no storage attached.
//
// Three things a customer can hand the team from inside the app — an idea for
// something to build, a question they could not answer from the FAQ, and a
// review of the app — plus the one decision the app makes on its own: when to
// ask for that review.
//
// Kept apart from the store so the cadence and the limits can be tested with
// a fixed clock and plain objects, and so the page and the route share one
// definition of what a valid submission is.

export const IDEA_CATEGORIES = [
  "agents",
  "channels",
  "crm",
  "automations",
  "integrations",
  "reports",
  "other",
] as const;

export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];

export const LIMITS = {
  ideaTitle: { min: 4, max: 120 },
  ideaBody: { max: 2000 },
  questionSubject: { min: 4, max: 140 },
  questionBody: { min: 10, max: 4000 },
  reviewText: { min: 4, max: 2000 },
} as const;

/** Oldest entries go first once a list reaches its cap. The document is read
 *  and written whole, so it cannot grow without bound. */
export const CAPS = { ideas: 500, questions: 500, reviews: 1000 } as const;

// ── Review cadence ───────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When the app asks for a review.
 *
 * Not on the first visit: someone who has not used the product yet has nothing
 * to say about it, and a star rating from them is noise. A week in, they do.
 * After a review, a quarter passes before the next one — often enough to see
 * whether things got better, rare enough not to nag. "Later" holds for two
 * weeks, so a dismissal is respected without the question disappearing.
 */
export const REVIEW_CADENCE = {
  firstPromptAfterDays: 7,
  intervalDays: 90,
  snoozeDays: 14,
} as const;

export type ReviewCadence = {
  /** The first time this account asked whether a review was due. */
  readonly firstSeenAt: string;
  readonly lastReviewedAt?: string;
  readonly snoozedAt?: string;
};

function addDays(iso: string, days: number): number {
  return new Date(iso).getTime() + days * DAY_MS;
}

/** What the shell and the page are told about one account's cadence. */
export type ReviewStatus = {
  readonly due: boolean;
  readonly nextAt: string;
  readonly lastReviewedAt: string | null;
};

/** The instant the next review becomes due, ignoring any snooze. */
export function nextReviewAt(cadence: ReviewCadence): string {
  const at = cadence.lastReviewedAt
    ? addDays(cadence.lastReviewedAt, REVIEW_CADENCE.intervalDays)
    : addDays(cadence.firstSeenAt, REVIEW_CADENCE.firstPromptAfterDays);
  return new Date(at).toISOString();
}

/** Whether the prompt should open now. */
export function reviewPromptDue(cadence: ReviewCadence, now: Date): boolean {
  const time = now.getTime();
  if (time < new Date(nextReviewAt(cadence)).getTime()) return false;
  return !cadence.snoozedAt || time >= addDays(cadence.snoozedAt, REVIEW_CADENCE.snoozeDays);
}

// ── Stored shapes and what the browser sees ──────────────────────

export type StoredIdea = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly category: IdeaCategory;
  readonly authorEmail: string;
  /** Account emails, lowercased. A vote is a like: one per account. */
  voters: string[];
  readonly createdAt: string;
};

export type StoredQuestion = {
  readonly id: string;
  readonly subject: string;
  readonly body: string;
  readonly authorEmail: string;
  readonly createdAt: string;
};

export type StoredReview = {
  readonly id: string;
  readonly rating: number;
  readonly text: string;
  readonly authorEmail: string;
  readonly createdAt: string;
};

/**
 * Nothing sent to the browser carries an email. Whoever reads the board needs
 * to know how many people want a thing and whether they are one of them, not
 * who the others are.
 */
export type IdeaView = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly category: IdeaCategory;
  readonly votes: number;
  readonly voted: boolean;
  readonly mine: boolean;
  readonly createdAt: string;
};

export type QuestionView = Omit<StoredQuestion, "authorEmail">;

export type ReviewView = {
  readonly id: string;
  readonly rating: number;
  readonly text: string;
  readonly mine: boolean;
  readonly createdAt: string;
};

export function accountKey(email: string): string {
  return email.trim().toLowerCase();
}

export function ideaView(idea: StoredIdea, viewer: string): IdeaView {
  const key = accountKey(viewer);
  return {
    id: idea.id,
    title: idea.title,
    body: idea.body,
    category: idea.category,
    votes: idea.voters.length,
    voted: idea.voters.includes(key),
    mine: accountKey(idea.authorEmail) === key,
    createdAt: idea.createdAt,
  };
}

export function reviewView(review: StoredReview, viewer: string): ReviewView {
  return {
    id: review.id,
    rating: review.rating,
    text: review.text,
    mine: accountKey(review.authorEmail) === accountKey(viewer),
    createdAt: review.createdAt,
  };
}

export type IdeaSort = "top" | "new";

/** Most wanted first; among equals, the newer one, so a fresh idea is not
 *  buried under an old one nobody has touched either. */
export function sortIdeas(ideas: readonly IdeaView[], sort: IdeaSort): IdeaView[] {
  return [...ideas].sort((a, b) => {
    if (sort === "top" && a.votes !== b.votes) return b.votes - a.votes;
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  });
}

export type ReviewSummary = {
  readonly count: number;
  /** One decimal. `null` with no reviews rather than a misleading 0. */
  readonly average: number | null;
  /** Count per star, index 0 is one star. */
  readonly distribution: readonly [number, number, number, number, number];
};

export function summarizeReviews(reviews: readonly { rating: number }[]): ReviewSummary {
  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let total = 0;
  for (const review of reviews) {
    distribution[review.rating - 1] += 1;
    total += review.rating;
  }
  return {
    count: reviews.length,
    average: reviews.length ? Math.round((total / reviews.length) * 10) / 10 : null,
    distribution,
  };
}

// ── Input validation ─────────────────────────────────────────────

export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly field: string; readonly reason: "missing" | "invalid" };

type Failure = Extract<Parsed<never>, { ok: false }>;

/** A trimmed string within bounds, or the failure naming `name`. Optional
 *  fields (no `min`) come back as `""` when absent. */
function text(
  name: string,
  value: unknown,
  bounds: { readonly min?: number; readonly max: number },
): { readonly value: string } | Failure {
  const fail = (reason: Failure["reason"]): Failure => ({ ok: false, field: name, reason });
  if (value === undefined || value === null) return bounds.min ? fail("missing") : { value: "" };
  if (typeof value !== "string") return fail("invalid");
  // Collapses runs of blank lines a paste tends to bring along, but keeps the
  // paragraphs: a question is often a numbered list of steps.
  const trimmed = value.trim().replace(/\n{3,}/g, "\n\n");
  if (!trimmed) return bounds.min ? fail("missing") : { value: "" };
  if (bounds.min && trimmed.length < bounds.min) return fail("invalid");
  if (trimmed.length > bounds.max) return fail("invalid");
  return { value: trimmed };
}

export type IdeaInput = {
  readonly title: string;
  readonly body: string;
  readonly category: IdeaCategory;
};

export function parseIdeaInput(input: Record<string, unknown>): Parsed<IdeaInput> {
  const title = text("title", input.title, LIMITS.ideaTitle);
  if ("ok" in title) return title;
  const body = text("body", input.body, LIMITS.ideaBody);
  if ("ok" in body) return body;
  const category = input.category ?? "other";
  if (typeof category !== "string" || !(IDEA_CATEGORIES as readonly string[]).includes(category)) {
    return { ok: false, field: "category", reason: "invalid" };
  }
  return { ok: true, value: { title: title.value, body: body.value, category: category as IdeaCategory } };
}

export type QuestionInput = { readonly subject: string; readonly body: string };

export function parseQuestionInput(input: Record<string, unknown>): Parsed<QuestionInput> {
  const subject = text("subject", input.subject, LIMITS.questionSubject);
  if ("ok" in subject) return subject;
  const body = text("body", input.body, LIMITS.questionBody);
  if ("ok" in body) return body;
  return { ok: true, value: { subject: subject.value, body: body.value } };
}

export type ReviewInput = { readonly rating: number; readonly text: string };

/** Both parts are required: the stars say how it is going, the text says why,
 *  and a rating nobody can act on is the half the team needs least. */
export function parseReviewInput(input: Record<string, unknown>): Parsed<ReviewInput> {
  const rating = input.rating;
  if (rating === undefined || rating === null) return { ok: false, field: "rating", reason: "missing" };
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, field: "rating", reason: "invalid" };
  }
  const body = text("text", input.text, LIMITS.reviewText);
  if ("ok" in body) return body;
  return { ok: true, value: { rating, text: body.value } };
}
