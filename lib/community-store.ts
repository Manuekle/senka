import { join } from "node:path";
import { homedir } from "node:os";
import { nanoid } from "nanoid";
import { createDocumentStore } from "./doc-store";
import {
  CAPS,
  accountKey,
  ideaView,
  nextReviewAt,
  reviewPromptDue,
  reviewView,
  summarizeReviews,
  type IdeaInput,
  type IdeaView,
  type QuestionInput,
  type QuestionView,
  type ReviewCadence,
  type ReviewInput,
  type ReviewStatus,
  type ReviewSummary,
  type ReviewView,
  type StoredIdea,
  type StoredQuestion,
  type StoredReview,
} from "./community";

// Ideas, questions and reviews sent from Help & Community.
//
// The installation's, not a business's: an idea for the product is about the
// product, and an owner running three shops has one opinion of the app, not
// three. Every entry keeps the account that wrote it, which is what makes a
// vote a like-per-person and lets someone delete their own idea — but see
// lib/community.ts for why none of that email reaches the browser.

const STORE_FILE = join(homedir(), ".senka", "community.json");

type CommunityStore = {
  ideas: StoredIdea[];
  questions: StoredQuestion[];
  reviews: StoredReview[];
  /** Keyed by lowercased account email. */
  cadence: Record<string, ReviewCadence>;
};

function empty(): CommunityStore {
  return { ideas: [], questions: [], reviews: [], cadence: {} };
}

function normalize(parsed: Partial<CommunityStore>): CommunityStore {
  return {
    ideas: Array.isArray(parsed.ideas)
      ? parsed.ideas.map((idea) => ({ ...idea, voters: Array.isArray(idea.voters) ? idea.voters : [] }))
      : [],
    questions: Array.isArray(parsed.questions) ? parsed.questions : [],
    reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
    cadence: parsed.cadence && typeof parsed.cadence === "object" ? parsed.cadence : {},
  };
}

const store = createDocumentStore<CommunityStore>({
  id: "community",
  file: STORE_FILE,
  empty,
  normalize,
});

/** Drops the oldest entries past `cap`. Lists are appended to, so the front
 *  is the oldest. */
function capped<T>(list: T[], cap: number): T[] {
  return list.length > cap ? list.slice(list.length - cap) : list;
}

// ── Ideas ────────────────────────────────────────────────────────

export async function listIdeas(viewer: string): Promise<IdeaView[]> {
  const { ideas } = await store.read();
  return ideas.map((idea) => ideaView(idea, viewer));
}

export async function createIdea(viewer: string, input: IdeaInput): Promise<IdeaView> {
  const idea: StoredIdea = {
    id: nanoid(10),
    title: input.title,
    body: input.body,
    category: input.category,
    authorEmail: viewer,
    // Whoever suggests a thing wants it: their idea starts with their vote.
    voters: [accountKey(viewer)],
    createdAt: new Date().toISOString(),
  };
  await store.update((doc) => {
    doc.ideas = capped([...doc.ideas, idea], CAPS.ideas);
  });
  return ideaView(idea, viewer);
}

/** Sets rather than toggles, so a double click or a retried request lands
 *  where the person meant it to instead of flipping back. */
export async function setIdeaVote(
  viewer: string,
  id: string,
  voted: boolean,
): Promise<IdeaView | null> {
  const key = accountKey(viewer);
  return store.update((doc) => {
    const idea = doc.ideas.find((entry) => entry.id === id);
    if (!idea) return null;
    const without = idea.voters.filter((voter) => voter !== key);
    idea.voters = voted ? [...without, key] : without;
    return ideaView(idea, viewer);
  });
}

export async function deleteIdea(
  viewer: string,
  id: string,
): Promise<"deleted" | "not_found" | "forbidden"> {
  return store.update((doc) => {
    const idea = doc.ideas.find((entry) => entry.id === id);
    if (!idea) return "not_found";
    // Other people's votes are on it. Only its author takes it down.
    if (accountKey(idea.authorEmail) !== accountKey(viewer)) return "forbidden";
    doc.ideas = doc.ideas.filter((entry) => entry.id !== id);
    return "deleted";
  });
}

// ── Questions ────────────────────────────────────────────────────

/** Only the viewer's own. A question can name a customer or paste an error
 *  with a token in it; it is between the person asking and the team. */
export async function listQuestions(viewer: string): Promise<QuestionView[]> {
  const key = accountKey(viewer);
  const { questions } = await store.read();
  return questions
    .filter((question) => accountKey(question.authorEmail) === key)
    .map(({ authorEmail: _author, ...view }) => view)
    .reverse();
}

export async function createQuestion(viewer: string, input: QuestionInput): Promise<QuestionView> {
  const question: StoredQuestion = {
    id: nanoid(10),
    subject: input.subject,
    body: input.body,
    authorEmail: viewer,
    createdAt: new Date().toISOString(),
  };
  await store.update((doc) => {
    doc.questions = capped([...doc.questions, question], CAPS.questions);
  });
  const { authorEmail: _author, ...view } = question;
  return view;
}

// ── Reviews ──────────────────────────────────────────────────────

export async function listReviews(
  viewer: string,
): Promise<{ reviews: ReviewView[]; summary: ReviewSummary }> {
  const { reviews } = await store.read();
  return {
    reviews: reviews.map((review) => reviewView(review, viewer)).reverse(),
    summary: summarizeReviews(reviews),
  };
}

/**
 * Whether this account should be asked for a review now.
 *
 * The first call for an account starts its clock, which is why this can
 * write. It only writes that once: every later call is a read, because the
 * shell asks on every page load.
 */
export async function reviewStatus(viewer: string, now = new Date()): Promise<ReviewStatus> {
  const key = accountKey(viewer);
  let cadence = (await store.read()).cadence[key];
  if (!cadence) {
    cadence = await store.update((doc) => {
      doc.cadence[key] ??= { firstSeenAt: now.toISOString() };
      return doc.cadence[key];
    });
  }
  return {
    due: reviewPromptDue(cadence, now),
    nextAt: nextReviewAt(cadence),
    lastReviewedAt: cadence.lastReviewedAt ?? null,
  };
}

export async function createReview(viewer: string, input: ReviewInput): Promise<ReviewView> {
  const key = accountKey(viewer);
  const review: StoredReview = {
    id: nanoid(10),
    rating: input.rating,
    text: input.text,
    authorEmail: viewer,
    createdAt: new Date().toISOString(),
  };
  await store.update((doc) => {
    doc.reviews = capped([...doc.reviews, review], CAPS.reviews);
    const previous = doc.cadence[key];
    // A review answers any pending snooze, so it is dropped rather than left
    // to hold back the prompt a quarter from now.
    doc.cadence[key] = {
      firstSeenAt: previous?.firstSeenAt ?? review.createdAt,
      lastReviewedAt: review.createdAt,
    };
  });
  return reviewView(review, viewer);
}

export async function snoozeReview(viewer: string, now = new Date()): Promise<ReviewStatus> {
  const key = accountKey(viewer);
  const cadence = await store.update((doc) => {
    const previous = doc.cadence[key];
    doc.cadence[key] = {
      ...previous,
      firstSeenAt: previous?.firstSeenAt ?? now.toISOString(),
      snoozedAt: now.toISOString(),
    };
    return doc.cadence[key];
  });
  return {
    due: reviewPromptDue(cadence, now),
    nextAt: nextReviewAt(cadence),
    lastReviewedAt: cadence.lastReviewedAt ?? null,
  };
}
