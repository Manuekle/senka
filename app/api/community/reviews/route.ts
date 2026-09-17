import { type NextRequest, NextResponse } from "next/server";
import { apiError, withApiErrors } from "@/lib/api-error";
import { parseReviewInput } from "@/lib/community";
import { forwardToTeam } from "@/lib/community-forward";
import {
  afterResponse,
  communityViewer,
  parseFailure,
  readJsonObject,
  submissionAllowed,
} from "@/lib/community-http";
import { createReview, listReviews, reviewStatus, snoozeReview } from "@/lib/community-store";

export const dynamic = "force-dynamic";

// GET   /api/community/reviews              — every review, the summary, and this account's cadence
// GET   /api/community/reviews?view=status  — only the cadence; what the shell asks on load
// POST  /api/community/reviews              — leave one ({ rating: 1–5, text })
// PATCH /api/community/reviews              — "later" ({ action: "snooze" })

export const GET = withApiErrors(async function GET(request: NextRequest) {
  const viewer = await communityViewer(request);
  if ("response" in viewer) return viewer.response;
  const status = await reviewStatus(viewer.email);
  if (request.nextUrl.searchParams.get("view") === "status") {
    return NextResponse.json({ status });
  }
  return NextResponse.json({ ...(await listReviews(viewer.email)), status });
});

export const POST = withApiErrors(async function POST(request: NextRequest) {
  const viewer = await communityViewer(request);
  if ("response" in viewer) return viewer.response;
  const body = await readJsonObject(request);
  if (!body) return apiError("invalid_json");
  const parsed = parseReviewInput(body);
  if (!parsed.ok) return parseFailure(parsed);
  if (!submissionAllowed(viewer.email)) return apiError("rate_limited");

  const review = await createReview(viewer.email, parsed.value);
  const locale = typeof body.locale === "string" ? body.locale : undefined;
  afterResponse(() =>
    forwardToTeam({ kind: "review", ...parsed.value }, { account: viewer.email, locale }),
  );
  return NextResponse.json({ review, status: await reviewStatus(viewer.email) });
});

export const PATCH = withApiErrors(async function PATCH(request: NextRequest) {
  const viewer = await communityViewer(request);
  if ("response" in viewer) return viewer.response;
  const body = await readJsonObject(request);
  if (!body) return apiError("invalid_json");
  if (body.action !== "snooze") return apiError("invalid_field", { field: "action" });
  return NextResponse.json({ status: await snoozeReview(viewer.email) });
});
